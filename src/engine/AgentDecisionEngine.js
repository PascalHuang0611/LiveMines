// src/engine/AgentDecisionEngine.js

/**
 * 根據權重進行不放回隨機抽樣
 * @param {Array} items 項目陣列
 * @param {Array} weights 權重陣列 (應與 items 長度相同，若全為 0 將使用均勻分佈)
 * @param {number} count 要抽取的數量
 * @returns {Array} 抽出的項目陣列
 */
export function sampleWeightedWithoutReplacement(items, weights, count) {
    if (count <= 0 || items.length === 0) return [];
    if (count >= items.length) return [...items];

    let currentWeights = [...weights];
    
    // 如果權重陣列無效或總和為0，改用均勻分佈
    const totalWeight = currentWeights.reduce((a, b) => a + b, 0);
    if (totalWeight <= 0) {
        currentWeights = Array(items.length).fill(1 / items.length);
    }

    const selected = [];
    const remainingIndices = items.map((_, i) => i);

    for (let i = 0; i < count; i++) {
        const sum = currentWeights.reduce((a, b) => a + b, 0);
        if (sum <= 0) break; // 防呆

        let random = Math.random() * sum;
        let selectedIdx = -1;

        for (let j = 0; j < remainingIndices.length; j++) {
            const idx = remainingIndices[j];
            if (random < currentWeights[idx]) {
                selectedIdx = j;
                break;
            }
            random -= currentWeights[idx];
        }

        // 萬一有浮點數精度問題沒選到，選最後一個
        if (selectedIdx === -1) {
            selectedIdx = remainingIndices.length - 1;
        }

        const actualItemIndex = remainingIndices[selectedIdx];
        selected.push(items[actualItemIndex]);

        // 不放回：移除該選項的權重與索引
        currentWeights[actualItemIndex] = 0;
        remainingIndices.splice(selectedIdx, 1);
    }

    return selected;
}

/**
 * 決定押幾格
 */
export function decideTargetGridCount(agentState, scenario) {
    let count = Number(agentState.dna.LiveMines_Target_Grids) || 1;

    if (scenario.gridBehavior === 'conservative') count *= 0.8;
    if (scenario.gridBehavior === 'aggressive') count *= 1.15;

    return Math.max(1, Math.min(9, Math.round(count)));
}

/**
 * 決定押哪些格
 */
export function decideBetGrids(agentState, targetCount) {
    const gridIds = [1, 2, 3, 4, 5, 6, 7, 8, 9];
    const weights = agentState.dna.Grid_Preferences;
    return sampleWeightedWithoutReplacement(gridIds, weights, targetCount);
}

/**
 * 決定本局總下注額
 */
export function decideTotalBetAmount(agentState, scenario) {
    let amount = agentState.currentBetAmount || agentState.dna.Avg_Bet_Amount;

    // TODO: 目前 Milestone 5 尚無 settlement 更新 lastRoundNetProfit 狀態，
    // 因此 lastRoundNetProfit 預設為 0，以下邏輯暫時不會觸發，保留為 Milestone 8 使用。
    if (agentState.lastRoundNetProfit < 0) {
        amount *= agentState.dna.Martingale_Multiplier;
    }

    if (agentState.lastRoundNetProfit > agentState.dna.Avg_Bet_Amount * 2) {
        amount *= agentState.dna.Win_Retrench_Ratio;
    }

    amount *= scenario.betAmountMultiplier || 1;

    const maxBet = scenario.maxAgentBetAmount || Infinity;
    return Math.max(1, Math.min(amount, maxBet));
}

/**
 * 決定單格下注分配 (Raw Amount，尚未做面額合法化)
 */
export function distributeBetAmountRaw(agentState, selectedGrids, totalBetAmount) {
    const result = {};
    if (selectedGrids.length === 0) return result;

    if (agentState.dna.Bet_Distribution_Type === 'anchor' && selectedGrids.length > 1) {
        const anchorGrid = selectedGrids[0]; // 第一個選到的視為主格
        const anchorAmount = totalBetAmount * (Number(agentState.dna.Anchor_Bet_Ratio) || 0.8);
        const restAmount = totalBetAmount - anchorAmount;
        const eachRest = restAmount / (selectedGrids.length - 1);

        selectedGrids.forEach(grid => {
            result[grid] = grid === anchorGrid ? anchorAmount : eachRest;
        });
    } else {
        // Equal distribution fallback
        const each = totalBetAmount / selectedGrids.length;
        selectedGrids.forEach(grid => {
            result[grid] = each;
        });
    }

    return result;
}


/**
 * 決定是否購買 Lightning
 */
export function decideLightning(agentState) {
    const prob = Number(agentState.dna.Buy_Lightning_Prob) || 0;
    return Math.random() < prob;
}

/**
 * 決定 Cashout 策略
 * @returns {Number|null} 1~5 代表預計在該階段停扣，null 代表不提早 Cashout
 */
