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
 * Box-Muller 轉換演算法，產生常態分佈的隨機數
 * @param {number} mean 期望值
 * @param {number} std 標準差
 * @returns {number}
 */
export function gaussianRandom(mean, std) {
    if (std === 0) return mean;
    let u = 0, v = 0;
    while (u === 0) u = Math.random(); // 轉換 [0,1) 為 (0,1)
    while (v === 0) v = Math.random();
    let num = Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
    return num * std + mean;
}

/**
 * 決定押幾格
 */
export function decideTargetGridCount(agentState, scenario) {
    let mean = Number(agentState.dna.LiveMines_Target_Grids) || 1;
    let std = Number(agentState.dna.Grid_Count_Std) || 0;
    
    // 套用常態分佈隨機取樣
    let count = gaussianRandom(mean, std);

    if (scenario.gridBehavior === 'conservative') count *= 0.8;
    if (scenario.gridBehavior === 'aggressive') count *= 1.15;

    // 確保格子數在合法範圍內 1~9，且為整數
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
    let mean = Number(agentState.dna.Avg_Bet_Amount) || 10;
    let std = Number(agentState.dna.Bet_Amount_Std) || 0;
    
    // 如果有當前押注額(來自追注等策略)則以此為均值，否則使用 DNA 平均值並套用常態分佈
    let amount = agentState.currentBetAmount || gaussianRandom(mean, std);

    // TODO: 目前 Milestone 5 尚無 settlement 更新 lastRoundNetProfit 狀態，
    // 因此 lastRoundNetProfit 預設為 0，以下邏輯暫時不會觸發，保留為 Milestone 8 使用。
    if (agentState.lastRoundNetProfit < 0) {
        amount *= Number(agentState.dna.Martingale_Multiplier) || 1;
    }

    if (agentState.lastRoundNetProfit > mean * 2) {
        amount *= Number(agentState.dna.Win_Retrench_Ratio) || 1;
    }

    amount *= scenario.betAmountMultiplier || 1;

    const maxBet = scenario.maxAgentBetAmount || Infinity;
    
    // 防呆：不可能押負數或零，最少 0.01 或 1。這裡暫以 1 為底線，並四捨五入至小數點第二位以求真實感
    return Math.max(0.1, Math.min(Math.round(amount * 100) / 100, maxBet));
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
 * @param {Array} dnaWeights - 權重陣列
 * @param {Array} dnaDenoms - 籌碼面額陣列
 */
export function legalizeChips(rawAmount, dnaWeights, dnaDenoms) {
    const denoms = (Array.isArray(dnaDenoms) && dnaDenoms.length > 0) ? dnaDenoms : [1, 5, 10, 50, 100, 500, 1000];
    
    // 如果權重無效或長度不符，給予預設均勻權重
    let weights = Array.isArray(dnaWeights) && dnaWeights.length === denoms.length ? [...dnaWeights] : Array(denoms.length).fill(1);
    
    const minDenom = Math.min(...denoms);

    // 【機率性找零機制】
    // 計算可以被完美填滿的最大金額 (最小面額的整數倍)
    let guaranteedAmount = Math.floor(rawAmount / minDenom) * minDenom;
    
    // 計算剩餘的碎銀子 (小於最小面額)
    let residual = rawAmount - guaranteedAmount;
    
    // 將碎銀子轉化為機率：剩餘 2.8，最小面額 5，則有 2.8/5 = 56% 的機率多押一個 5
    if (residual > 0) {
        const prob = residual / minDenom;
        if (Math.random() < prob) {
            guaranteedAmount += minDenom;
        }
    }
    
    let remaining = guaranteedAmount;
    
    const chipMap = {};
    denoms.forEach(d => chipMap[d] = 0);
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

    // 解析面額
    let dnaDenoms = [];
    try {
        if (typeof agentState.dna.Available_Bet_Denominations === 'string') {
            dnaDenoms = JSON.parse(agentState.dna.Available_Bet_Denominations);
        } else if (Array.isArray(agentState.dna.Available_Bet_Denominations)) {
            dnaDenoms = agentState.dna.Available_Bet_Denominations;
        }
    } catch(e) {
        dnaDenoms = [];
    }

    let finalSelectedGrids = [];

    Object.entries(rawBetMap).forEach(([gridId, rawAmt]) => {
        const { chipMap, legalTotal } = legalizeChips(rawAmt, dnaWeights, dnaDenoms);
        if (legalTotal > 0) {
            legalBetMap[gridId] = legalTotal;
            fullChipMap[gridId] = chipMap;
            legalTotalBetAmount += legalTotal;
            finalSelectedGrids.push(Number(gridId));
        }
    });

    return {
        agentId: agentState.agentId,
        persona: agentState.persona,
        vipGroup: agentState.dna.VIP_Group,
        dna: agentState.dna,
        selectedGrids: finalSelectedGrids,
        rawBetMap,
        totalBetAmountRaw,
        legalBetMap,
        fullChipMap,
        legalTotalBetAmount,
        buyLightning,
        plannedCashoutLevel
    };
}
