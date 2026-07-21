// src/engine/RiskScoreEngine.js
// V4 風險分數引擎：依《風險分數計算規格.md》實作 TRS/LRS → 五級閃電落點權重
// 對齊 rtpsim riskstate.go 的介面語意 (entity/riskscore)：
//   - 每局局尾 ingestRoundAndRecompute() 重算，供「下一局」取權重 (currentWeights)
//   - 時間窗用虛擬時鐘：每局視為 round_interval_seconds 秒
//   - TRS (Treasure) → 免費閃電 gridWeights；LRS (Lightning) → 付費閃電 gridWeights

const GRID_COUNT = 9;
const EPS = 1e-9;

/**
 * 滑動窗口：保留最近 N 局的每格聚合數據，增量維護總和
 */
class RoundWindow {
    constructor(capacity) {
        this.capacity = Math.max(1, capacity | 0);
        this.entries = new Array(this.capacity).fill(null);
        this.idx = 0;
        this.count = 0;
        // 每格累計
        this.mainBet = new Float64Array(GRID_COUNT);
        this.extraMainBet = new Float64Array(GRID_COUNT);
        this.mainPayout = new Float64Array(GRID_COUNT);
        this.extraIncPayout = new Float64Array(GRID_COUNT);
        this.stackPayout = new Float64Array(GRID_COUNT);
        // 純量累計
        this.totalBet = 0;
        this.extraRounds = 0;    // 有 Extra 玩家參與的局數
        this.extraVolume = 0;    // Extra 玩家 Main Bet 總量
    }

    push(entry) {
        if (this.count === this.capacity) {
            const old = this.entries[this.idx];
            for (let i = 0; i < GRID_COUNT; i++) {
                this.mainBet[i] -= old.mainBet[i];
                this.extraMainBet[i] -= old.extraMainBet[i];
                this.mainPayout[i] -= old.mainPayout[i];
                this.extraIncPayout[i] -= old.extraIncPayout[i];
                this.stackPayout[i] -= old.stackPayout[i];
            }
            this.totalBet -= old.totalBet;
            if (old.extraPlayers > 0) this.extraRounds--;
            this.extraVolume -= old.extraVolumeRound;
        } else {
            this.count++;
        }
        this.entries[this.idx] = entry;
        this.idx = (this.idx + 1) % this.capacity;
        for (let i = 0; i < GRID_COUNT; i++) {
            this.mainBet[i] += entry.mainBet[i];
            this.extraMainBet[i] += entry.extraMainBet[i];
            this.mainPayout[i] += entry.mainPayout[i];
            this.extraIncPayout[i] += entry.extraIncPayout[i];
            this.stackPayout[i] += entry.stackPayout[i];
        }
        this.totalBet += entry.totalBet;
        if (entry.extraPlayers > 0) this.extraRounds++;
        this.extraVolume += entry.extraVolumeRound;
    }

    sumMainBet() {
        let s = 0;
        for (let i = 0; i < GRID_COUNT; i++) s += this.mainBet[i];
        return s;
    }
    sumExtraMainBet() {
        let s = 0;
        for (let i = 0; i < GRID_COUNT; i++) s += this.extraMainBet[i];
        return s;
    }
}

/**
 * 落球窗口：保留最近 N 顆球的落格
 */
class BallWindow {
    constructor(capacity) {
        this.capacity = Math.max(1, capacity | 0);
        this.balls = new Int8Array(this.capacity);
        this.idx = 0;
        this.count = 0;
        this.gridCounts = new Int32Array(GRID_COUNT);
    }
    push(gridIdx0) {
        if (this.count === this.capacity) {
            this.gridCounts[this.balls[this.idx]]--;
        } else {
            this.count++;
        }
        this.balls[this.idx] = gridIdx0;
        this.idx = (this.idx + 1) % this.capacity;
        this.gridCounts[gridIdx0]++;
    }
}

// Score(r, Cap) = 100 × Clip(0.5 + ln(r) / (2 ln Cap), 0, 1)
export function ratioToScore(r, cap) {
    if (!(cap > 1)) cap = 2.0;
    const rr = Math.max(r, EPS);
    const x = 0.5 + Math.log(rr) / (2 * Math.log(cap));
    return 100 * Math.min(1, Math.max(0, x));
}

// AdjustedRatio = 1 + α × (RawRatio − 1)
function shrinkRatio(raw, alpha) {
    return 1 + alpha * (raw - 1);
}

