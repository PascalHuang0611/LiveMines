// src/engine/AgentDataLoader.js



/**
 * 輔助函數：解析可能為字串型態的陣列，並確保長度及做正規化
 */
function parseStringArray(input, expectedLength, fallbackValue = 0, normalize = false) {
    let arr = [];
    if (typeof input === 'string') {
        try {
            const cleanStr = input.replace(/[\[\]]/g, '');
            arr = cleanStr.split(',').map(v => {
                const num = parseFloat(v.trim());
                return (isNaN(num) || num < 0) ? 0 : num;
            });
        } catch (e) {
            arr = [];
        }
    } else if (Array.isArray(input)) {
        arr = input.map(v => {
            const num = parseFloat(v);
            return (isNaN(num) || num < 0) ? 0 : num;
        });
    }

    if (expectedLength && arr.length !== expectedLength) {
        arr = Array(expectedLength).fill(fallbackValue);
    }

    if (normalize) {
        const sum = arr.reduce((a, b) => a + b, 0);
        if (sum > 0) {
            arr = arr.map(v => v / sum);
        } else if (expectedLength) {
            arr = Array(expectedLength).fill(1 / expectedLength); // Fallback to uniform distribution
        }
    }

    return arr;
}

/**
 * 解析 Agent DNA JSON 資料並進行標準化
 * @param {Array} rawAgents 原始 JSON 陣列
 * @returns {Array} 處理後的 Agent 陣列
 */
export function processAgentData(rawAgents) {
    if (!Array.isArray(rawAgents)) return [];

    return rawAgents.map(agent => {
        // 取得語意化名稱
        const personaKey = agent.Player_Persona || 'Unknown';
        const semanticName = agent.Persona_Name_ZH || personaKey;

        // 1. 陣列型欄位解析
        const gridPrefs = parseStringArray(agent.Grid_Preferences, 9, 1/9, true);
        const hourlyActivity = parseStringArray(agent.Hourly_Activity_Vector, 24, 0, true);
        const chipWeights = parseStringArray(agent.Chip_Denomination_Weights, 7, 0, true);
        const priorChipWeights = parseStringArray(agent.Prior_Chip_Denomination_Weights, 7, 0, true);
        const availableDenoms = parseStringArray(agent.Available_Bet_Denominations, 7, 0, false);
        const finalDenoms = availableDenoms.every(v => v === 0) ? [1, 5, 10, 50, 100, 500, 1000] : availableDenoms;

        // 2. 封裝處理後的對象與 Clamping
        let cashoutLevel = Number(agent.Cashout_Stop_Level) || 3;
        cashoutLevel = Math.max(1, Math.min(5, Math.round(cashoutLevel)));

        return {
            ...agent,
            Grid_Preferences: gridPrefs,
            Hourly_Activity_Vector: hourlyActivity,
            Chip_Denomination_Weights: chipWeights,
            Prior_Chip_Denomination_Weights: priorChipWeights,
            Available_Bet_Denominations: finalDenoms,
            
            // 數值型欄位 (Clamped / Normalized)
            Cashout_Stop_Level: cashoutLevel,
            Cashout_Propensity: Number(agent.Cashout_Propensity) || 0.5,
            Buy_Lightning_Prob: Number(agent.Buy_Lightning_Prob) || 0.1,

            // 原有數值欄位
            Avg_Bet_Amount: Number(agent.Avg_Bet_Amount) || 100,
            Bet_Amount_Std: Number(agent.Bet_Amount_Std) || 0,
            Martingale_Multiplier: Number(agent.Martingale_Multiplier) || 1.0,
            Win_Retrench_Ratio: Number(agent.Win_Retrench_Ratio) || 1.0,
            Session_Stop_Loss_Multi: Number(agent.Session_Stop_Loss_Multi) || 20,
            Session_Take_Profit_Multi: Number(agent.Session_Take_Profit_Multi) || 30,
            LiveMines_Bonus_Risk_Prob: Number(agent.LiveMines_Bonus_Risk_Prob) || 0.5,
            
            // 時間型欄位
            Primary_Play_Hour: Number(agent.Primary_Play_Hour) || 20,
            Wakeup_Minute: Number(agent.Wakeup_Minute) || 0,
            Daily_Login_Probability: Number(agent.Daily_Login_Probability) || 1.0,
            Sessions_Per_Active_Day: Number(agent.Sessions_Per_Active_Day) || 1.0,
            Daily_Session_Length: Number(agent.Daily_Session_Length) || 20,
            Micro_Session_Length: Number(agent.Micro_Session_Length) || 20,
            Break_Duration_Minutes: Number(agent.Break_Duration_Minutes) || 0,

            // 其他欄位
            Preferred_Chip_Count: Number(agent.Preferred_Chip_Count) || 1,
            Prior_Preferred_Chip_Count: Number(agent.Prior_Preferred_Chip_Count) || 1,
            Chip_DNA_Source: agent.Chip_DNA_Source || 'unknown',
            Bet_Denomination_Mode: agent.Bet_Denomination_Mode || 'balanced',
            Prior_Bet_Denomination_Mode: agent.Prior_Bet_Denomination_Mode || 'balanced',
        };
    });
}

/**
 * 計算 Persona 動態分佈與特徵統計
 * @param {Array} agents 
 * @returns {Object} 包含各 Persona 的數量與各項行為特徵平均值
 */
export function calculatePersonaStats(agents) {
    const stats = {};
    agents.forEach(a => {
        const p = a.Player_Persona || 'Unknown';
        if (!stats[p]) {
            // 自動分配一組顏色
            const colors = ['#4ade80', '#60a5fa', '#f87171', '#fbbf24', '#a78bfa', '#34d399', '#f472b6'];
            const colorIdx = p.length % colors.length;
            
            stats[p] = {
                count: 0,
                personaNameZH: a.Persona_Name_ZH || p,
                personaNameEN: a.Persona_Name_EN || p,
                desc: a.Persona_Description || '缺乏描述',
                color: colors[colorIdx],
                sumBet: 0,
                sumMartingale: 0,
                sumRetrench: 0,
                sumSessionLen: 0,
                sumStopLoss: 0,
                sumTakeProfit: 0,
            };
        }
        
        stats[p].count += 1;
        stats[p].sumBet += (Number(a.Avg_Bet_Amount) || 0);
        stats[p].sumMartingale += (Number(a.Martingale_Multiplier) || 1.0);
        stats[p].sumRetrench += (Number(a.Win_Retrench_Ratio) || 1.0);
        stats[p].sumSessionLen += (Number(a.Micro_Session_Length) || 20);
        stats[p].sumStopLoss += (Number(a.Session_Stop_Loss_Multi) || 20);
        stats[p].sumTakeProfit += (Number(a.Session_Take_Profit_Multi) || 30);
    });

    // 計算群體平均值
    for (const key in stats) {
        const s = stats[key];
        if (s.count > 0) {
            s.avgBet = (s.sumBet / s.count).toFixed(0);
            s.avgMartingale = (s.sumMartingale / s.count).toFixed(2);
            s.avgRetrench = (s.sumRetrench / s.count).toFixed(2);
            s.avgSessionLen = (s.sumSessionLen / s.count).toFixed(0);
            s.avgStopLoss = (s.sumStopLoss / s.count).toFixed(0);
            s.avgTakeProfit = (s.sumTakeProfit / s.count).toFixed(0);
        }
    }
    
    return stats;
}
