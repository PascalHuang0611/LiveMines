/**
 * AgentSettlementEngine.js
 * 負責處理 Milestone 7 & 8 中，AI Agent 依據公共開獎結果 (Public Result) 進行獨立結算的邏輯。
 * Bonus 一律採伺服器的「共用逐關開獎」流程 (playSharedBonus)：
 * 逐關收集全場押注 → 原生 4選2 → (風控啟用時) V3 強控介入 → 判定生死與 Cashout。
 */

/**
 * 共用二級玩法：逐關互動開獎 (V3 為可選介入，v3=null 時即純隨機開獎)
 * @param {Array} entrants [{agentId, bet, plannedLevel}] 押中觸發格的 Agent
 * @param {Object} config math config
 * @param {Object} riskV3Ctx { v3: V3Controller|null, windowBet, windowPayout }
 * @param {number} roundBet 本局全場總投注 (含閃電稅)
 * @param {number} roundMainPayout 本局主遊戲派彩 (base + lightning，僅 V3 預估 RTP 用)
 * @returns {{ perAgent: Map, levelHistory: Array, bonusLevelStats: Array, bonusSafeHits: Array }}
 */
function playSharedBonusV3(entrants, config, riskV3Ctx, roundBet, roundMainPayout) {
    const endLevel = config.bonusGame.endLevel;
    const payouts = config.bonusGame.levelSettings.payouts;
    const totalChoices = config.bonusGame.levelSettings.totalChoices;
    const winChoices = config.bonusGame.levelSettings.winChoices;
    const v3 = riskV3Ctx.v3;

    // 每人狀態
    const states = entrants.map(e => ({ ...e, alive: true, pick: 0 }));
    const perAgent = new Map(); // agentId → { bonusWin, isBonus, isGrand }
    entrants.forEach(e => perAgent.set(e.agentId, { bonusWin: 0, isBonus: false, isGrand: false }));

    const levelHistory = [];
    const bonusLevelStats = [];
    const bonusSafeHits = [0, 0, 0, 0];
    let bonusPaidSoFar = 0;

    for (let level = 0; level < endLevel; level++) {
        const nTotal = totalChoices[level];
        const nWin = winChoices[level];
        if (nTotal <= 0 || nWin <= 0) break;

        // 1. 存活者先選格，聚合各選項押注
        const optionBets = [0, 0, 0, 0, 0];
        const stat = { level: level + 1, cashedOutCount: 0, crashedCount: 0, continuedCount: 0, totalArrived: 0 };
        states.forEach(st => {
            if (!st.alive) return;
            st.pick = Math.floor(Math.random() * nTotal) + 1;
            optionBets[st.pick] += st.bet;
            stat.totalArrived++;
        });

        // 2. 原生 4選2 (洗牌取前 nWin)
        const opts = Array.from({ length: nTotal }, (_, i) => i + 1);
        for (let i = opts.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [opts[i], opts[j]] = [opts[j], opts[i]];
        }
        let survivors = opts.slice(0, nWin);

        // 3. V3 強控檢查 (本關派彩倍數 = payouts[level])
        let intervened = false, phaseCode = null;
        if (v3 && stat.totalArrived > 0) {
            const res = v3.maybeIntervene(level, [survivors[0], survivors[1]], optionBets,
                payouts[level] || 0, riskV3Ctx.windowBet, riskV3Ctx.windowPayout,
                roundBet, roundMainPayout, bonusPaidSoFar);
            survivors = res.survivors;
            intervened = res.intervened;
            phaseCode = res.phaseCode;
        }

        const safeSorted = [...survivors].sort((a, b) => a - b);
        safeSorted.forEach(spot => { if (spot - 1 < bonusSafeHits.length) bonusSafeHits[spot - 1]++; });
        levelHistory.push({ level: level + 1, pick: null, safe: safeSorted, passed: true, intervened, phaseCode });

        // 4. 各玩家判定 + 依 DNA 計畫 cashout
        states.forEach(st => {
            if (!st.alive) return;
            const hit = survivors.includes(st.pick);
            if (!hit) {
                st.alive = false;
                stat.crashedCount++;
                return;
            }
            const passLevel = level + 1;
            if (passLevel === st.plannedLevel || passLevel === endLevel) {
                // 抵達目標層 (或最終關) → 領獎離場
                const win = st.bet * payouts[passLevel - 1];
                const rec = perAgent.get(st.agentId);
                rec.bonusWin = win;
                rec.isBonus = true;
                rec.isGrand = passLevel === endLevel;
                bonusPaidSoFar += win;
                st.alive = false;
                stat.cashedOutCount++;
            } else {
                stat.continuedCount++;
            }
        });

        bonusLevelStats.push(stat);
        // 全滅後迴圈仍走完剩餘層數：世界線照開安全號碼 (UI 顯示 5 層)，但已無人可判定
    }

    return { perAgent, levelHistory, bonusLevelStats, bonusSafeHits };
}

