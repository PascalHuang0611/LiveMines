// src/engine/RiskControlEngine.js
// SERVER 風控引擎移植 (對齊 rtpsim: rtp_window.go / selector.go / decide.go)
// V2: RTP 滑動窗口 → 階梯 + 遲滯 → 自動切換數值表

/**
 * RTP 滑動窗口 (ring buffer)
 * - 保留最近 N 局的 (bet, payout)，payout 口徑 = 主遊戲 + 二級，不含 JP (對齊 LM01 統計)
 * - 冷啟動: 第 1 局 push 之前 sumBet=0 → currentRTP() 回 valid=false → 風控降級 BASE
 */
export class RTPWindow {
    constructor(capacity) {
        this.capacity = capacity | 0;
        this.bets = this.capacity > 0 ? new Float64Array(this.capacity) : null;
        this.payouts = this.capacity > 0 ? new Float64Array(this.capacity) : null;
        this.idx = 0;
        this.count = 0;
        this.sumBet = 0;
        this.sumPayout = 0;
        this.totalRounds = 0;
    }

    push(bet, payout) {
        this.totalRounds++;
        if (this.capacity === 0) {
            this.sumBet += bet;
            this.sumPayout += payout;
            return;
        }
        if (this.count === this.capacity) {
            this.sumBet -= this.bets[this.idx];
            this.sumPayout -= this.payouts[this.idx];
        } else {
            this.count++;
        }
        this.bets[this.idx] = bet;
        this.payouts[this.idx] = payout;
        this.idx = (this.idx + 1) % this.capacity;
        this.sumBet += bet;
        this.sumPayout += payout;
    }

    // 回傳 { rtp, valid }；sumBet=0 時 valid=false
    currentRTP() {
        if (this.sumBet <= 0) return { rtp: 0, valid: false };
        return { rtp: this.sumPayout / this.sumBet * 100, valid: true };
    }

    // 窗口內原始總和 (V3 預估派彩後 RTP 用)
    sums() {
        return { bet: this.sumBet, payout: this.sumPayout };
    }
}

/**
 * V2 決策器：依 MODE + 當前 RTP + 上局 zone 決定本局數值表
 * (對齊伺服器 decideRTP：階梯化 + 遲滯)
 */
export class V2Decider {
    /**
     * @param {Array} zones risk_control.json 的 zones 陣列 [{code, trigger_rtp, exit_rtp, mathconfig}]
     * @param {number} mode 0=強制BASE, 1=自動, 101-103/201-203=強制指定 zone
     */
    constructor(zones, mode) {
        this.byCode = {};
        (zones || []).forEach(z => { this.byCode[z.code] = z; });
        this.mode = mode | 0;
        this.currentZoneCode = 0;
        this.lastConfigMode = 0; // 上一局的 MODE (初始 0 → 首次決策走 directZoneByTrigger)
        this.zoneSwitches = 0;
    }

    /**
     * 每局開始時決策
     * @returns {{ zoneCode: number, profileKey: string, usedDefault: boolean }}
     */
    decide(currentRTP, rtpValid) {
        const result = this._decideInner(currentRTP, rtpValid);
        this.lastConfigMode = this.mode;
        if (result.zoneCode !== this.currentZoneCode) this.zoneSwitches++;
        this.currentZoneCode = result.zoneCode;
        return result;
    }

    _decideInner(currentRTP, rtpValid) {
        const pickDefault = () => ({
            zoneCode: 0,
            profileKey: this.byCode[0] ? this.byCode[0].mathconfig : 'BASE',
            usedDefault: true
        });

        // MODE=0 → 強制 BASE
        if (this.mode === 0) return pickDefault();

        // MODE 強制 (101-103 / 201-203)
        if (this.mode >= 101) {
            const z = this.byCode[this.mode];
            if (!z) return pickDefault();
            return { zoneCode: z.code, profileKey: z.mathconfig, usedDefault: false };
        }

        // MODE=1 自動：RTP 樣本無效 → BASE
        if (!rtpValid) return pickDefault();

        let nextZone;
        if (this.lastConfigMode === 0) {
            // 首次決策 / 剛從 MODE=0 復原：直接以觸發門檻定位
            nextZone = this.directZoneByTrigger(currentRTP);
        } else {
            nextZone = this.nextZoneByLadder(this.currentZoneCode, currentRTP);
        }
        const z = this.byCode[nextZone];
        if (!z) return pickDefault();
        return { zoneCode: z.code, profileKey: z.mathconfig, usedDefault: z.code === 0 };
    }

