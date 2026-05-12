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
 * 整合：產生單一 Agent 的本局決策物件 (Milestone 5 MVP)
 */
export function buildAgentRoundDecision(agentState, scenario, appConfig) {
    const targetCount = decideTargetGridCount(agentState, scenario);
    const selectedGrids = decideBetGrids(agentState, targetCount);
    const totalBetAmountRaw = decideTotalBetAmount(agentState, scenario);
    const rawBetMap = distributeBetAmountRaw(agentState, selectedGrids, totalBetAmountRaw);

    return {
        agentId: agentState.agentId,
        persona: agentState.persona,
        selectedGrids,
        rawBetMap,
        totalBetAmountRaw,
        // Milestone 6 才實作：合法面額 chipMap、Lightning、Cashout 等
    };
}