// 依 thresholds [t1,t2,t3,t4] 將分數映射至五級 (0~4)
export function tierForScore(score, thresholds) {
    for (let t = 0; t < thresholds.length; t++) {
        if (score < thresholds[t]) return t;
    }
    return thresholds.length;
}

// 中性權重 = 中間級 (分數 40~60 那一級) 的權重
export function neutralWeightOf(gridWeightsCfg) {
    const w = gridWeightsCfg.weights;
    return w[Math.floor(w.length / 2)];
}

// 由付費/免費閃電的倍率組合權重表計算期望道數 (對齊 rtpsim ExpectedComboLength)
export function expectedComboLength(payoutMultipliers) {
    const { values, weights } = payoutMultipliers;
    let totalW = 0, acc = 0;
    for (let i = 0; i < values.length; i++) {
        totalW += weights[i];
        acc += weights[i] * values[i].length;
    }
    return totalW > 0 ? acc / totalW : 0;
}

/**
 * V4 風險分數狀態機
 * @param {Object} options { intervalSeconds } 虛擬時鐘 (預設 30 秒/局)
 * 窗口容量以 math config 的 riskScore.windows 與虛擬時鐘換算，於首次 recompute 時定案
 */
export class RiskScoreState {
    constructor(riskScoreCfg, intervalSeconds = 30) {
        const w = riskScoreCfg.windows;
        const interval = Math.max(1, intervalSeconds);
        // 窗口局數 = min(局數上限, 時間窗換算局數)
        const shortRounds = Math.min(w.shortMaxRounds, Math.max(1, Math.round(w.shortMinutes * 60 / interval)));
        const longRounds = Math.min(w.longMaxRounds, Math.max(1, Math.round(w.longMinutes * 60 / interval)));

        this.shortWin = new RoundWindow(shortRounds);
        this.longWin = new RoundWindow(longRounds);
        this.ballShort = new BallWindow(w.ballShort);
        this.ballLong = new BallWindow(w.ballLong);

        // 每局總投注中位數窗口 (shrink 的 V0 用)
        const medianRounds = Math.max(1, Math.round((riskScoreCfg.shrink.medianWindowHours || 48) * 3600 / interval));
        this.medianCapacity = Math.min(medianRounds, 20000);
        this.medianBuf = new Float64Array(this.medianCapacity);
        this.medianIdx = 0;
        this.medianCount = 0;
        this.cachedMedian = 0;
        this.medianDirty = true;

        // EWMA 狀態 (初始中性 50)
        this.smoothedTRS = new Float64Array(GRID_COUNT).fill(50);
        this.smoothedLRS = new Float64Array(GRID_COUNT).fill(50);

        // 上次重算輸出的權重 (供下一局取用)；null = 尚未重算 (冷啟動 → 中性)
        this.lastFreeWeights = null;
        this.lastPaidWeights = null;
        this.lastBreakdown = null; // 上次重算的每格子分數明細 (UI 解釋用)

        // 統計
        this.roundsComputed = 0;
        this.nonNeutralRounds = 0;
        this.trsFailedRounds = 0;
        this.lrsFailedRounds = 0;
        this.minTRS = 100; this.maxTRS = 0;
        this.minLRS = 100; this.maxLRS = 0;
    }

    /** 落球即時餵入 (對齊 GMS BRC handler) */
    ingestBalls(ballPositions) {
        ballPositions.forEach(p => {
            const idx = (p | 0) - 1;
            if (idx >= 0 && idx < GRID_COUNT) {
                this.ballShort.push(idx);
                this.ballLong.push(idx);
            }
        });
    }

    /** 取得本局應使用的閃電權重 (上一局重算結果；冷啟動 → 中性) */
    currentWeights(config) {
        const freeCfg = config.lightningFeature.gridWeights;
        const paidCfg = config.purchasedLightningFeature.gridWeights;
        if (this.lastFreeWeights && this.lastPaidWeights) {
            return { free: this.lastFreeWeights, paid: this.lastPaidWeights };
        }
        return {
            free: new Array(GRID_COUNT).fill(neutralWeightOf(freeCfg)),
            paid: new Array(GRID_COUNT).fill(neutralWeightOf(paidCfg))
        };
    }

    _median() {
        if (!this.medianDirty) return this.cachedMedian;
        if (this.medianCount === 0) return 0;
        const arr = Array.from(this.medianBuf.slice(0, this.medianCount)).sort((a, b) => a - b);
        this.cachedMedian = arr[Math.floor(arr.length / 2)];
        this.medianDirty = false;
        return this.cachedMedian;
    }

