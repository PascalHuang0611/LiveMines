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
        this.ggrThreshold = spec.ggr_threshold || 0;

        // 統計
        this.checks = 0;                                          // 進入檢查次數 (關數)
        this.interventions = this.phases.map(() => [0, 0, 0, 0, 0]); // [phaseIdx][bgLevel-1]
        this.interventionTotal = 0;
        this.savedPayout = 0; // 預估省下派彩 (原通關預測派彩 − 強改後預測派彩)
    }

    /**
     * 檢查並可能介入本關通關結果
     * @param {number} level 內部關卡索引 0~4 (BG Level = level+1)
     * @param {number[]} survivors 原生 4選2 的 2 個通關選項 [a, b]
     * @param {number[]} optionBets 各選項累計下注 (index 1~4，index 0 不用)
     * @param {number} payoutMult 本關派彩倍數
     * @param {number} windowBet / windowPayout 滑動窗口原始和 (不含本局)
     * @param {number} roundBet / roundMainPayout / bonusPaidSoFar 本局下注 / 主遊戲派彩 / 已派二級派彩
     * @returns {{ survivors: number[], intervened: boolean, phaseCode: string|null }}
     */
    maybeIntervene(level, survivors, optionBets, payoutMult,
        windowBet, windowPayout, roundBet, roundMainPayout, bonusPaidSoFar) {

        if (payoutMult <= 0) return { survivors, intervened: false, phaseCode: null };
        this.checks++;

        const predicted = (optionBets[survivors[0]] + optionBets[survivors[1]]) * payoutMult;
        if (predicted <= 0) return { survivors, intervened: false, phaseCode: null };
        const totalBet = windowBet + roundBet;
        if (totalBet <= 0) return { survivors, intervened: false, phaseCode: null };
        const totalPayout = windowPayout + roundMainPayout + bonusPaidSoFar + predicted;
        const newRTP = totalPayout / totalBet * 100;

        // GGR 捷徑: 預估虧損超門檻 → 強制最嚴重階段
        let phaseIdx = -1;
        if (this.ggrThreshold > 0 && totalPayout - totalBet > this.ggrThreshold) {
            phaseIdx = 0;
        } else {
            for (let i = 0; i < this.phases.length; i++) {
                if (newRTP >= this.phases[i].rtp_threshold) { phaseIdx = i; break; }
            }
        }
        if (phaseIdx < 0) return { survivors, intervened: false, phaseCode: null };

        const prob = this.phases[phaseIdx].levels[level];
        if (prob <= 0 || Math.random() >= prob) return { survivors, intervened: false, phaseCode: null };

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
        return { survivors: forced, intervened: true, phaseCode: this.phases[phaseIdx].code };
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
    }
}
