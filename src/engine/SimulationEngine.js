// src/engine/SimulationEngine.js

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
    let rand = Math.floor(Math.random() * totalWeight);
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
        simulationMode
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
    // 免費閃電: 依權重抽一組倍率組合 (如 [1,1])，道數 = 組合長度，依序打到均勻抽出的格子上 (規則與付費閃電相同)
    const baseCombo = getWeightedRandom(config.lightningFeature.payoutMultipliers);
    let numBaseStrikes = baseCombo.length;
    const baseStrikeIds = sampleWithoutReplacement(allGridIds, numBaseStrikes);

    let baseLightningHits = Array(9).fill(0);
    baseStrikeIds.forEach((id, k) => {
        localGrids[id - 1].baseLightning = baseCombo[k];
        baseLightningHits[id - 1]++;
    });

    let numPurchasedStrikes = 0;
    let purchasedLightningHits = Array(9).fill(0);
    if (buyExtraLightning) {
        // 付費閃電: 依權重抽一組倍率組合 (如 [1,1,3])，道數 = 組合長度，依序打到均勻抽出的格子上
        const purchasedCombo = getWeightedRandom(config.purchasedLightningFeature.payoutMultipliers);
        numPurchasedStrikes = purchasedCombo.length;
        const purchasedStrikeIds = sampleWithoutReplacement(allGridIds, numPurchasedStrikes);
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

    localGrids.forEach(g => {
        gridHits[g.id - 1] += g.balls;
        
        if (g.balls === 3) hasThreeSame = true;
        if (g.balls === 2) hasTwoSame = true;

        // Bonus Game Logic
        if (g.betAmount > 0 && g.balls === 3) {
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
                
                winningSpots.forEach(spot => {
                    if (spot - 1 < bonusSafeHits.length) {
                        bonusSafeHits[spot - 1]++;
                    }
                });

                let passed = winningSpots.includes(userPick);
                
                bonusLevelHistory.push({
                    level: lvl + 1,
                    pick: userPick,
                    safe: winningSpots.sort((a, b) => a - b),
                    passed: passed
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
        bonusWin: bonusWin,
        bonusResultText: bonusResultText,
        bonusLevelHistory: bonusLevelHistory, 
        
        finalGridsState: localGrids,
        
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
