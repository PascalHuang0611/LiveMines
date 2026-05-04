// src/utils/simulation.js

export function sampleWeightedWithoutReplacement(items, weights, n) {
    let availableItems = [...items];
    let availableWeights = [...weights];
    let selectedItems = [];

    for (let i = 0; i < n; i++) {
        if (availableItems.length === 0) break;
        
        let totalWeight = availableWeights.reduce((sum, w) => sum + w, 0);
        if (totalWeight <= 0) {
            const randomIndex = Math.floor(Math.random() * availableItems.length);
            selectedItems.push(availableItems[randomIndex]);
            availableItems.splice(randomIndex, 1);
            availableWeights.splice(randomIndex, 1);
            continue;
        }

        let rand = Math.random() * totalWeight;
        let sum = 0;
        let selectedIdx = -1;

        for (let j = 0; j < availableWeights.length; j++) {
            sum += availableWeights[j];
            if (rand <= sum) {
                selectedIdx = j;
                break;
            }
        }

        if (selectedIdx === -1) selectedIdx = availableWeights.length - 1;

        selectedItems.push(availableItems[selectedIdx]);
        availableItems.splice(selectedIdx, 1);
        availableWeights.splice(selectedIdx, 1);
    }

    return selectedItems;
}

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

// 供元件呼叫的共用計算函式
export function getBatchRTP(b, type) {
    if (!b || b.totalBet === 0) return "0.00";
    if (type === 'total') return ((b.totalWin / b.totalBet) * 100).toFixed(2);
    if (type === 'base') return ((b.totalBaseWin / b.totalBet) * 100).toFixed(2);
    if (type === 'lightning') return ((b.totalLightningWin / b.totalBet) * 100).toFixed(2);
    if (type === 'bonus') return ((b.totalBonusWin / b.totalBet) * 100).toFixed(2);
    if (type === 'jp') return ((b.totalJpWin / b.totalBet) * 100).toFixed(2);
    return "0.00";
}

export function getBatchPatternStats(b, count) {
    if (!b || count === 0) return { threeSame: "0.00", twoSame: "0.00", allDifferent: "0.00" };
    return {
        threeSame: ((b.patterns.threeSame / count) * 100).toFixed(2),
        twoSame: ((b.patterns.twoSame / count) * 100).toFixed(2),
        allDifferent: ((b.patterns.allDifferent / count) * 100).toFixed(2)
    };
}

export function getBatchStrikeCountStats(b, count) {
    if (!b || count === 0) return {};
    let res = {};
    Object.keys(b.strikeCounts).sort((x, y) => x - y).forEach(k => {
        res[k] = ((b.strikeCounts[k] / count) * 100).toFixed(2);
    });
    return res;
}

export function getBatchGridHitStats(b, count, numberOfBalls) {
    const totalBalls = count * numberOfBalls;
    if (!b || totalBalls === 0) return Array(9).fill("0.00");
    return b.gridHits.map(hits => ((hits / totalBalls) * 100).toFixed(2));
}

export function getBatchLightningHitStats(b) {
    if (!b) return Array(9).fill("0.00");
    const totalL = b.lightningHits.reduce((sum, h) => sum + h, 0);
    if (totalL === 0) return Array(9).fill("0.00");
    return b.lightningHits.map(hits => ((hits / totalL) * 100).toFixed(2));
}

export function getBatchBonusSafeHitStats(b) {
    if (!b) return Array(4).fill("0.00");
    const totalS = b.bonusSafeHits.reduce((sum, h) => sum + h, 0);
    if (totalS === 0) return Array(4).fill("0.00");
    return b.bonusSafeHits.map(hits => ((hits / totalS) * 100).toFixed(2));
}
