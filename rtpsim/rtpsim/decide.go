package main

/**
 * @brief V2 決策器：依 MODE + 當前 RTP + 上局 zone 狀態決定本局 math config
 *        （對齊伺服器 decideRTP：階梯化 + 遲滯；V1 位置干預已移除，改由 V4 風險權重接手）
 */
type V2Decider struct {
	sel             *Selector
	mathConfigs     map[string]*MathConfig
	mode            int
	currentZoneCode int
	lastConfigMode  int // 上一局的 MODE（初始 0 → 首次決策走 DirectZoneByTrigger）
	zoneSwitches    int // zone 切換次數（統計用）
}

func NewV2Decider(sel *Selector, mcs map[string]*MathConfig, mode int) *V2Decider {
	return &V2Decider{sel: sel, mathConfigs: mcs, mode: mode}
}

type RTPDecision struct {
	Cfg         *MathConfig
	Zone        Zone
	CurrentRTP  float64
	UsedDefault bool // 是否回退 BASE（mode=0 / 樣本不足 / 失敗 fallback）
}

// ZoneSwitches zone 切換次數（統計用）
func (d *V2Decider) ZoneSwitches() int { return d.zoneSwitches }

/**
 * @brief 每局開始時決策本局 math config（對齊伺服器 decideRTP 流程）
 */
func (d *V2Decider) Decide(currentRTP float64, rtpValid bool) RTPDecision {
	defer func() { d.lastConfigMode = d.mode }()

	pickDefault := func() RTPDecision {
		z, _ := d.sel.PickDefault()
		cfg := d.mathConfigs[z.MathConfigKey]
		d.setZone(0)
		return RTPDecision{Cfg: cfg, Zone: z, UsedDefault: true, CurrentRTP: currentRTP}
	}

	// MODE=0 → 強制 BASE
	if d.mode == 0 {
		return pickDefault()
	}

	// MODE 強制（101-103 / 201-203）
	if d.mode >= 101 {
		z, err := d.sel.PickByCode(d.mode)
		if err != nil {
			return pickDefault()
		}
		cfg, ok := d.mathConfigs[z.MathConfigKey]
		if !ok {
			return pickDefault()
		}
		d.setZone(z.Code)
		return RTPDecision{Cfg: cfg, Zone: z, CurrentRTP: currentRTP}
	}

	// MODE=1 自動：RTP 樣本無效 → BASE
	if !rtpValid {
		return pickDefault()
	}
	var nextZone int
	if d.lastConfigMode == 0 {
		// 首次決策 / 剛從 MODE=0 復原：直接以觸發門檻定位
		nextZone = d.sel.DirectZoneByTrigger(currentRTP)
	} else {
		nextZone = d.sel.NextZoneByLadder(d.currentZoneCode, currentRTP)
	}
	z, err := d.sel.PickByCode(nextZone)
	if err != nil {
		return pickDefault()
	}
	cfg, ok := d.mathConfigs[z.MathConfigKey]
	if !ok {
		return pickDefault()
	}
	d.setZone(z.Code)
	return RTPDecision{Cfg: cfg, Zone: z, CurrentRTP: currentRTP, UsedDefault: z.Code == 0}
}

func (d *V2Decider) setZone(code int) {
	if code != d.currentZoneCode {
		d.zoneSwitches++
	}
	d.currentZoneCode = code
}
