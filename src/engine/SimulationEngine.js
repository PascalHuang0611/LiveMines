// src/engine/SimulationEngine.js

import { sampleWeightedWithoutReplacement } from './AgentDecisionEngine.js';
import { emptyV4Entry } from './RiskScoreEngine.js';

export function sampleWithoutReplacement(arr, n) {
    let result = [...arr];
    for (let i = result.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [result[i], result[j]] = [result[j], result[i]];
    }
    return result.slice(0, n);
}

export function getWeightedRandom(featureConfig) {
    const values = featureConfig.values;
    const weights = featureConfig.weights;
    const totalWeight = weights.reduce((sum, w) => sum + w, 0);
    let rand = Math.random() * totalWeight; // 不可取整數：權重若為小數 (如 0.56/0.44)，取整會恆選第一組
    for (let i = 0; i < weights.length; i++) {
        if (rand < weights[i]) return values[i];
        rand -= weights[i];
    }
    return values[0];
}

/**
 * 執行單局遊戲模擬
 * @param {Object} payload 
 * @returns {Object} RoundResult
 */
export function simulateRound(payload) {
    const {
        roundNum,
        currentCost,
        baseBetUnit,
        config,
        grids, // [{id, bet}, ...]
        buyExtraLightning,
        bonusTargetLevel,
        bonusPositions,
        forcedDrops, // [pos1, pos2, pos3] or null
        currentJpPool,
        simulationMode,
        riskV3 = null, // { v3: V3Controller, windowBet, windowPayout } 手動模式 JP 強控用；人流模式由結算引擎處理
        gridWeights = null // { free: [9], paid: [9] } V4 位置權重 (上一局重算結果)；null = 均勻
    } = payload;

    const allGridIds = [1, 2, 3, 4, 5, 6, 7, 8, 9];

    let localGrids = Array.from({length: 9}, (_, i) => ({
        id: i + 1,
        betAmount: grids[i].betAmount || 0, // 每格各自獨立的押注金額
        bet: (grids[i].betAmount || 0) > 0, // 與原來相容
        balls: 0,
        baseLightning: 0,
        purchasedLightning: 0
    }));

    let jpContribution = currentCost * config.bonusGame.jp_contribution_rate;
    let newJpPool = currentJpPool + jpContribution;

    // --- Lightning Feature ---
    // 落點抽格: V4 權重存在時依權重不放回抽格，否則均勻隨機
    const drawStrikeIds = (n, weights) => {
        if (weights && weights.length === 9) {
            return sampleWeightedWithoutReplacement(allGridIds, weights, n);
        }
        return sampleWithoutReplacement(allGridIds, n);
    };
    // 倍率組合先洗牌再 1:1 綁定落點 (對齊 rtpsim)：避免組合順序與權重高低產生相關性
    const shuffledCombo = (combo) => {
        const c = [...combo];
        for (let i = c.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [c[i], c[j]] = [c[j], c[i]];
        }
        return c;
    };

    // 免費閃電: 依權重抽一組倍率組合 (如 [1,1])，道數 = 組合長度 (規則與付費閃電相同)
    const baseCombo = shuffledCombo(getWeightedRandom(config.lightningFeature.payoutMultipliers));
    let numBaseStrikes = baseCombo.length;
    const baseStrikeIds = drawStrikeIds(numBaseStrikes, gridWeights ? gridWeights.free : null);

    let baseLightningHits = Array(9).fill(0);
    baseStrikeIds.forEach((id, k) => {
        localGrids[id - 1].baseLightning = baseCombo[k];
        baseLightningHits[id - 1]++;
    });

    let numPurchasedStrikes = 0;
    let purchasedLightningHits = Array(9).fill(0);
    if (buyExtraLightning) {
        // 付費閃電: 依權重抽一組倍率組合 (如 [1,1,3])，道數 = 組合長度
        const purchasedCombo = shuffledCombo(getWeightedRandom(config.purchasedLightningFeature.payoutMultipliers));
        numPurchasedStrikes = purchasedCombo.length;
        const purchasedStrikeIds = drawStrikeIds(numPurchasedStrikes, gridWeights ? gridWeights.paid : null);
        purchasedStrikeIds.forEach((id, k) => {
            localGrids[id - 1].purchasedLightning = purchasedCombo[k];
            purchasedLightningHits[id - 1]++;
        });
    }

    let totalStrikesThisRound = numBaseStrikes + numPurchasedStrikes;

    // --- Ball Drops ---
    if (forcedDrops && forcedDrops.length > 0) {
        forcedDrops.forEach(ballPos => {
            let idx = ballPos - 1;
            if (idx >= 0 && idx < 9) {
                localGrids[idx].balls += 1;
            }
        });
    } else {
        for (let i = 0; i < config.mainGame.numberOfBalls; i++) {
            let targetIdx = Math.floor(Math.random() * config.mainGame.numberOfGrids);
            localGrids[targetIdx].balls += 1;
        }
    }

    // --- Calculations ---
    let totalWin = 0;
    let roundBaseWin = 0;
    let roundLightningWin = 0;
    let roundBonusWin = 0;
    let jpWin = 0; 
    let details = [];
    
    let bonusTriggered = false;
    let bonusSuccess = false;
    let bonusWin = 0;
    let bonusResultText = "";
    let bonusLevelHistory = null; 

    let hasThreeSame = false;
    let hasTwoSame = false;
    let gridHits = Array(9).fill(0);
    let bonusSafeHits = Array(4).fill(0);

    // V4 記帳條目 (手動/單機模式口徑: 整桌 = 單一玩家；人流模式由結算引擎以真實買家口徑重建)
    const v4Entry = emptyV4Entry();
    v4Entry.totalBet = currentCost;
    v4Entry.extraPlayers = buyExtraLightning ? 1 : 0;

    // 第一遍: 主遊戲派彩 (base + lightning)。先於 Bonus 計算對齊伺服器順序，
    // V3 強控需要以「本局主遊戲派彩」預估派彩後 RTP
    localGrids.forEach(g => {
        gridHits[g.id - 1] += g.balls;

        if (g.balls === 3) hasThreeSame = true;
        if (g.balls === 2) hasTwoSame = true;

        if (g.betAmount > 0) {
            v4Entry.mainBet[g.id - 1] += g.betAmount;
            if (buyExtraLightning) v4Entry.extraMainBet[g.id - 1] += g.betAmount;
        }

        // Base Game Payouts
        if (g.betAmount > 0 && g.balls > 0) {
            let payoutIndex = Math.min(g.balls - 1, config.mainGame.singleAreaBasePayouts.length - 1);
            let payout = config.mainGame.singleAreaBasePayouts[payoutIndex];

            let baseWinPart = g.betAmount * payout;
            let lightningWinPart = baseWinPart * (g.baseLightning + g.purchasedLightning);
            let cellTotalWin = baseWinPart + lightningWinPart;

            roundBaseWin += baseWinPart;
            roundLightningWin += lightningWinPart;
            totalWin += cellTotalWin;

            // V4 口徑: mainPayout = 基礎 + 免費閃電增量；extraInc = 付費閃電增量；
            // stack = 免費+付費同格疊加時的付費增量
            const freeInc = baseWinPart * g.baseLightning;
            const paidInc = baseWinPart * g.purchasedLightning;
            v4Entry.mainPayout[g.id - 1] += baseWinPart + freeInc;
            v4Entry.extraIncPayout[g.id - 1] += paidInc;
            if (g.baseLightning > 0 && g.purchasedLightning > 0) {
                v4Entry.stackPayout[g.id - 1] += paidInc;
            }

            details.push({
                grid: g.id,
                balls: g.balls,
                betAmount: g.betAmount, // 該格實際押注金額
                basePayout: payout,
                baseL: g.baseLightning,
                purchasedL: g.purchasedLightning,
                win: cellTotalWin
            });
        }
    });

    // 第二遍: Bonus Game (同格 3 球且有押注)
    localGrids.forEach(g => {
        if (!(g.betAmount > 0 && g.balls === 3)) return;

        bonusTriggered = true;
        bonusLevelHistory = [];

        let currentLevel = 0;
        let targetLevel = bonusTargetLevel === 'all' ? config.bonusGame.endLevel : bonusTargetLevel;
        let alive = true;

        for (let lvl = 0; lvl < targetLevel; lvl++) {
            let totalChoices = config.bonusGame.levelSettings.totalChoices[lvl];
            let winChoices = config.bonusGame.levelSettings.winChoices[lvl];
            let userPick = bonusPositions[lvl];

            let allPositions = Array.from({length: totalChoices}, (_, i) => i + 1);
            let winningSpots = sampleWithoutReplacement(allPositions, winChoices);

            // V3 JP 開獎強控 (僅手動/單機模式；人流模式由 AgentSettlementEngine 的共用開獎處理)
            let intervened = false;
            if (riskV3 && riskV3.v3 && simulationMode !== 'agentTraffic'
                && totalChoices === 4 && winningSpots.length === 2) {
                const optionBets = [0, 0, 0, 0, 0];
                optionBets[userPick] = g.betAmount;
                const payoutMult = config.bonusGame.levelSettings.payouts[lvl] || 0;
                const res = riskV3.v3.maybeIntervene(lvl, [winningSpots[0], winningSpots[1]], optionBets,
                    payoutMult, riskV3.windowBet, riskV3.windowPayout,
                    currentCost, roundBaseWin + roundLightningWin, 0);
                winningSpots = res.survivors;
                intervened = res.intervened;
            }

            winningSpots.forEach(spot => {
                if (spot - 1 < bonusSafeHits.length) {
                    bonusSafeHits[spot - 1]++;
                }
            });

            let passed = winningSpots.includes(userPick);

            bonusLevelHistory.push({
                level: lvl + 1,
                pick: userPick,
                safe: [...winningSpots].sort((a, b) => a - b),
                passed: passed,
                intervened: intervened
            });

            if (simulationMode === 'agentTraffic' || passed) {
                currentLevel++;
            } else {
                alive = false;
                break;
            }
        }

        if (alive) {
            bonusSuccess = true;
            let payoutMult = config.bonusGame.levelSettings.payouts[targetLevel - 1];
            bonusWin = g.betAmount * payoutMult; // 用觸發格的押注金額
            bonusResultText = `成功通關第 ${targetLevel} 層！獲得 ${payoutMult} 倍`;

            if (targetLevel === config.bonusGame.endLevel) {
                jpWin = newJpPool;
                newJpPool = 0;
            }
        } else {
            bonusSuccess = false;
            bonusWin = 0;
            bonusResultText = `在第 ${currentLevel + 1} 層觸雷失敗，獎金歸零`;
        }

        roundBonusWin += bonusWin;
        totalWin += (bonusWin + jpWin);
    });

    let patternResult = 'allDifferent';
    if (hasThreeSame) patternResult = 'threeSame';
    else if (hasTwoSame) patternResult = 'twoSame';

    return Object.freeze({
        round: roundNum,
        cost: currentCost,
        totalWin: totalWin,
        netProfit: totalWin - currentCost,
        
        baseWin: roundBaseWin,
        lightningWin: roundLightningWin,
        bonusWin: roundBonusWin,
        jpWin: jpWin,
        
        jpContribution: jpContribution,
        newJpPool: newJpPool,
        
        details: details,
        bonusTriggered: bonusTriggered,
        bonusSuccess: bonusSuccess,
        bonusResultText: bonusResultText,
        bonusLevelHistory: bonusLevelHistory, 
        
        finalGridsState: localGrids,
        
        // V4 風險分數記帳 (手動模式口徑；人流模式請改用結算引擎回傳的 v4Entry)
        v4Entry: v4Entry,

        // 供 accumulateStats 使用的內部數據
        gridHits: gridHits,
        baseLightningHits: baseLightningHits,
        purchasedLightningHits: purchasedLightningHits,
        bonusSafeHits: bonusSafeHits,
        totalStrikesThisRound: totalStrikesThisRound,
        patternResult: patternResult
    });
}

