// src/engine/AgentDataLoader.js

export const PERSONA_METADATA = {
    'Behavior_Type_0': {
        name: '🟢 穩健小資族',
        desc: '遊戲中的大眾，投注額小且穩定，追求長期穩定的遊戲體驗。',
        avgBet: '100 - 500',
        grids: '3 - 5 格',
        martingale: '1.0x (幾乎不翻倍)',
        color: '#4ade80'
    },
    'Behavior_Type_1': {
        name: '🔵 高勝率農夫',
        desc: '喜歡「包格」策略，透過高覆蓋率換取頻繁的中獎感。',
        avgBet: '1000 - 5000',
        grids: '6 - 9 格',
        martingale: '1.1x (輕微加注)',
        color: '#60a5fa'
    },
    'Behavior_Type_2': {
        name: '🔴 孤注一擲大戶',
        desc: '高額注碼的狙擊手，只押極少數格子，追求高賠率的一擊必殺。',
        avgBet: '50,000+',
        grids: '1 - 2 格',
        martingale: '1.0x (不翻倍)',
        color: '#f87171'
    },
    'Behavior_Type_3': {
        name: '💀 瘋狂賭徒',
        desc: '極端風險追求者，大額投注且瘋狂翻倍追輸，對 RTP 波動影響極大。',
        avgBet: '100,000+',
        grids: '9 格全包',
        martingale: '2.5x+ (強烈翻倍)',
        color: '#fbbf24'
    }
};

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
        const semanticName = PERSONA_METADATA[personaKey]?.name || personaKey;

        // 1. 處理 Grid_Preferences (從字串 "[0.1, 0.2...]" 轉為 Array)
        let gridPrefs = [];
        if (typeof agent.Grid_Preferences === 'string') {
            try {
                // 移除可能的方括號並分割
                const cleanStr = agent.Grid_Preferences.replace(/[\[\]]/g, '');
                gridPrefs = cleanStr.split(',').map(v => parseFloat(v.trim()));
            } catch (e) {
                console.error(`解析 Agent ${agent.Account} 的 Grid_Preferences 失敗`, e);
                gridPrefs = Array(9).fill(1/9); // 失敗則平均分配
            }
        } else if (Array.isArray(agent.Grid_Preferences)) {
            gridPrefs = agent.Grid_Preferences;
        } else {
            gridPrefs = Array(9).fill(1/9);
        }

        // 確保長度為 9 並進行正規化 (Normalization)
        if (gridPrefs.length !== 9) {
            gridPrefs = Array(9).fill(1/9);
        }
        const sum = gridPrefs.reduce((a, b) => a + b, 0);
        if (sum > 0) {
            gridPrefs = gridPrefs.map(v => v / sum);
        }

        // 2. 封裝處理後的對象
        return {
            ...agent,
            Grid_Preferences: gridPrefs,
            // 確保關鍵數值為 Number
            Avg_Bet_Amount: Number(agent.Avg_Bet_Amount) || 100,
            Bet_Amount_Std: Number(agent.Bet_Amount_Std) || 0,
            Martingale_Multiplier: Number(agent.Martingale_Multiplier) || 1.0,
            Win_Retrench_Ratio: Number(agent.Win_Retrench_Ratio) || 1.0,
            Buy_Lightning_Prob: Number(agent.Buy_Lightning_Prob) || 0.1,
            Session_Stop_Loss_Multi: Number(agent.Session_Stop_Loss_Multi) || 20,
            Session_Take_Profit_Multi: Number(agent.Session_Take_Profit_Multi) || 30,
            LiveMines_Bonus_Risk_Prob: Number(agent.LiveMines_Bonus_Risk_Prob) || 0.5,
            Micro_Session_Length: Number(agent.Micro_Session_Length) || 20,
            Primary_Play_Hour: Number(agent.Primary_Play_Hour) || 20,
            Wakeup_Minute: Number(agent.Wakeup_Minute) || 0
        };
    });
}

/**
 * 計算 Persona 分佈統計
 * @param {Array} agents 
 * @returns {Object} { PersonaName: Count }
 */
export function calculatePersonaStats(agents) {
    const stats = {};
    agents.forEach(a => {
        const p = a.Player_Persona || 'Unknown';
        stats[p] = (stats[p] || 0) + 1;
    });
    return stats;
}