    // 不參考上一局狀態，僅依各 zone 的 TriggerRTP 直接定位 (嚴重度高優先)
    directZoneByTrigger(rtp) {
        const g = c => this.byCode[c];
        if (g(101) && rtp >= g(101).trigger_rtp) return 101;
        if (g(102) && rtp >= g(102).trigger_rtp) return 102;
        if (g(103) && rtp >= g(103).trigger_rtp) return 103;
        if (g(201) && rtp <= g(201).trigger_rtp) return 201;
        if (g(202) && rtp <= g(202).trigger_rtp) return 202;
        if (g(203) && rtp <= g(203).trigger_rtp) return 203;
        return 0;
    }

    /**
     * 階梯化 + 遲滯：階梯鏈 201↔202↔203↔0↔103↔102↔101，每局最多 ±1 級
     * BST: rtp ≤ Trigger 進入；rtp > Exit 往 BASE 退一級
     * PRT: rtp ≥ Trigger 進入；rtp < Exit 往 BASE 退一級
     */
    nextZoneByLadder(currentZone, rtp) {
        const g = c => this.byCode[c];
        switch (currentZone) {
            case 0: // BASE
                if (g(203) && rtp <= g(203).trigger_rtp) return 203;
                if (g(103) && rtp >= g(103).trigger_rtp) return 103;
                return 0;
            case 103: // PRT_L3
                if (g(103) && rtp < g(103).exit_rtp) return 0;
                if (g(102) && rtp >= g(102).trigger_rtp) return 102;
                return 103;
            case 102: // PRT_L2
                if (g(102) && rtp < g(102).exit_rtp) return 103;
                if (g(101) && rtp >= g(101).trigger_rtp) return 101;
                return 102;
            case 101: // PRT_L1
                if (g(101) && rtp < g(101).exit_rtp) return 102;
                return 101;
            case 203: // BST_L3
                if (g(203) && rtp > g(203).exit_rtp) return 0;
                if (g(202) && rtp <= g(202).trigger_rtp) return 202;
                return 203;
            case 202: // BST_L2
                if (g(202) && rtp > g(202).exit_rtp) return 203;
                if (g(201) && rtp <= g(201).trigger_rtp) return 201;
                return 202;
            case 201: // BST_L1
                if (g(201) && rtp > g(201).exit_rtp) return 202;
                return 201;
            default:
                return this.nextZoneByLadder(0, rtp);
        }
    }
}

/**
 * V3 JP 開獎強控 (對齊伺服器 applyV3JPProtection / rtpsim bonus.go V3Controller)
 * 每關原生 4選2 開獎後，依「預估派彩後 RTP」分階段骰介入；
 * 介入時把通關選項強改為全場押注最低的 2 個 (同額洗牌破平)。
 */
export class V3Controller {
    /** @param {Object} spec risk_control.json 的 jp_protection_v3 區塊 */
    constructor(spec) {
        // phases 依 rtp_threshold 由高到低排序 (嚴重優先)
        this.phases = [...spec.phases].sort((a, b) => b.rtp_threshold - a.rtp_threshold);

        // GGR 捷徑 (prod_gms 語意): 派彩後 GGR 專用窗口的 GGR (下注−派彩)
        // 低於 ggr_threshold → 強制 U_PRT_L1，凌駕四階與大戶條件。兩參數皆必填才啟用。
        // 0 是有效門檻 (不能虧損，由盈轉虧即介入)，停用請填極端負值或關閉 enabled。
        // ggr_window_hours = GGR 專用統計區間 (小時，與 server 欄位 1:1)，與 RTP 窗口互相獨立；
        // 模擬器以虛擬時鐘換算成局數 (人流模式 = 86400÷一天局數 秒/局，換算由 gameStore 處理)。
        this.ggrWindowHours = Number.isFinite(spec.ggr_window_hours) ? spec.ggr_window_hours : null;
        this.ggrThreshold = Number.isFinite(spec.ggr_threshold) ? spec.ggr_threshold : null;
        this.ggrEnabled = this.ggrWindowHours !== null && this.ggrThreshold !== null;

        // 大戶群體集中度條件 (條件 B)；兩參數同設才啟用，缺省 = 整組停用 (向後相容)
        this.whaleBetThreshold = Number.isFinite(spec.whale_bet_threshold) ? spec.whale_bet_threshold : null;
        this.whaleShareThreshold = Number.isFinite(spec.whale_group_share_threshold) ? spec.whale_group_share_threshold : null;
        this.whaleEnabled = this.whaleBetThreshold !== null && this.whaleShareThreshold !== null;

        // 統計
        this.checks = 0;                                          // 進入檢查次數 (關數)
        this.interventions = this.phases.map(() => [0, 0, 0, 0, 0]); // [phaseIdx][bgLevel-1]
        this.interventionTotal = 0;
        this.savedPayout = 0; // 預估省下派彩 (原通關預測派彩 − 強改後預測派彩)
        this.reasonCounts = { RTP: 0, WHALE: 0, BOTH: 0, GGR: 0 }; // 介入原因分佈
        this.whaleRounds = 0;   // 有做大戶評估的局數
        this.whaleFlagged = 0;  // 集中度旗標成立的局數
        this.lastWhale = null;  // 最近一次大戶評估 (UI 顯示)
    }

