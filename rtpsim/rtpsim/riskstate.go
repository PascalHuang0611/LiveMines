package main

import (
	"time"

	"git.trevi.cc/server/tg001_product/entity/riskscore"
)

/**
 * @brief V4 風險分數模擬掛載：直接複用 entity/riskscore 的 RoomRiskState，
 *        以虛擬時鐘（round_interval_seconds）滿足 30m/2h 時間窗語意。
 */
type SimRiskState struct {
	state    *riskscore.RoomRiskState
	simStart time.Time
	interval time.Duration

	// 統計
	RoundsComputed   int64
	NonNeutralRounds int64 // 任一組權重非全中性的局數
	TRSFailedRounds  int64
	LRSFailedRounds  int64
	SumSmoothedTRS   [9]float64
	SumSmoothedLRS   [9]float64
	MinTRS, MaxTRS   float64
	MinLRS, MaxLRS   float64
}

func NewSimRiskState(baseCfg *MathConfig, intervalSeconds int) *SimRiskState {
	return &SimRiskState{
		state:    riskscore.NewRoomRiskState("SIM", baseCfg.RiskScore.Windows),
		simStart: time.Now(),
		interval: time.Duration(intervalSeconds) * time.Second,
		MinTRS:   100, MaxTRS: 0,
		MinLRS: 100, MaxLRS: 0,
	}
}

/**
 * @brief 取得本局閃電權重；未啟用 / 冷啟動時回中性
 */
func (r *SimRiskState) WeightsFor(mc *MathConfig, enabled bool) (freeW, paidW []int) {
	if enabled && r != nil && mc.RiskScore.Enabled {
		if free, paid, ok := r.state.CurrentWeights(); ok {
			return free[:], paid[:]
		}
	}
	free := riskscore.NeutralWeights(&mc.LightningFeature.GridWeights)
	paid := riskscore.NeutralWeights(&mc.PurchasedLightningFeature.GridWeights)
	return free[:], paid[:]
}

/**
 * @brief 餵入本局落球（對齊 GMS BRC handler）
 */
func (r *SimRiskState) IngestBalls(b0, b1, b2 int32) {
	if r == nil {
		return
	}
	r.state.IngestBalls([]int32{b0, b1, b2})
}

/**
 * @brief 局尾重算（對齊 GMS UpdateRiskStateOnClose）
 */
func (r *SimRiskState) AfterRound(mc *MathConfig, rs *RoundResult, roundIdx int64) {
	if r == nil {
		return
	}
	entry := riskscore.RoundEntry{
		At:             r.simStart.Add(time.Duration(roundIdx) * r.interval),
		MainBet:        rs.GridMainBet,
		ExtraMainBet:   rs.GridExtraMainBet,
		MainPayout:     rs.GridMainPayoutNoExtra,
		ExtraIncPayout: rs.GridExtraIncPayout,
		StackPayout:    rs.GridStackPayout,
		TotalBet:       rs.TotalBet,
		ExtraPlayers:   rs.ExtraPlayers,
	}
	in := &riskscore.RecomputeInput{
		Params:              &mc.RiskScore,
		FreeGridWeights:     &mc.LightningFeature.GridWeights,
		PaidGridWeights:     &mc.PurchasedLightningFeature.GridWeights,
		ExpectedFreeStrikes: ExpectedComboLength(&mc.LightningFeature.PayoutMultipliers),
		ExpectedPaidStrikes: ExpectedComboLength(&mc.PurchasedLightningFeature.PayoutMultipliers),
		DataFresh:           true,
	}
	res := r.state.IngestRoundAndRecompute(entry, in)

	r.RoundsComputed++
	if res.TRS.ModuleFailed {
		r.TRSFailedRounds++
	}
	if res.LRS.ModuleFailed {
		r.LRSFailedRounds++
	}
	neutralFree := mc.LightningFeature.GridWeights.NeutralWeight()
	neutralPaid := mc.PurchasedLightningFeature.GridWeights.NeutralWeight()
	nonNeutral := false
	for i := 0; i < 9; i++ {
		if res.FreeWeights[i] != neutralFree || res.PaidWeights[i] != neutralPaid {
			nonNeutral = true
		}
		r.SumSmoothedTRS[i] += res.SmoothedTRS[i]
		r.SumSmoothedLRS[i] += res.SmoothedLRS[i]
		if res.SmoothedTRS[i] < r.MinTRS {
			r.MinTRS = res.SmoothedTRS[i]
		}
		if res.SmoothedTRS[i] > r.MaxTRS {
			r.MaxTRS = res.SmoothedTRS[i]
		}
		if res.SmoothedLRS[i] < r.MinLRS {
			r.MinLRS = res.SmoothedLRS[i]
		}
		if res.SmoothedLRS[i] > r.MaxLRS {
			r.MaxLRS = res.SmoothedLRS[i]
		}
	}
	if nonNeutral {
		r.NonNeutralRounds++
	}
}
