/**
 * AgentSettlementEngine.js
 * 負責處理 Milestone 7 & 8 中，AI Agent 依據公共開獎結果 (Public Result) 進行獨立結算的邏輯。
 */

export function calculateBatchSettlement(publicResult, agentDecisions, config) {
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

    let l5Winners = [];
    let bonusEntrantsCount = 0;

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

            let winBase = 0;
            let winLightning = 0;
            let winBonus = 0;
            let isBonus = false;
            let cashoutLevel = decision.plannedCashoutLevel || 1;

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
                    bonusEntrantsCount++; // 紀錄有參與 Bonus 的人數 (計算 JP Share 分母)
                    
                    // 檢查公共結果的通關歷史，看是否有成功存活到 cashoutLevel
                    let survived = true;
                    for (let i = 0; i < cashoutLevel; i++) {
                        // bonusLevelHistory 是一個包含 {passed: boolean} 的物件陣列
                        if (!publicResult.bonusLevelHistory[i] || !publicResult.bonusLevelHistory[i].passed) {
                            survived = false;
                            break;
                        }
                    }

                    if (survived) {
                        let bonusPayoutMult = config.bonusGame.levelSettings.payouts[cashoutLevel - 1];
                        winBonus = betAmount * bonusPayoutMult;
                        agentBonusWin += winBonus;
                        isBonus = true;

                        // 如果通關 L5，則擁有分配 JP 的資格
                        if (cashoutLevel === config.bonusGame.endLevel) {
                            l5Winners.push(decision);
                        }
                    }
                }
            }

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

    if (publicResult.bonusTriggered) {
        // 如果觸發 Bonus，此局原本可以分配的總 JP 獎金，是進入遊戲前的 JpPool + JP Win (如果有通關的話)
        const availableJp = (publicResult.newJpPool || 0) + (publicResult.jpWin || 0);
        
        if (availableJp > 0 && bonusEntrantsCount > 0) {
            // 每個人可以分到的份額
            const individualJpShare = availableJp / bonusEntrantsCount;
            
            // 只有成功通關 L5 並且打算在 L5 提現的人，才能拿走自己的那一份
            if (l5Winners.length > 0) {
                batchJpWin = individualJpShare * l5Winners.length;
                
                l5Winners.forEach(winnerDecision => {
                    const detail = agentDetails.find(d => d.agentId === winnerDecision.agentId);
                    if (detail) {
                        detail.jpWin = individualJpShare;
                        detail.totalWin += individualJpShare;
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
        newJpPool: finalNewJpPool,
        agentDetails
    };
}