    /**
     * 大戶群體集中度評估 (每局一次，於二級開始前)
     * 大戶身分/集中度/N* 由下注時點決定，五關不變；
     * ΔRTP 則逐關以「仍存活大戶」重算 (見 maybeIntervene) — 已淘汰/已收手者不計入，
     * 介入壓的是後續 JP 派彩，對已出局者無效 (prod_gms 口徑)。
     * @param {Array<{bet:number, mainPayout:number, alive?:boolean}>} bettors
     *        三同格全部下注者 (= 二級參與者)。傳入「活引用」— caller 更新 alive 後
     *        本引擎逐關重算 ΔRTP 時即自動反映存活狀態。
     * @param {number} windowBet 48h 滑動窗口總下注 (不含本局)
     * @returns {Object|null} 大戶評估結果；未啟用回 null
     */
    evaluateWhales(bettors, windowBet) {
        if (!this.whaleEnabled) return null;
        this.whaleRounds++;

        const gridTotalBet = bettors.reduce((s, b) => s + b.bet, 0);
        const whales = bettors.filter(b => b.bet >= this.whaleBetThreshold);
        const whaleGroupBet = whales.reduce((s, b) => s + b.bet, 0);
        const share = gridTotalBet > 0 ? whaleGroupBet / gridTotalBet : 0;
        const flagged = share >= this.whaleShareThreshold && whales.length > 0;

        // N*: 大戶依注額由大到小累加，首次達集中度門檻所需人數 (僅記錄分析，不參與判定)
        let nStar = null;
        if (flagged) {
            const sorted = [...whales].sort((a, b) => b.bet - a.bet);
            let acc = 0;
            for (let i = 0; i < sorted.length; i++) {
                acc += sorted[i].bet;
                if (acc / gridTotalBet >= this.whaleShareThreshold) { nStar = i + 1; break; }
            }
            if (nStar === null) nStar = sorted.length; // 浮點保險: 全體大戶合計已達標
            this.whaleFlagged++;
        }

        return { whales, whaleCount: whales.length, gridTotalBet, whaleGroupBet, share, flagged, nStar, windowBet };
    }

    /**
     * 逐關 ΔRTP: 仍存活大戶 (alive !== false) 的主玩法賠付合計 ÷ 窗口總下注 × 100
     * 回傳 { deltaRtp, alivePayout, aliveCount, phaseIdxB }
     */
    whalePhaseForLevel(whaleEval) {
        if (!whaleEval) return null;
        let alivePayout = 0, aliveCount = 0;
        whaleEval.whales.forEach(w => {
            if (w.alive !== false) { alivePayout += (w.mainPayout || 0); aliveCount++; }
        });
        const deltaRtp = whaleEval.windowBet > 0 ? alivePayout / whaleEval.windowBet * 100 : 0;
        let phaseIdxB = -1;
        if (whaleEval.flagged) {
            for (let i = 0; i < this.phases.length; i++) {
                const t = this.phases[i].delta_rtp_threshold;
                if (Number.isFinite(t) && deltaRtp >= t) { phaseIdxB = i; break; }
            }
        }
        return { deltaRtp, alivePayout, aliveCount, phaseIdxB };
    }

