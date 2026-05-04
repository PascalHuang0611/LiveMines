export const DEFAULT_CONFIG = {
    "simulationRuns": 6000000,
    "mainGame": {
        "numberOfGrids": 9,
        "numberOfBalls": 3,
        "extraPurchaseCostPercent": 0.5,
        "singleAreaBasePayouts": [2.0, 5.0, 10.0]
    },
    "lightningFeature": {
        "strikes": {
            "values": [2, 2, 2, 3, 3, 3],
            "weights": [1, 1, 1, 1, 1, 1]
        },
        "payoutMultipliers": {
            "values": [1, 1, 1, 1, 1, 1],
            "weights": [1, 1, 1, 1, 1, 1]
        },
        "gridWeights": [100, 100, 100, 100, 100, 100, 100, 100, 100]
    },
    "purchasedLightningFeature": {
        "strikes": {
            "values": [3, 3, 3, 3, 3, 3],
            "weights": [243, 243, 243, 243, 243, 243]
        },
        "payoutMultipliers": {
            "values": [1, 1, 2, 2, 3, 3],
            "weights": [37, 37, 50, 51, 42, 43]
        },
        "gridWeights": [100, 100, 100, 100, 100, 100, 100, 100, 100]
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