/**
 * 輔助函式：將單局結果累加到統計物件中
 */
export function accumulateStats(stats, result) {
    if (!stats || !result) return;

    stats.totalBet += result.cost;
    stats.totalWin += result.totalWin;
    stats.totalBaseWin += result.baseWin;
    stats.totalLightningWin += result.lightningWin;
    stats.totalBonusWin += result.bonusWin;
    stats.totalJpWin += result.jpWin;

    if (result.newJpPool !== undefined) {
        stats.totalJpPool = result.newJpPool;
    } else {
        stats.totalJpPool += result.jpContribution;
        if (result.jpWin > 0) {
            stats.totalJpPool = 0;
        }
    }

    result.gridHits.forEach((hits, idx) => {
        stats.gridHits[idx] += hits;
    });

    result.baseLightningHits.forEach((hits, idx) => {
        stats.lightningHits[idx] += hits;
    });
    result.purchasedLightningHits.forEach((hits, idx) => {
        stats.lightningHits[idx] += hits;
    });

    result.bonusSafeHits.forEach((hits, idx) => {
        if(idx < stats.bonusSafeHits.length) {
            stats.bonusSafeHits[idx] += hits;
        }
    });

    stats.strikeCounts[result.totalStrikesThisRound] = (stats.strikeCounts[result.totalStrikesThisRound] || 0) + 1;

    if (result.patternResult === 'threeSame') stats.patterns.threeSame++;
    else if (result.patternResult === 'twoSame') stats.patterns.twoSame++;
    else stats.patterns.allDifferent++;
}