    /**
     * 檢查並可能介入本關通關結果
     * @param {number} level 內部關卡索引 0~4 (BG Level = level+1)
     * @param {number[]} survivors 原生 4選2 的 2 個通關選項 [a, b]
     * @param {number[]} optionBets 各選項累計下注 (index 1~4，index 0 不用)
     * @param {number} payoutMult 本關派彩倍數
     * @param {Object} ctx {
     *   windowBet, windowPayout   : 48h RTP 滑動窗口原始和 (不含本局)
     *   ggrBet, ggrPayout         : GGR 專用窗口原始和 (不含本局，與 RTP 窗口互相獨立)
     *   roundBet, roundMainPayout : 本局下注 / 主遊戲派彩
     *   bonusPaidSoFar            : 已派二級派彩
     *   whaleEval                 : evaluateWhales() 的本局結果 (條件 B；null = 未啟用)
     * }
     * @returns {{ survivors: number[], intervened: boolean, phaseCode: string|null, reason: string|null, whale: Object|null }}
     */
    maybeIntervene(level, survivors, optionBets, payoutMult, ctx) {
        const { windowBet, windowPayout, ggrBet = 0, ggrPayout = 0,
            roundBet, roundMainPayout, bonusPaidSoFar, whaleEval = null } = ctx;

        // 逐關大戶狀態 (存活大戶的 ΔRTP，隨淘汰/收手遞減)
        const wl = this.whalePhaseForLevel(whaleEval);
        const whaleInfo = (whaleEval && wl) ? {
            whaleCount: whaleEval.whaleCount, share: whaleEval.share, nStar: whaleEval.nStar,
            flagged: whaleEval.flagged, aliveCount: wl.aliveCount,
            whaleGroupPayout: wl.alivePayout, deltaRtp: wl.deltaRtp
        } : null;
        if (whaleInfo) this.lastWhale = whaleInfo;

        const pass = { survivors, intervened: false, phaseCode: null, reason: null, whale: whaleInfo };
        if (payoutMult <= 0) return pass;
        this.checks++;

        // 早退: 通關選項全無下注 → 介入無法降低任何派彩 (大戶條件亦適用，PRD 5a)
        const predicted = (optionBets[survivors[0]] + optionBets[survivors[1]]) * payoutMult;
        if (predicted <= 0) return pass;
        const totalBet = windowBet + roundBet;
        if (totalBet <= 0) return pass;
        const totalPayout = windowPayout + roundMainPayout + bonusPaidSoFar + predicted;
        const newRTP = totalPayout / totalBet * 100;

        // GGR 捷徑 (prod_gms): 本局派彩後 GGR 窗口的 GGR (下注−派彩) < 門檻 → 強制 L1，
        // 凌駕四階與大戶條件。0 為有效門檻 (由盈轉虧即介入)。
        let phaseIdx = -1, reason = null;
        if (this.ggrEnabled) {
            const ggrAfter = (ggrBet + roundBet) - (ggrPayout + roundMainPayout + bonusPaidSoFar + predicted);
            if (ggrAfter < this.ggrThreshold) { phaseIdx = 0; reason = 'GGR'; }
        }

        if (phaseIdx < 0) {
            // 條件 A: 預估派彩後 RTP ≥ 階段門檻
            let phaseIdxA = -1;
            for (let i = 0; i < this.phases.length; i++) {
                if (newRTP >= this.phases[i].rtp_threshold) { phaseIdxA = i; break; }
            }
            // 條件 B: 集中度旗標 AND 存活大戶 ΔRTP ≥ 該階門檻
            const phaseIdxB = wl ? wl.phaseIdxB : -1;

            // A 與 B 為 OR；命中不同階段時取較嚴 (index 越小越嚴)
            if (phaseIdxA >= 0 && phaseIdxB >= 0) { phaseIdx = Math.min(phaseIdxA, phaseIdxB); reason = 'BOTH'; }
            else if (phaseIdxA >= 0) { phaseIdx = phaseIdxA; reason = 'RTP'; }
            else if (phaseIdxB >= 0) { phaseIdx = phaseIdxB; reason = 'WHALE'; }
        }
        if (phaseIdx < 0) return pass;

        const prob = this.phases[phaseIdx].levels[level];
        if (prob <= 0 || Math.random() >= prob) return pass;

        // 強改為下注最低 2 選項 (先洗牌破平，再穩定排序)
        const opts = [1, 2, 3, 4];
        for (let i = opts.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [opts[i], opts[j]] = [opts[j], opts[i]];
        }
        opts.sort((a, b) => optionBets[a] - optionBets[b]); // JS sort 為穩定排序
        const forced = [opts[0], opts[1]];
        if (forced[0] > forced[1]) [forced[0], forced[1]] = [forced[1], forced[0]];

        const forcedPredicted = (optionBets[forced[0]] + optionBets[forced[1]]) * payoutMult;
        this.interventions[phaseIdx][level]++;
        this.interventionTotal++;
        this.savedPayout += predicted - forcedPredicted;
        this.reasonCounts[reason] = (this.reasonCounts[reason] || 0) + 1;
        return { survivors: forced, intervened: true, phaseCode: this.phases[phaseIdx].code, reason, whale: whaleInfo };
    }
}

