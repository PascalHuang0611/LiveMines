package main

/**
 * @brief 玩家狀態
 */
type Player struct {
	ID        int
	BetPos    [9]int32 // 實際使用前 NumBetPos 個位置（3 或 9）
	NumBetPos int
	BoughtPL  bool
}

/**
 * @brief 風控開關組合（三跑對比用）
 */
type RunToggles struct {
	V2 bool // 機率表切換（false = 永遠 BASE）
	V3 bool // JP 開獎強控
	V4 bool // 風險分數位置權重
}

/**
 * @brief 一局結果（buffer 由 Engine 持有，per round Reset 重用）
 */
type RoundResult struct {
	TotalBet            float64
	MainBetOnly         float64 // 主注合計（不含 EXTRA 加價）
	MainGamePayout      float64
	ExclExtraMainPayout float64 // 主遊戲派彩（僅免費閃電，不含付費閃電加成）
	BonusGamePayout     float64
	GrandPrizePayout    float64
	ZoneCode            int
	TwoSame             bool
	ThreeSame           bool

	// V3 統計
	V3InterventionCount int

	// V4 每格統計（口徑對齊 GameSvr collectRoundRiskDelta）
	GridMainBet           [9]float64 // 每格主注（全部玩家）
	GridExtraMainBet      [9]float64 // 每格主注（僅買 Extra 的玩家）
	GridMainPayoutNoExtra [9]float64 // 每格主遊戲派彩（基礎+免費閃電）
	GridExtraIncPayout    [9]float64 // 每格 Extra 增量派彩
	GridStackPayout       [9]float64 // 每格免費×付費疊加格的增量派彩
	ExtraPlayers          int

	BonusQualifiedCount int
	BonusLevelEnter     [6]int // [1..5] 進入該關人數
	BonusLevelPass      [6]int // [1..5] 過關人數
	BonusLevelFail      [6]int // [1..5] 失敗人數
	BonusCashoutTotal   int
	BonusGrandTotal     int

	PlayerBet         []float64
	PlayerMainPayout  []float64
	PlayerBonusPayout []float64
	PlayerGrandPayout []float64
	PlayerBuyPaid     []bool
	PlayerInBonus     []bool
	PlayerInGrand     []bool
}

func NewRoundResult(N int) *RoundResult {
	return &RoundResult{
		PlayerBet:         make([]float64, N),
		PlayerMainPayout:  make([]float64, N),
		PlayerBonusPayout: make([]float64, N),
		PlayerGrandPayout: make([]float64, N),
		PlayerBuyPaid:     make([]bool, N),
		PlayerInBonus:     make([]bool, N),
		PlayerInGrand:     make([]bool, N),
	}
}

// Reset 將 buffer 歸零，per round 開頭呼叫
func (r *RoundResult) Reset() {
	r.TotalBet = 0
	r.MainBetOnly = 0
	r.MainGamePayout = 0
	r.ExclExtraMainPayout = 0
	r.BonusGamePayout = 0
	r.GrandPrizePayout = 0
	r.ZoneCode = 0
	r.TwoSame = false
	r.ThreeSame = false
	r.V3InterventionCount = 0
	r.GridMainBet = [9]float64{}
	r.GridExtraMainBet = [9]float64{}
	r.GridMainPayoutNoExtra = [9]float64{}
	r.GridExtraIncPayout = [9]float64{}
	r.GridStackPayout = [9]float64{}
	r.ExtraPlayers = 0
	r.BonusQualifiedCount = 0
	r.BonusLevelEnter = [6]int{}
	r.BonusLevelPass = [6]int{}
	r.BonusLevelFail = [6]int{}
	r.BonusCashoutTotal = 0
	r.BonusGrandTotal = 0
	for i := range r.PlayerBet {
		r.PlayerBet[i] = 0
		r.PlayerMainPayout[i] = 0
		r.PlayerBonusPayout[i] = 0
		r.PlayerGrandPayout[i] = 0
		r.PlayerBuyPaid[i] = false
		r.PlayerInBonus[i] = false
		r.PlayerInGrand[i] = false
	}
}

func (r *RoundResult) RTPPayout() float64 { return r.MainGamePayout + r.BonusGamePayout }

