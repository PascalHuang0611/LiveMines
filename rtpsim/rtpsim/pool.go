package main

/**
 * @brief JP 主副池狀態與抽水/注資邏輯（純函式，不接 DB）
 */
type Pool struct {
	MainPool float64
	SubPool  float64

	// 從 EgameData 來的參數
	PoolPerCard       float64 // 總抽水比例
	FixPoolPerCard    float64 // 副池未滿前進主池比例
	EgamePoolAdvance  float64 // 副池目標
	InjectJPVal       float64 // 主池保底
	InjectMax         float64 // 注資上限（一般不會碰）
	JackpotAutoInject bool
	ForbidJackpot     bool

	// 累計統計
	TotalRakeMain    float64
	TotalRakeSub     float64
	AutoInjectEvents int64
	AutoInjectTotal  float64
	GrandPrizePayout float64

	// 重用 buffer：大獎分配 output
	grandOut []float64
}

func NewPool(c *Config) *Pool {
	return &Pool{
		MainPool:          c.EgameData.InitialMainPool,
		SubPool:           c.EgameData.InitialSubPool,
		PoolPerCard:       c.EgameData.PoolPerCard,
		FixPoolPerCard:    c.EgameData.FixPoolPerCard,
		EgamePoolAdvance:  c.EgameData.EgamePoolAdvance,
		InjectJPVal:       c.EgameData.InjectJPVal,
		InjectMax:         c.EgameData.InjectMax,
		JackpotAutoInject: c.EgameData.JackpotAutoInject,
		ForbidJackpot:     c.EgameData.ForbidJackpot,
	}
}

/**
 * @brief 對單一玩家的下注做抽水入池
 * @param betAmount 該玩家本局 main bet（不含 paid）
 */
func (p *Pool) Contribute(betAmount float64) {
	p.ContributeBatch(betAmount)
}

/**
 * @brief 批次抽水：一次處理整局所有玩家的 main bet 總額
 *        效能：100M 局 × 1000 玩家 = 100B 次呼叫 → 1 次 / 局
 */
func (p *Pool) ContributeBatch(totalMainBet float64) {
	if p.ForbidJackpot || totalMainBet <= 0 || p.PoolPerCard <= 0 {
		return
	}
	totalRake := totalMainBet * p.PoolPerCard

	var mainRake, subRake float64
	if p.SubPool >= p.EgamePoolAdvance {
		mainRake = totalRake
		subRake = 0
	} else {
		mainRake = totalRake * p.FixPoolPerCard
		subRake = totalRake - mainRake
		if p.SubPool+subRake > p.EgamePoolAdvance {
			overage := (p.SubPool + subRake) - p.EgamePoolAdvance
			subRake -= overage
			mainRake += overage
		}
	}
	p.MainPool += mainRake
	p.SubPool += subRake
	p.TotalRakeMain += mainRake
	p.TotalRakeSub += subRake
}

/**
 * @brief 大獎派彩：依各玩家 bet 比例加權平分主池當前金額
 *        重用內部 grandOut buffer 避免每局 alloc
 */
func (p *Pool) GrandPrizePayoutInto(winners []float64) []float64 {
	if cap(p.grandOut) < len(winners) {
		p.grandOut = make([]float64, len(winners))
	} else {
		p.grandOut = p.grandOut[:len(winners)]
		for i := range p.grandOut {
			p.grandOut[i] = 0
		}
	}
	if len(winners) == 0 || p.MainPool <= 0 {
		return p.grandOut
	}
	totalBet := 0.0
	for _, b := range winners {
		totalBet += b
	}
	if totalBet <= 0 {
		return p.grandOut
	}
	pool := p.MainPool
	p.MainPool = 0
	p.GrandPrizePayout += pool
	for i, b := range winners {
		p.grandOut[i] = pool * (b / totalBet)
	}
	return p.grandOut
}

// GrandPrizePayout1 alias，向後相容測試
func (p *Pool) GrandPrizePayout1(winners []float64) []float64 {
	return p.GrandPrizePayoutInto(winners)
}

/**
 * @brief 派彩後檢查主池保底 → 從副池補（墊付機制，subPool 可為負）
 */
func (p *Pool) AutoInject() {
	if !p.JackpotAutoInject {
		return
	}
	if p.MainPool >= p.InjectJPVal {
		return
	}
	shortfall := p.InjectJPVal - p.MainPool
	p.MainPool += shortfall
	p.SubPool -= shortfall
	p.AutoInjectEvents++
	p.AutoInjectTotal += shortfall
}