// 依 spec 建立 V3 控制器；未啟用 / 無階段時回 null
export function createV3Controller(spec) {
    if (!spec || !spec.enabled || !Array.isArray(spec.phases) || spec.phases.length === 0) return null;
    return new V3Controller(spec);
}

// 風控參數檔的基本驗證 (risk_control.json)
export function validateRiskControlConfig(cfg) {
    if (!cfg || typeof cfg !== 'object') throw new Error("風控設定必須是 JSON 物件");
    if (!Array.isArray(cfg.zones) || cfg.zones.length === 0) throw new Error("缺少 zones 陣列");
    const seen = new Set();
    cfg.zones.forEach((z, i) => {
        if (typeof z.code !== 'number') throw new Error(`zones[${i}] 缺少 code`);
        if (seen.has(z.code)) throw new Error(`zones[${i}] code=${z.code} 重複`);
        seen.add(z.code);
        if (!z.mathconfig) throw new Error(`zones[${i}] 缺少 mathconfig`);
    });
    if (!seen.has(0)) throw new Error("zones 必須包含 code=0 (BASE)");
    const v3 = cfg.jp_protection_v3;
    if (v3 && v3.enabled && Array.isArray(v3.phases)) {
        v3.phases.forEach((p, i) => {
            if (!(p.rtp_threshold > 0)) throw new Error(`jp_protection_v3.phases[${i}].rtp_threshold 必須 > 0`);
            if (!Array.isArray(p.levels) || p.levels.length !== 5) throw new Error(`jp_protection_v3.phases[${i}].levels 必須有 5 個元素`);
            p.levels.forEach((lv, j) => {
                if (lv < 0 || lv > 1) throw new Error(`jp_protection_v3.phases[${i}].levels[${j}] 必須在 [0,1]`);
            });
        });

        // GGR 捷徑 (prod_gms): 兩參數必填，缺任一即拒絕 (0 是有效門檻，不提供隱含預設)
        if (!(v3.ggr_window_hours >= 0.25 && v3.ggr_window_hours <= 72)) throw new Error("jp_protection_v3.ggr_window_hours 必填且落在 [0.25, 72] 小時 (GGR 專用統計區間，與 server 欄位相同；停用 GGR 請填極端負值的 ggr_threshold)");
        if (!Number.isFinite(v3.ggr_threshold)) throw new Error("jp_protection_v3.ggr_threshold 必填 (可負/0/正；GGR 低於此值即強制 U_PRT_L1)");

        // 大戶群體集中度條件 (PRD 防呆規則)
        const hasBet = v3.whale_bet_threshold !== undefined;
        const hasShare = v3.whale_group_share_threshold !== undefined;
        if (hasBet !== hasShare) throw new Error("whale_bet_threshold 與 whale_group_share_threshold 必須同時設定或同時省略");
        const hasDelta = v3.phases.some(p => p.delta_rtp_threshold !== undefined);
        if (hasBet) {
            if (!(v3.whale_bet_threshold > 0)) throw new Error("whale_bet_threshold 必須 > 0");
            if (!(v3.whale_group_share_threshold > 0 && v3.whale_group_share_threshold <= 1)) throw new Error("whale_group_share_threshold 必須落在 (0, 1]");
            const sorted = [...v3.phases].sort((a, b) => b.rtp_threshold - a.rtp_threshold);
            sorted.forEach((p, i) => {
                if (!(p.delta_rtp_threshold > 0)) throw new Error(`大戶條件啟用時，phase ${p.code} 必須有 delta_rtp_threshold 且 > 0`);
                if (i > 0 && !(p.delta_rtp_threshold < sorted[i - 1].delta_rtp_threshold)) {
                    throw new Error("四階 delta_rtp_threshold 必須嚴格遞減，且與 rtp_threshold 同序 (L1 兩個維度都最嚴)");
                }
            });
        } else if (hasDelta) {
            throw new Error("大戶條件停用時 (無 whale_* 參數)，任一 phase 都不得有 delta_rtp_threshold (避免靜默失效)");
        }
    }
}