type Engine struct {
	cfg         *Config
	mathConfigs map[string]*MathConfig
	pool        *Pool
	masterSeed  int64

	toggles RunToggles
	decider *V2Decider    // V2（toggles.V2=false 時仍存在，但 mode 固定 0）
	v3      *V3Controller // V3（nil = 停用）
	risk    *SimRiskState // V4（nil = 停用）
	window  *RTPWindow    // 滑動窗口（V3 需要原始和）

	cashoutProbs          []float64
	optimalBetting        bool
	all9Betting           bool
	forceAllPaidLightning bool

	// 重用 buffer：一個 Engine 一個（同一 goroutine 序列使用）
	rr          *RoundResult
	freeBuf     [9]int32
	paidBuf     [9]int32
	freeMulBuf  [9]float64
	paidMulBuf  [9]float64
	bonusStates []bonusPlayerState
}

func NewEngine(cfg *Config, sel *Selector, mcs map[string]*MathConfig, pool *Pool,
	mode int, masterSeed int64, toggles RunToggles, window *RTPWindow) *Engine {

	optimal := cfg.useOptimalBetting()
	var coProbs []float64
	if optimal {
		coProbs = optimalCashoutProbs()
	} else if len(cfg.Players.BonusCashoutPerLevel) > 0 {
		coProbs = cfg.Players.BonusCashoutPerLevel
	} else {
		coProbs = make([]float64, 5)
		for i := range coProbs {
			coProbs[i] = cfg.Players.BonusCashoutProbability
		}
	}

	deciderMode := mode
	if !toggles.V2 {
		deciderMode = 0 // 不換表 → 永遠 BASE
	}
	var v3 *V3Controller
	if toggles.V3 {
		v3 = NewV3Controller(&cfg.RTPControl.JPProtectionV3)
	}
	var risk *SimRiskState
	if toggles.V4 {
		if base, ok := mcs["BASE"]; ok {
			risk = NewSimRiskState(base, cfg.Simulation.RoundIntervalSeconds)
		}
	}

	return &Engine{
		cfg: cfg, mathConfigs: mcs, pool: pool, masterSeed: masterSeed,
		toggles: toggles,
		decider: NewV2Decider(sel, mcs, deciderMode),
		v3:      v3,
		risk:    risk,
		window:  window,

		cashoutProbs:          coProbs,
		optimalBetting:        optimal,
		all9Betting:           cfg.useAll9Betting(),
		forceAllPaidLightning: cfg.useForceAllPaidLightning(),
		rr:                    NewRoundResult(cfg.Players.Count),
		bonusStates:           make([]bonusPlayerState, 0, cfg.Players.Count),
	}
}

// V2Decider 統計存取（報表用）
func (e *Engine) Decider() *V2Decider { return e.decider }
func (e *Engine) V3() *V3Controller   { return e.v3 }
func (e *Engine) Risk() *SimRiskState { return e.risk }

// RunRound runs one round with random ball drops.
func (e *Engine) RunRound(players []Player, roundIdx int64, currentRTP float64, rtpValid bool) *RoundResult {
	return e.runRound(players, roundIdx, currentRTP, rtpValid, nil)
}

// RunRoundFixed runs one round with pre-specified ball positions (replay mode).
func (e *Engine) RunRoundFixed(players []Player, roundIdx int64, currentRTP float64, rtpValid bool, balls [3]int32) *RoundResult {
	return e.runRound(players, roundIdx, currentRTP, rtpValid, &balls)
}

