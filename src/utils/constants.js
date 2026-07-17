// 預設值同步自 TG001_LM01_BASE_Config.json (新格式: 付費閃電為倍率組合、免費閃電倍率為單元素陣列)
// gridWeights 與 riskScore 為 SERVER 專用參數，引擎不讀取，僅原樣保留
export const DEFAULT_CONFIG = {
    "simulationRuns": 1000000000,
    "mainGame": {
        "numberOfGrids": 9,
        "numberOfBalls": 3,
        "extraPurchaseCostPercent": 0.5,
        "singleAreaBasePayouts": [2.0, 5.0, 10.0]
    },
    "lightningFeature": {
        "payoutMultipliers": {
            "values": [[1, 1], [1, 1, 1], [1], [1], [1], [1]],
            "weights": [56, 44, 0, 0, 0, 0]
        },
        "gridWeights": {
            "thresholds": [20, 40, 60, 80],
            "weights": [100, 100, 100, 100, 100],
            "neutralBand": [45, 55]
        }
    },
    "purchasedLightningFeature": {
        "payoutMultipliers": {
            "values": [[1, 1, 3], [1, 2, 3], [1, 3, 3], [2, 2, 3], [2, 3, 3], [3, 3, 3]],
            "weights": [10, 76, 14, 0, 0, 0]
        },
        "gridWeights": {
            "thresholds": [20, 40, 60, 80],
            "weights": [100, 100, 100, 100, 100],
            "neutralBand": [45, 55]
        }
    },
    "riskScore": {
        "enabled": true,
        "windows": {
            "shortMinutes": 30,
            "shortMaxRounds": 500,
            "longMinutes": 120,
            "longMaxRounds": 2000,
            "ballShort": 300,
            "ballLong": 3000
        },
        "shrink": {
            "r0": 100,
            "ballK": 1000,
            "medianWindowHours": 48
        },
        "ewma": {
            "treasureLambda": 0.2,
            "lightningLambda": 0.15
        },
        "caps": {
            "bet": 2.0,
            "physical": 1.5,
            "payout": 2.0,
            "bonus": 2.0,
            "extraBet": 2.0,
            "extraPayout": 2.0,
            "stack": 2.0
        },
        "minSamples": {
            "rounds": 50,
            "extraRounds": 100,
            "extraVolumeMultiplier": 100,
            "dataFreshSeconds": 120
        },
        "ev": {
            "expectedMainEV": 0.930668,
            "bonusAEV": 9.8125,
            "baseBallMatchingEV": 0.732169,
            "lightningIncrementEV": 2.013333,
            "tripleHitProb": 0.004444,
            "ballBaseline": [0.113016, 0.098095, 0.117778, 0.103492, 0.100635, 0.112381, 0.123492, 0.111429, 0.119683]
        }
    },
    "bonusGame": {
        "triggerCondition": "Three balls in the same grid",
        "endLevel": 5,
        "jp_contribution_rate": 0.005,
        "levelSettings": {
            "totalChoices": [4, 4, 4, 4, 4],
            "winChoices": [2, 2, 2, 2, 2],
            "payouts": [15, 40, 100, 250, 500]
        }
    }
};

// 將設定物件格式化為易讀的 JSON 字串: 物件逐層縮排，數值陣列 (含倍率組合) 保持單行
// 輸出仍為合法 JSON，可直接 JSON.parse
export function formatConfigJson(value, indent = 0) {
    const isPrimitive = v => v === null || typeof v !== 'object';
    const pad = ' '.repeat(indent);
    const childPad = ' '.repeat(indent + 4);

    if (Array.isArray(value)) {
        // 元素皆為純值、或皆為純值組成的子陣列 (如倍率組合 [[1,1,3],...]) 時單行顯示
        const canInline = value.every(v => isPrimitive(v) || (Array.isArray(v) && v.every(isPrimitive)));
        if (canInline) {
            return '[' + value.map(v =>
                Array.isArray(v) ? '[' + v.map(x => JSON.stringify(x)).join(',') + ']' : JSON.stringify(v)
            ).join(',') + ']';
        }
        return '[\n' + value.map(v => childPad + formatConfigJson(v, indent + 4)).join(',\n') + '\n' + pad + ']';
    }
    if (value !== null && typeof value === 'object') {
        const keys = Object.keys(value);
        if (keys.length === 0) return '{}';
        return '{\n' + keys.map(k =>
            childPad + JSON.stringify(k) + ': ' + formatConfigJson(value[k], indent + 4)
        ).join(',\n') + '\n' + pad + '}';
    }
    return JSON.stringify(value);
}

// 檢查設定是否符合新格式規範 (與 C++ 模擬器 V14 的規則一致)，不符合時 throw Error
// 注意: gridWeights / riskScore 為 SERVER 專用欄位，此處不驗證 (僅需 JSON 語法合法)
export function validateConfigFormat(cfg) {
    if (!cfg || typeof cfg !== 'object') throw new Error("設定必須是 JSON 物件");
    if (!cfg.mainGame || typeof cfg.mainGame.numberOfBalls !== 'number') throw new Error("缺少 mainGame 節點或參數格式錯誤");
    if (!cfg.lightningFeature || !cfg.purchasedLightningFeature) throw new Error("缺少閃電模組 (lightningFeature / purchasedLightningFeature) 節點");
    if (!cfg.bonusGame || !cfg.bonusGame.levelSettings || !Array.isArray(cfg.bonusGame.levelSettings.payouts)) throw new Error("缺少 bonusGame 節點或 levelSettings 結構不完整");

    // 免費與付費閃電規則相同: 倍率組合格式，不可含舊版 strikes 區塊
    const checkLightning = (node, name) => {
        if (node.strikes) throw new Error(name + " 為舊格式 (含 strikes 區塊)，已不支援，請改用倍率組合格式");
        if (!node.payoutMultipliers || !Array.isArray(node.payoutMultipliers.values) || node.payoutMultipliers.values.length === 0) {
            throw new Error(name + ".payoutMultipliers.values 缺失");
        }
        if (!node.payoutMultipliers.values.every(v => Array.isArray(v) && v.length > 0 && v.every(x => typeof x === 'number'))) {
            throw new Error(name + ".payoutMultipliers.values 每個元素必須是倍率組合陣列 (例如 [1,1,3])");
        }
        if (!Array.isArray(node.payoutMultipliers.weights) || node.payoutMultipliers.weights.length !== node.payoutMultipliers.values.length) {
            throw new Error(name + ".payoutMultipliers 的 weights 數量必須與 values 一致");
        }
    };
    checkLightning(cfg.lightningFeature, "lightningFeature");
    checkLightning(cfg.purchasedLightningFeature, "purchasedLightningFeature");
}

export function getEmptyStats() {
    return {
        totalBet: 0,
        totalWin: 0,
        totalBaseWin: 0,      
        totalLightningWin: 0, 
        totalBonusWin: 0,     
        totalJpWin: 0,        
        totalJpPool: 0,       
        gridHits: [0, 0, 0, 0, 0, 0, 0, 0, 0], 
        lightningHits: [0, 0, 0, 0, 0, 0, 0, 0, 0], 
        bonusSafeHits: [0, 0, 0, 0], 
        strikeCounts: {},     
        patterns: {
            threeSame: 0,     
            twoSame: 0,       
            allDifferent: 0   
        },
        roundsCount: 0,
        startRound: 0,
        endRound: 0
    };
}