export function decideCashoutStrategy(agentState) {
    let stopLevel = Number(agentState.dna.Cashout_Stop_Level) || 5;
    
    // 嚴格遵守 DNA 設定的 Cashout_Stop_Level 作為收手目標基準
    // 確保不會發生錯誤衝到最後一關的 Bug
    return Math.max(1, Math.min(5, Math.round(stopLevel)));
}

/**
 * 將 rawAmount 依據 DNA 籌碼偏好權重 (Weighted) 分配成合法的實體面額籌碼
 * @param {Number} rawAmount 
 * @param {Array} dnaWeights - 長度 7 的權重陣列 [w5, w10, w50, w100, w500, w1k, w10k]
 */
export function legalizeChips(rawAmount, dnaWeights) {
    const denoms = [5, 10, 50, 100, 500, 1000, 10000];
    
    // 如果權重無效或長度不符，給予預設均勻權重
    let weights = Array.isArray(dnaWeights) && dnaWeights.length === 7 ? [...dnaWeights] : [1,1,1,1,1,1,1];
    
    // 1. 強制對齊最小面額 (5)
    // 這樣做可以保證後續的 while 迴圈一定能完美除盡，不會產生找不開的餘數
    let remaining = Math.round(rawAmount / 5) * 5;
    if (remaining <= 0) remaining = 5; // 至少下注 5 元
    
    const chipMap = { 5: 0, 10: 0, 50: 0, 100: 0, 500: 0, 1000: 0, 10000: 0 };
    let legalTotal = 0;

    // 將面額與權重組合並依照面額降冪排序 (大到小)，方便過濾
    const denomObjects = denoms.map((d, i) => ({ denom: d, weight: weights[i] })).sort((a, b) => b.denom - a.denom);

    while (remaining > 0) {
        // 過濾出不大於剩餘金額的面額
        const validOptions = denomObjects.filter(opt => opt.denom <= remaining);
        if (validOptions.length === 0) break; // 理論上不會發生，因為最小面額是 5 且 remaining 是 5 的倍數

        // 檢查 validOptions 的權重總和
        const totalWeight = validOptions.reduce((sum, opt) => sum + opt.weight, 0);
        
        let selectedDenom;
        if (totalWeight <= 0) {
            // 如果所有合法選項的權重都是 0，退化成 Greedy (直接選最大的合法面額)
            selectedDenom = validOptions[0].denom;
        } else {
            // 根據權重隨機挑選一個面額
            let random = Math.random() * totalWeight;
            selectedDenom = validOptions[validOptions.length - 1].denom; // fallback
            for (const opt of validOptions) {
                if (random < opt.weight) {
                    selectedDenom = opt.denom;
                    break;
                }
                random -= opt.weight;
            }
        }

        // 丟入一顆籌碼
        chipMap[selectedDenom]++;
        legalTotal += selectedDenom;
        remaining -= selectedDenom;
    }

    return { chipMap, legalTotal };
}

/**
 * 整合：產生單一 Agent 的本局決策物件 (Milestone 5 MVP)
 */
export function buildAgentRoundDecision(agentState, scenario, appConfig) {
    const targetCount = decideTargetGridCount(agentState, scenario);
    const selectedGrids = decideBetGrids(agentState, targetCount);
    const totalBetAmountRaw = decideTotalBetAmount(agentState, scenario);
    const rawBetMap = distributeBetAmountRaw(agentState, selectedGrids, totalBetAmountRaw);

    const buyLightning = decideLightning(agentState);
    const plannedCashoutLevel = decideCashoutStrategy(agentState);

    // 把 rawBetMap 轉成 legalBetMap 與 chipMap
    const legalBetMap = {};
    const fullChipMap = {};
    let legalTotalBetAmount = 0;

    // DNA 中提供的可能是字串，需要解析成陣列
    let dnaWeights = [];
    try {
        if (typeof agentState.dna.Chip_Denomination_Weights === 'string') {
            dnaWeights = JSON.parse(agentState.dna.Chip_Denomination_Weights);
        } else if (Array.isArray(agentState.dna.Chip_Denomination_Weights)) {
            dnaWeights = agentState.dna.Chip_Denomination_Weights;
        }
    } catch(e) {
        dnaWeights = [];
    }

    Object.entries(rawBetMap).forEach(([gridId, rawAmt]) => {
        const { chipMap, legalTotal } = legalizeChips(rawAmt, dnaWeights);
        legalBetMap[gridId] = legalTotal;
        fullChipMap[gridId] = chipMap;
        legalTotalBetAmount += legalTotal;
    });

    return {
        agentId: agentState.agentId,
        persona: agentState.persona,
        vipGroup: agentState.dna.VIP_Group,
        dna: agentState.dna,
        selectedGrids,
        rawBetMap,
        totalBetAmountRaw,
        legalBetMap,
        fullChipMap,
        legalTotalBetAmount,
        buyLightning,
        plannedCashoutLevel
    };
}