func (e *Engine) runRound(players []Player, roundIdx int64, currentRTP float64, rtpValid bool, fixedBalls *[3]int32) *RoundResult {
	playerRng := NewFastRNG(uint64(e.masterSeed)*1_000_003 + uint64(roundIdx))
	ballRng := NewFastRNG(uint64(e.masterSeed)*1_000_007 + uint64(roundIdx) + 1_000_000_007)
	sysRng := NewFastRNG(uint64(e.masterSeed)*1_000_033 + uint64(roundIdx) + 2_000_000_007)

	betPerPos := e.cfg.Players.BetPerPosition
	rs := e.rr
	rs.Reset()

	// 1. V2 決策本局 math config（對齊伺服器 START 階段 decideRTP）
	dLight := e.decider.Decide(currentRTP, rtpValid)
	rs.ZoneCode = dLight.Zone.Code
	mc := dLight.Cfg
	extraCostPct := mc.MainGame.ExtraPurchaseCostPercent

	// 2. 玩家下注 — playerRng
	totalMainBet := 0.0
	for i := range players {
		p := &players[i]
		if e.optimalBetting {
			pickOptimalBetPositions(p, e.cfg.BallDrop.GridWeights)
		} else if e.all9Betting {
			pickAll9(p)
		} else {
			pickThreeFrom9(p, &playerRng)
		}
		bought := false
		if e.optimalBetting {
			bought = true
		} else {
			roll := playerRng.Float64()
			if e.forceAllPaidLightning {
				bought = true // 仍消耗 roll，保持同 seed 下 cashout/選位 RNG 一致
			} else {
				bought = roll < e.cfg.Players.PaidLightningPurchaseRate
			}
		}
		p.BoughtPL = bought
		rs.PlayerBuyPaid[i] = bought
		if bought {
			rs.ExtraPlayers++
		}
		mainBet := float64(p.NumBetPos) * betPerPos
		extraCost := 0.0
		if bought {
			extraCost = mainBet * extraCostPct
		}
		playerBet := mainBet + extraCost
		rs.PlayerBet[i] = playerBet
		rs.TotalBet += playerBet
		totalMainBet += mainBet
		for _, pos := range p.BetPos[:p.NumBetPos] {
			rs.GridMainBet[pos-1] += betPerPos
			if bought {
				rs.GridExtraMainBet[pos-1] += betPerPos
			}
		}
	}
	rs.MainBetOnly = totalMainBet

	// 3. V4 風險權重（上一局重算結果；冷啟動/停用 → 中性）
	freeWeights, paidWeights := e.risk.WeightsFor(mc, e.toggles.V4)

	// 4. 免費閃電：整組 combo 抽取 → 洗牌 → 加權位置 1:1 綁定（對齊 bd93621）
	var freeMul [10]float64
	{
		n := GenerateMultiplierSetInto(&mc.LightningFeature.PayoutMultipliers, &sysRng, e.freeMulBuf[:])
		ShuffleFloat64s(e.freeMulBuf[:n], &sysRng)
		var exc [9]bool
		nFree := GenerateRandomGridPositionsInto(freeWeights, n, exc, &sysRng, e.freeBuf[:])
		for k := 0; k < nFree; k++ {
			freeMul[e.freeBuf[k]] += e.freeMulBuf[k]
		}
	}

	// 5. 付費閃電（可與免費重疊）
	var paidMul [10]float64
	{
		n := GenerateMultiplierSetInto(&mc.PurchasedLightningFeature.PayoutMultipliers, &sysRng, e.paidMulBuf[:])
		ShuffleFloat64s(e.paidMulBuf[:n], &sysRng)
		var exc [9]bool
		nPaid := GenerateRandomGridPositionsInto(paidWeights, n, exc, &sysRng, e.paidBuf[:])
		for k := 0; k < nPaid; k++ {
			paidMul[e.paidBuf[k]] += e.paidMulBuf[k]
		}
	}

	// 6. 球落 — fixedBalls != nil 時使用固定值（replay 模式），否則用 ballRng 隨機
	var ballCount [10]int
	var ball0, ball1, ball2 int32
	if fixedBalls != nil {
		ball0, ball1, ball2 = fixedBalls[0], fixedBalls[1], fixedBalls[2]
	} else if len(e.cfg.BallDrop.OutcomeWeights) == 3 {
		ball0, ball1, ball2 = DropBallsWithOutcome(e.cfg.BallDrop.GridWeights, e.cfg.BallDrop.OutcomeWeights, &ballRng)
	} else {
		ball0 = DropBall(e.cfg.BallDrop.GridWeights, &ballRng)
		ball1 = DropBall(e.cfg.BallDrop.GridWeights, &ballRng)
		ball2 = DropBall(e.cfg.BallDrop.GridWeights, &ballRng)
	}
	ballCount[ball0]++
	ballCount[ball1]++
	ballCount[ball2]++
	threeSame := ball0 == ball1 && ball1 == ball2
	twoSame := !threeSame && (ball0 == ball1 || ball1 == ball2 || ball0 == ball2)
	rs.ThreeSame = threeSame
	rs.TwoSame = twoSame
	jackpotPos := int32(0)
	if threeSame {
		jackpotPos = ball0
	}
	if e.risk != nil {
		e.risk.IngestBalls(ball0, ball1, ball2)
	}

	// 7. 主遊戲派彩（同步收集 V4 每格口徑）
	basePayouts := mc.MainGame.SingleAreaBasePayouts
	for i := range players {
		p := &players[i]
		playerMain := 0.0
		playerMainExclExtra := 0.0
		for _, pos := range p.BetPos[:p.NumBetPos] {
			hits := ballCount[pos]
			if hits == 0 || hits-1 >= len(basePayouts) {
				continue
			}
			base := basePayouts[hits-1]
			noExtra := betPerPos * base * (1.0 + freeMul[pos])
			playerMainExclExtra += noExtra
			rs.GridMainPayoutNoExtra[pos-1] += noExtra
			if p.BoughtPL {
				inc := betPerPos * base * paidMul[pos]
				playerMain += noExtra + inc
				if inc > 0 {
					rs.GridExtraIncPayout[pos-1] += inc
					if freeMul[pos] > 0 {
						rs.GridStackPayout[pos-1] += inc
					}
				}
			} else {
				playerMain += noExtra
			}
		}
		rs.PlayerMainPayout[i] = playerMain
		rs.MainGamePayout += playerMain
		rs.ExclExtraMainPayout += playerMainExclExtra
	}

	// 8. 三同球 → 二級玩法（整房共用開獎，V3 於各關介入）
	if threeSame {
		e.bonusStates = e.bonusStates[:0]
		for i := range players {
			p := &players[i]
			for _, pos := range p.BetPos[:p.NumBetPos] {
				if pos == jackpotPos {
					e.bonusStates = append(e.bonusStates, bonusPlayerState{
						playerIdx: i, bet: betPerPos, alive: true,
					})
					rs.PlayerInBonus[i] = true
					break
				}
			}
		}
		rs.BonusQualifiedCount = len(e.bonusStates)

		if len(e.bonusStates) > 0 {
			windowBet, windowPayout := 0.0, 0.0
			if e.window != nil {
				windowBet, windowPayout = e.window.Sums()
			}
			grandStates := e.playSharedBonus(rs, e.bonusStates, mc, e.v3, windowBet, windowPayout, &playerRng, &sysRng)

			if len(grandStates) > 0 {
				grandBets := make([]float64, len(grandStates))
				for j, si := range grandStates {
					grandBets[j] = e.bonusStates[si].bet
				}
				payouts := e.pool.GrandPrizePayoutInto(grandBets)
				for j, si := range grandStates {
					idx := e.bonusStates[si].playerIdx
					rs.PlayerGrandPayout[idx] += payouts[j]
					rs.GrandPrizePayout += payouts[j]
					rs.PlayerInGrand[idx] = true
				}
			}
		}
	}

	// 9. JP 抽水（批次一次）
	e.pool.ContributeBatch(totalMainBet)

	// 10. 自動注資
	e.pool.AutoInject()

	// 11. V4 局尾重算（對齊 GMS CLOSE）
	if e.risk != nil {
		e.risk.AfterRound(mc, rs, roundIdx)
	}

	return rs
}

func pickThreeFrom9(p *Player, rng *FastRNG) {
	var arr [9]int32 = [9]int32{1, 2, 3, 4, 5, 6, 7, 8, 9}
	// partial Fisher-Yates 抽 3 個（從後面 swap）
	for i := 8; i >= 6; i-- {
		j := rng.Intn(i + 1)
		arr[i], arr[j] = arr[j], arr[i]
	}
	p.BetPos[0] = arr[6]
	p.BetPos[1] = arr[7]
	p.BetPos[2] = arr[8]
	p.NumBetPos = 3
}