export function calculateBatchSettlement(publicResult, agentDecisions, config, riskV3Ctx = null) {
    if (!publicResult || !agentDecisions || agentDecisions.length === 0) {
        return {
            totalWin: 0, baseWin: 0, lightningWin: 0, bonusWin: 0, jpWin: 0, newJpPool: publicResult?.newJpPool || 0, agentDetails: []
        };
    }

    let batchBaseWin = 0;
    let batchLightningWin = 0;
    let batchBonusWin = 0;
    let batchJpWin = 0;
    let agentDetails = [];

    // 1. 找出所有觸發 Bonus 的格子與成功通關 L5 的 Agent
    const triggerGridId = publicResult.bonusTriggered ? 
        publicResult.details.find(d => d.balls >= 3)?.grid : null;

    let l5Winners = []; // 存 { agentId, betAmount }
    let bonusEntrantsCount = 0;
    let totalBonusEntrantsBet = 0; // 進入 Bonus 關卡的所有人的總押注額

    // Bonus 一律走「共用逐關開獎」(對齊伺服器 playSharedBonus)；V3 未啟用時 v3=null 即純隨機開獎
    let sharedBonus = null;
    if (publicResult.bonusTriggered && triggerGridId) {
        const ctx = riskV3Ctx || { v3: null, windowBet: 0, windowPayout: 0 };
        const entrants = [];
        let preMainPayout = 0;
        const endLevel = config.bonusGame.endLevel;
        agentDecisions.forEach(decision => {
            Object.entries(decision.legalBetMap || {}).forEach(([gridIdStr, betAmount]) => {
                const gridId = parseInt(gridIdStr);
                // 主遊戲派彩預掃描僅 V3 預估 RTP 需要
                if (ctx.v3) {
                    const gridResult = publicResult.details.find(d => d.grid === gridId);
                    if (gridResult && gridResult.balls > 0) {
                        const base = betAmount * gridResult.basePayout;
                        let lMult = gridResult.baseL;
                        if (decision.buyLightning) lMult += gridResult.purchasedL;
                        preMainPayout += base + base * lMult;
                    }
                }
                if (gridId === triggerGridId) {
                    let planned = decision.plannedCashoutLevel || endLevel;
                    planned = Math.max(1, Math.min(endLevel, planned));
                    entrants.push({ agentId: decision.agentId, bet: betAmount, plannedLevel: planned });
                }
            });
        });
        if (entrants.length > 0) {
            sharedBonus = playSharedBonusV3(entrants, config, ctx, publicResult.cost || 0, preMainPayout);
        }
    }

    // bonusLevelStats 由共用開獎產生
    let bonusLevelStats = sharedBonus ? sharedBonus.bonusLevelStats : [];
    
    // 初始化 gridStats
    let gridStats = Array.from({length: 9}, (_, i) => ({
        id: i + 1,
        totalBet: 0,
        totalWin: 0
    }));

    // 2. 第一遍掃描：處理基礎派彩與收集 L5 贏家
    agentDecisions.forEach(decision => {
        let agentBaseWin = 0;
        let agentLightningWin = 0;
        let agentBonusWin = 0;
        let agentJpWin = 0;
        let agentWinDetails = [];

        // 遍歷該 Agent 下注的每一格
        Object.entries(decision.legalBetMap || {}).forEach(([gridIdStr, betAmount]) => {
            const gridId = parseInt(gridIdStr);
            const gridResult = publicResult.details.find(d => d.grid === gridId);
            
            // 累加 gridStats 的押注額 (閃電稅也算在內)
            let actualCost = betAmount;
            if (decision.buyLightning) {
                actualCost += actualCost * (config.mainGame.extraPurchaseCostPercent || 0.5);
            }
            gridStats[gridId - 1].totalBet += actualCost;

            let winBase = 0;
            let winLightning = 0;
            let winBonus = 0;
            let isBonus = false;
            // 顯示用的預計收手層 (實際判定在共用開獎 playSharedBonusV3 內完成)
            let cashoutLevel = decision.plannedCashoutLevel || config.bonusGame.endLevel;
            cashoutLevel = Math.max(1, Math.min(config.bonusGame.endLevel, cashoutLevel));

            if (gridResult && gridResult.balls > 0) {
                // Base Win 計算
                let basePayoutMult = gridResult.basePayout; // 從 publicResult 中取得該格基礎倍率
                winBase = betAmount * basePayoutMult;
                agentBaseWin += winBase;

                // Lightning Win 計算 (有買閃電才能拿 purchasedLightning 乘數)
                let lightningMult = gridResult.baseL;
                if (decision.buyLightning) {
                    lightningMult += gridResult.purchasedL;
                }
                winLightning = winBase * lightningMult;
                agentLightningWin += winLightning;

                // Bonus Win (Second Level Play) 計算
                if (publicResult.bonusTriggered && gridId === triggerGridId) {
                    bonusEntrantsCount++; // 紀錄有參與 Bonus 的人數
                    totalBonusEntrantsBet += betAmount; // 累加參與者的押注額，作為 JP 分發的分母

                    // 共用逐關開獎已判定，直接取結果
                    if (sharedBonus) {
                        const rec = sharedBonus.perAgent.get(decision.agentId);
                        if (rec && rec.isBonus) {
                            winBonus = rec.bonusWin;
                            agentBonusWin += winBonus;
                            isBonus = true;
                            if (rec.isGrand) {
                                l5Winners.push({ agentId: decision.agentId, betAmount: betAmount });
                            }
                        }
                    }
                }
            }

            // 紀錄該格子該 Agent 贏的總額
            gridStats[gridId - 1].totalWin += (winBase + winLightning + winBonus);

            // 紀錄明細 (不管有沒有中獎都要紀錄，才能在 UI 點擊格子時顯示投資名單)
            agentWinDetails.push({
                gridId, betAmount, winBase, winLightning, winBonus, isBonus, cashoutLevel
            });
        });

        batchBaseWin += agentBaseWin;
        batchLightningWin += agentLightningWin;
        batchBonusWin += agentBonusWin;

        let totalCost = decision.legalTotalBetAmount || 0;
        if (decision.buyLightning) {
            totalCost += totalCost * (config.mainGame.extraPurchaseCostPercent || 0.5);
        }
        totalCost = Math.round(totalCost * 100) / 100;

        agentDetails.push({
            agentId: decision.agentId,
            persona: decision.persona,
            vipGroup: decision.vipGroup,
            dna: decision.dna,
            buyLightning: decision.buyLightning,
            plannedCashoutLevel: decision.plannedCashoutLevel, // ADDED for the modal
            cost: totalCost,
            baseWin: agentBaseWin,
            lightningWin: agentLightningWin,
            bonusWin: agentBonusWin,
            jpWin: 0, // 稍後分配
            totalWin: agentBaseWin + agentLightningWin + agentBonusWin,
            netProfit: 0, // 稍後計算
            details: agentWinDetails
        });
    });

    // 3. 處理 JP 分配 (Milestone 9: JP Candidate Share)
    let finalNewJpPool = publicResult.newJpPool; // 預設沿用 SimulationEngine 算出的 JpPool (如果沒中大獎)
    let availableJp = 0;

    if (publicResult.bonusTriggered) {
        // 如果觸發 Bonus，此局原本可以分配的總 JP 獎金，是進入遊戲前的 JpPool + JP Win (如果有通關的話)
        availableJp = (publicResult.newJpPool || 0) + (publicResult.jpWin || 0);
        
        if (availableJp > 0 && totalBonusEntrantsBet > 0) {
            
            // 只有成功通關 L5 並且打算在 L5 提現的人，才能拿走自己的那一份
            if (l5Winners.length > 0) {
                l5Winners.forEach(winner => {
                    const detail = agentDetails.find(d => d.agentId === winner.agentId);
                    if (detail) {
                        // 根據該玩家的押注額佔全部進入 Bonus 玩家押注額的比例，分配 JP
                        const individualJpShare = availableJp * (winner.betAmount / totalBonusEntrantsBet);
                        
                        detail.jpWin = individualJpShare;
                        detail.totalWin += individualJpShare;
                        batchJpWin += individualJpShare;
                        
                        // JP 贏分也算在觸發那格的 totalWin
                        if (triggerGridId) {
                            gridStats[triggerGridId - 1].totalWin += individualJpShare;
                        }
                    }
                });
            }
            // 沒有被贏家拿走的份額 (提早離場或中途死亡的)，就會留在獎池中滾入下一局
            finalNewJpPool = availableJp - batchJpWin;
        }
    }

    // 4. 計算 Net Profit 並四捨五入
    agentDetails.forEach(d => {
        d.netProfit = Math.round((d.totalWin - d.cost) * 100) / 100;
        d.totalWin = Math.round(d.totalWin * 100) / 100;
        d.baseWin = Math.round(d.baseWin * 100) / 100;
        d.lightningWin = Math.round(d.lightningWin * 100) / 100;
        d.bonusWin = Math.round(d.bonusWin * 100) / 100;
    });

    batchBaseWin = Math.round(batchBaseWin * 100) / 100;
    batchLightningWin = Math.round(batchLightningWin * 100) / 100;
    batchBonusWin = Math.round(batchBonusWin * 100) / 100;
    batchJpWin = Math.round(batchJpWin * 100) / 100;
    finalNewJpPool = Math.round(finalNewJpPool * 100) / 100;

    return {
        totalWin: batchBaseWin + batchLightningWin + batchBonusWin + batchJpWin,
        baseWin: batchBaseWin,
        lightningWin: batchLightningWin,
        bonusWin: batchBonusWin,
        jpWin: batchJpWin,
        availableJp: availableJp,
        newJpPool: finalNewJpPool,
        agentDetails,
        bonusLevelStats,
        gridStats,
        // 共用開獎產生的權威世界線 (含 V3 intervened 標記) 與安全號碼統計，覆蓋 publicResult 的暫定版本
        bonusLevelHistory: sharedBonus ? sharedBonus.levelHistory : publicResult.bonusLevelHistory,
        bonusSafeHits: sharedBonus ? sharedBonus.bonusSafeHits : publicResult.bonusSafeHits
    };
}