    /**
     * 局尾重算 (對齊 GMS UpdateRiskStateOnClose)
     * @param {Object} entry { mainBet[9], extraMainBet[9], mainPayout[9], extraIncPayout[9], stackPayout[9], totalBet, extraPlayers }
     * @param {Object} config 本局使用的 math config (riskScore 參數與 gridWeights 取自於此)
     * @returns {{ freeWeights, paidWeights, smoothedTRS, smoothedLRS, trsFailed, lrsFailed, nonNeutral }}
     */
    ingestRoundAndRecompute(entry, config) {
        entry.extraVolumeRound = 0;
        for (let i = 0; i < GRID_COUNT; i++) entry.extraVolumeRound += entry.extraMainBet[i];
        this.shortWin.push(entry);
        this.longWin.push(entry);

        // 中位數窗口
        this.medianBuf[this.medianIdx] = entry.totalBet;
        this.medianIdx = (this.medianIdx + 1) % this.medianCapacity;
        if (this.medianCount < this.medianCapacity) this.medianCount++;
        if (this.roundsComputed % 50 === 0) this.medianDirty = true; // 每 50 局重算一次中位數

        const rs = config.riskScore;
        const caps = rs.caps;
        const minS = rs.minSamples;
        const r0 = rs.shrink.r0 || 100;
        const median = this._median();

        // === 通用 α (樣本收斂係數)：α = sqrt(N/(N+R0) × V/(V+V0))，V0 = 中位數 × R0 ===
        const alphaFor = (win) => {
            const n = win.count;
            const v = win.totalBet;
            const v0 = median > 0 ? median * r0 : 0;
            const nPart = n / (n + r0);
            const vPart = v0 > 0 ? v / (v + v0) : nPart; // 中位數尚無資料時退化為局數係數
            return Math.sqrt(nPart * vPart);
        };
        const alphaShort = alphaFor(this.shortWin);
        const alphaLong = alphaFor(this.longWin);
        // 短長窗合併後的 raw ratio 用「合併 α」收縮 (以長窗為主的保守取法：兩窗 α 加權同指標權重)
        const mixAlpha = (wShort, wLong) => wShort * alphaShort + wLong * alphaLong;

        const ballFill = this.ballLong.count;
        const alphaBall = ballFill / (ballFill + (rs.shrink.ballK || 1000));

        const ev = rs.ev;
        const p0 = (ev.ballBaseline && ev.ballBaseline.length === GRID_COUNT) ? ev.ballBaseline : new Array(GRID_COUNT).fill(1 / 9);

        const sWin = this.shortWin, lWin = this.longWin;
        const sMainTotal = sWin.sumMainBet(), lMainTotal = lWin.sumMainBet();
        const sExtraTotal = sWin.sumExtraMainBet(), lExtraTotal = lWin.sumExtraMainBet();

        // 樣本門檻 (失效 → 指標中性 50)
        const roundsOk = lWin.count >= (minS.rounds || 50);
        const extraOk = lWin.extraRounds >= (minS.extraRounds || 100)
            && (median <= 0 || lWin.extraVolume >= median * (minS.extraVolumeMultiplier || 100));

        // Lightning 期望值 (供 EPP/STK)
        const expFreeStrikes = expectedComboLength(config.lightningFeature.payoutMultipliers);
        const expPaidStrikes = expectedComboLength(config.purchasedLightningFeature.payoutMultipliers);
        const pTreasure = expFreeStrikes / GRID_COUNT;   // P(免費閃電打中某格)
        const pLightning = expPaidStrikes / GRID_COUNT;  // P(付費閃電打中某格)
        const baseBallEV = ev.baseBallMatchingEV || 0.73;
        const lIncEV = ev.lightningIncrementEV || 2.0;
        const expectedMainEV = ev.expectedMainEV || 0.93;
        const bonusAEV = ev.bonusAEV || 9.8;
        const q0 = ev.tripleHitProb || 0.004444;

        // === 每格計算 TRS / LRS ===
        const trs = new Float64Array(GRID_COUNT);
        const lrs = new Float64Array(GRID_COUNT);
        let trsFailedCore = 0, lrsFailedCore = 0;

        // 子分數明細收集 (供 UI 解釋權重成因；四捨五入到小數 1 位節省記憶體)
        const r1 = v => Math.round(v * 10) / 10;
        const bd = {
            mbc: new Array(GRID_COUNT), phy: new Array(GRID_COUNT), mpp: new Array(GRID_COUNT), bex: new Array(GRID_COUNT),
            ebc: new Array(GRID_COUNT), epp: new Array(GRID_COUNT), stk: new Array(GRID_COUNT),
            trsRaw: new Array(GRID_COUNT), lrsRaw: new Array(GRID_COUNT),
            trsSmoothed: new Array(GRID_COUNT), lrsSmoothed: new Array(GRID_COUNT),
            trsFailed: false, lrsFailed: false
        };

        // Bonus 曝險需要全格平均，先算 per-grid exposure
        const bexShort = new Float64Array(GRID_COUNT);
        const bexLong = new Float64Array(GRID_COUNT);
        const stkExpected = new Float64Array(GRID_COUNT);
        const physAdjusted = new Float64Array(GRID_COUNT);

        for (let i = 0; i < GRID_COUNT; i++) {
            // --- PHY (共用) ---
            const sBallExp = this.ballShort.count * p0[i];
            const lBallExp = this.ballLong.count * p0[i];
            const shortBallRatio = sBallExp > 0 ? this.ballShort.gridCounts[i] / sBallExp : 1;
            const longBallRatio = lBallExp > 0 ? this.ballLong.gridCounts[i] / lBallExp : 1;
            const rawPhy = 0.60 * shortBallRatio + 0.40 * longBallRatio;
            physAdjusted[i] = shrinkRatio(rawPhy, alphaBall);
        }

        for (let i = 0; i < GRID_COUNT; i++) {
            // Bonus 曝險 (7.x)：平均每局注 × 修正三球機率 × Bonus AEV
            const tripleAdj = q0 * Math.min(1.5, Math.max(0.7, Math.pow(physAdjusted[i], 1.5)));
            const sAvgBet = sWin.count > 0 ? sWin.mainBet[i] / sWin.count : 0;
            const lAvgBet = lWin.count > 0 ? lWin.mainBet[i] / lWin.count : 0;
            bexShort[i] = sAvgBet * tripleAdj * bonusAEV;
            bexLong[i] = lAvgBet * tripleAdj * bonusAEV;
            // Stack 預期曝險 (13.1)
            const lAvgExtraBet = lWin.count > 0 ? lWin.extraMainBet[i] / lWin.count : 0;
            stkExpected[i] = lAvgExtraBet * baseBallEV * pTreasure * pLightning * lIncEV;
        }
        const avg = arr => {
            let s = 0;
            for (let i = 0; i < GRID_COUNT; i++) s += arr[i];
            return s / GRID_COUNT;
        };
        const bexShortAvg = avg(bexShort), bexLongAvg = avg(bexLong), stkExpAvg = avg(stkExpected);

        for (let i = 0; i < GRID_COUNT; i++) {
            // === TRS ===
            // 指標一 MBC：投注集中度 (0.70 短 + 0.30 長)
            let mbcScore = 50, mbcFailed = false;
            if (roundsOk && sMainTotal > 0 && lMainTotal > 0) {
                const r30 = (sWin.mainBet[i] / sMainTotal) * GRID_COUNT;
                const r2h = (lWin.mainBet[i] / lMainTotal) * GRID_COUNT;
                const raw = 0.70 * r30 + 0.30 * r2h;
                mbcScore = ratioToScore(shrinkRatio(raw, mixAlpha(0.70, 0.30)), caps.bet);
            } else mbcFailed = true;

            // 指標二 PHY：物理落球熱度
            const phyScore = ratioToScore(physAdjusted[i], caps.physical);

            // 指標三 MPP：派彩壓力 (0.40 短 + 0.60 長)，理論值 = 注 × expectedMainEV
            let mppScore = 50, mppFailed = false;
            if (roundsOk) {
                const sExp = sWin.mainBet[i] * expectedMainEV;
                const lExp = lWin.mainBet[i] * expectedMainEV;
                const p30 = sWin.mainPayout[i] / Math.max(sExp, EPS);
                const p2h = lWin.mainPayout[i] / Math.max(lExp, EPS);
                // 該格窗口內無投注 → 指標退中性
                if (sWin.mainBet[i] > 0 || lWin.mainBet[i] > 0) {
                    const raw = 0.40 * (sWin.mainBet[i] > 0 ? p30 : 1) + 0.60 * (lWin.mainBet[i] > 0 ? p2h : 1);
                    mppScore = ratioToScore(shrinkRatio(raw, mixAlpha(0.40, 0.60)), caps.payout);
                }
            } else mppFailed = true;

            // 指標四 BEX：Bonus 曝險相對值 (0.60 短 + 0.40 長)
            let bexScore = 50, bexFailed = false;
            if (roundsOk && (bexShortAvg > 0 || bexLongAvg > 0)) {
                const r30 = bexShortAvg > 0 ? bexShort[i] / bexShortAvg : 1;
                const r2h = bexLongAvg > 0 ? bexLong[i] / bexLongAvg : 1;
                const raw = 0.60 * r30 + 0.40 * r2h;
                bexScore = ratioToScore(shrinkRatio(raw, mixAlpha(0.60, 0.40)), caps.bonus);
            } else bexFailed = true;

            trs[i] = 0.35 * mbcScore + 0.30 * phyScore + 0.20 * mppScore + 0.15 * bexScore;
            if (i === 0) trsFailedCore = (mbcFailed ? 1 : 0) + (mppFailed ? 1 : 0) + (bexFailed ? 1 : 0);
            bd.mbc[i] = r1(mbcScore); bd.phy[i] = r1(phyScore); bd.mpp[i] = r1(mppScore); bd.bex[i] = r1(bexScore);
            bd.trsRaw[i] = r1(trs[i]);

            // === LRS ===
            // 指標一 EBC：Extra 玩家投注集中度 (0.70 短 + 0.30 長)；樣本不足 → 50
            let ebcScore = 50, ebcFailed = false;
            if (extraOk && sExtraTotal > 0 && lExtraTotal > 0) {
                const r30 = (sWin.extraMainBet[i] / sExtraTotal) * GRID_COUNT;
                const r2h = (lWin.extraMainBet[i] / lExtraTotal) * GRID_COUNT;
                const raw = 0.70 * r30 + 0.30 * r2h;
                ebcScore = ratioToScore(shrinkRatio(raw, mixAlpha(0.70, 0.30)), caps.extraBet);
            } else ebcFailed = true;

            // 指標三 EPP：Extra 增量派彩壓力 (0.40 短 + 0.60 長)
            let eppScore = 50, eppFailed = false;
            if (extraOk) {
                const sExp = sWin.extraMainBet[i] * baseBallEV * pLightning * lIncEV;
                const lExp = lWin.extraMainBet[i] * baseBallEV * pLightning * lIncEV;
                if (sWin.extraMainBet[i] > 0 || lWin.extraMainBet[i] > 0) {
                    const p30 = sWin.extraIncPayout[i] / Math.max(sExp, EPS);
                    const p2h = lWin.extraIncPayout[i] / Math.max(lExp, EPS);
                    const raw = 0.40 * (sWin.extraMainBet[i] > 0 ? p30 : 1) + 0.60 * (lWin.extraMainBet[i] > 0 ? p2h : 1);
                    eppScore = ratioToScore(shrinkRatio(raw, mixAlpha(0.40, 0.60)), caps.extraPayout);
                }
            } else eppFailed = true;

            // 指標四 STK：疊加曝險 (0.60 預期 + 0.40 實際)
            let stkScore = 50, stkFailed = false;
            if (extraOk && stkExpAvg > 0) {
                const expRatio = stkExpected[i] / stkExpAvg;
                const lExpStack = lWin.extraMainBet[i] * baseBallEV * pTreasure * pLightning * lIncEV;
                const realized = lExpStack > 0 ? lWin.stackPayout[i] / Math.max(lExpStack, EPS) : 1;
                const raw = 0.60 * expRatio + 0.40 * realized;
                stkScore = ratioToScore(shrinkRatio(raw, alphaLong), caps.stack);
            } else stkFailed = true;

            lrs[i] = 0.40 * ebcScore + 0.25 * phyScore + 0.20 * eppScore + 0.15 * stkScore;
            if (i === 0) lrsFailedCore = (ebcFailed ? 1 : 0) + (eppFailed ? 1 : 0) + (stkFailed ? 1 : 0);
            bd.ebc[i] = r1(ebcScore); bd.epp[i] = r1(eppScore); bd.stk[i] = r1(stkScore);
            bd.lrsRaw[i] = r1(lrs[i]);
        }

        // === 系統失效規則：超過兩個核心指標失效 → 模組全格中性 ===
        const trsFailed = trsFailedCore > 2;
        const lrsFailed = lrsFailedCore > 2;

        // === EWMA 平滑 ===
        const lamT = rs.ewma.treasureLambda ?? 0.2;
        const lamL = rs.ewma.lightningLambda ?? 0.15;
        for (let i = 0; i < GRID_COUNT; i++) {
            const newT = trsFailed ? 50 : trs[i];
            const newL = lrsFailed ? 50 : lrs[i];
            this.smoothedTRS[i] = lamT * newT + (1 - lamT) * this.smoothedTRS[i];
            this.smoothedLRS[i] = lamL * newL + (1 - lamL) * this.smoothedLRS[i];
        }

        // === 分數 → 五級權重 (中性帶保護) ===
        const freeCfg = config.lightningFeature.gridWeights;
        const paidCfg = config.purchasedLightningFeature.gridWeights;
        const mapWeights = (scores, gwCfg, moduleFailed) => {
            const neutral = neutralWeightOf(gwCfg);
            const band = gwCfg.neutralBand || [45, 55];
            if (moduleFailed) return new Array(GRID_COUNT).fill(neutral);
            let allNeutral = true;
            for (let i = 0; i < GRID_COUNT; i++) {
                if (scores[i] < band[0] || scores[i] > band[1]) { allNeutral = false; break; }
            }
            if (allNeutral) return new Array(GRID_COUNT).fill(neutral);
            const out = new Array(GRID_COUNT);
            for (let i = 0; i < GRID_COUNT; i++) {
                out[i] = gwCfg.weights[tierForScore(scores[i], gwCfg.thresholds)];
            }
            return out;
        };

        const freeWeights = mapWeights(this.smoothedTRS, freeCfg, trsFailed);
        const paidWeights = mapWeights(this.smoothedLRS, paidCfg, lrsFailed);
        this.lastFreeWeights = freeWeights;
        this.lastPaidWeights = paidWeights;

        // 明細快照 (供下一局的歷史紀錄解釋權重成因)
        // 查表脈絡必須取「重算當下」的 gridWeights (下一局 V2 可能已換表，不能用屆時的表解釋)
        for (let i = 0; i < GRID_COUNT; i++) {
            bd.trsSmoothed[i] = r1(this.smoothedTRS[i]);
            bd.lrsSmoothed[i] = r1(this.smoothedLRS[i]);
        }
        bd.trsFailed = trsFailed;
        bd.lrsFailed = lrsFailed;
        bd.freeTable = { thresholds: [...freeCfg.thresholds], weights: [...freeCfg.weights] };
        bd.paidTable = { thresholds: [...paidCfg.thresholds], weights: [...paidCfg.weights] };
        bd.profileKey = null; // 由呼叫端補上 (引擎不知道數值表名稱)
        this.lastBreakdown = bd;

        // === 統計 ===
        this.roundsComputed++;
        if (trsFailed) this.trsFailedRounds++;
        if (lrsFailed) this.lrsFailedRounds++;
        const neutralFree = neutralWeightOf(freeCfg);
        const neutralPaid = neutralWeightOf(paidCfg);
        let nonNeutral = false;
        for (let i = 0; i < GRID_COUNT; i++) {
            if (freeWeights[i] !== neutralFree || paidWeights[i] !== neutralPaid) nonNeutral = true;
            if (this.smoothedTRS[i] < this.minTRS) this.minTRS = this.smoothedTRS[i];
            if (this.smoothedTRS[i] > this.maxTRS) this.maxTRS = this.smoothedTRS[i];
            if (this.smoothedLRS[i] < this.minLRS) this.minLRS = this.smoothedLRS[i];
            if (this.smoothedLRS[i] > this.maxLRS) this.maxLRS = this.smoothedLRS[i];
        }
        if (nonNeutral) this.nonNeutralRounds++;

        return {
            freeWeights, paidWeights,
            smoothedTRS: this.smoothedTRS, smoothedLRS: this.smoothedLRS,
            trsFailed, lrsFailed, nonNeutral
        };
    }
}

/** 建立空的每局 V4 記帳條目 */
export function emptyV4Entry() {
    return {
        mainBet: new Float64Array(GRID_COUNT),
        extraMainBet: new Float64Array(GRID_COUNT),
        mainPayout: new Float64Array(GRID_COUNT),
        extraIncPayout: new Float64Array(GRID_COUNT),
        stackPayout: new Float64Array(GRID_COUNT),
        totalBet: 0,
        extraPlayers: 0
    };
}
