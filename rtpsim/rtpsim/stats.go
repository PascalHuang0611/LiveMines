package main

import "math"

/**
 * @brief Per-player 累計（payout 分桶：main / bonus / grand）
 *        RTP 計算不含 grand prize
 */
type PlayerStats struct {
	TotalBet         float64
	MainPayout       float64
	BonusPayout      float64
	GrandPayout      float64
	BuyerRounds      int64
	BuyerBet         float64
	BuyerMain        float64
	BuyerBonus       float64
	BuyerGrand       float64
	NonBuyerRounds   int64
	NonBuyerBet      float64
	NonBuyerMain     float64
	NonBuyerBonus    float64
	NonBuyerGrand    float64
	JPQualifiedCount int64
	JPGrandCount     int64
}

func (p *PlayerStats) RTPPayout() float64 { return p.MainPayout + p.BonusPayout }
func (p *PlayerStats) TotalPayoutAll() float64 {
	return p.MainPayout + p.BonusPayout + p.GrandPayout
}
func (p *PlayerStats) RTP() float64 {
	if p.TotalBet <= 0 {
		return 0
	}
	return p.RTPPayout() / p.TotalBet * 100
}
func (p *PlayerStats) BuyerRTP() float64 {
	if p.BuyerBet <= 0 {
		return 0
	}
	return (p.BuyerMain + p.BuyerBonus) / p.BuyerBet * 100
}
func (p *PlayerStats) BuyerIncludingGrandRTP() float64 {
	if p.BuyerBet <= 0 {
		return 0
	}
	return (p.BuyerMain + p.BuyerBonus + p.BuyerGrand) / p.BuyerBet * 100
}
func (p *PlayerStats) NonBuyerRTP() float64 {
	if p.NonBuyerBet <= 0 {
		return 0
	}
	return (p.NonBuyerMain + p.NonBuyerBonus) / p.NonBuyerBet * 100
}

/**
 * @brief Per-zone 累計
 */
type ZoneStats struct {
	Hits            int64
	V3Interventions int64 // 本 zone 局內 V3 JP 強控介入次數
	TotalBet        float64
	MainPayout      float64
	BonusPayout     float64
	GrandPayout     float64
}

func (z *ZoneStats) RTP() float64 {
	if z.TotalBet <= 0 {
		return 0
	}
	return (z.MainPayout + z.BonusPayout) / z.TotalBet * 100
}

/**
 * @brief 全局統計累積器
 */
type Stats struct {
	Rounds              int64
	TotalBet            float64
	MainBetOnly         float64
	MainGamePayout      float64
	ExclExtraMainPayout float64
	BonusGamePayout     float64
	GrandPrizePayout    float64
	TwoSameOccurs       int64
	ThreeSameOccurs     int64
	V3Interventions     int64 // V3 JP 強控介入總次數（關數）

	BonusQualifiedTotal int64
	BonusLevelEnter     [6]int64 // [1..5]
	BonusLevelPass      [6]int64
	BonusLevelFail      [6]int64
	BonusCashoutTotal   int64
	BonusGrandTotal     int64

	// JP 主池分潤極值（GrandPrizePayoutInto，不含 L5 固定倍數 bonus）
	MaxSingleJPPayout float64
	MaxRoundJPPayout  float64

	// 測試過程 RTP 極值（不含 grand，與 ★RTP 同口徑）
	MinRoundRTP      float64
	MaxRoundRTP      float64
	MinCumulativeRTP float64
	MaxCumulativeRTP float64
	// 滑動窗口 RTP（僅前 windowRTPRangeMaxRounds 局，Push 後取樣）
	MinWindowRTP              float64
	MaxWindowRTP              float64
	windowRTPSamples          int64
	windowRTPExtremeFirst2400 int64 // 前 2400 局極端（>110% 或 <80%）
	windowRTPExtremeAfter2400 int64 // 第 2401 局起極端
	windowRTPAbove110Count    int64 // 全程
	windowRTPBelow80Count     int64
	windowRTPAbove110Over200  int64 // 連續 >110% 超過 windowRTPHighStreakOver 的局數
	windowRTPAbove110Streak   int64 // 內部：目前連續 >110% 局數

	roundRTPSamples int64
	cumRTPSamples   int64

	// 分桶
	BuyerRounds    int64
	BuyerBet       float64
	BuyerMain      float64
	BuyerBonus     float64
	BuyerGrand     float64
	NonBuyerRounds int64
	NonBuyerBet    float64
	NonBuyerMain   float64
	NonBuyerBonus  float64
	NonBuyerGrand  float64

	PerZone   map[int]*ZoneStats
	PerPlayer []PlayerStats
}

func NewStats(playerCount int, zoneCodes []int) *Stats {
	pz := make(map[int]*ZoneStats, len(zoneCodes))
	for _, c := range zoneCodes {
		pz[c] = &ZoneStats{}
	}
	return &Stats{
		PerZone:          pz,
		PerPlayer:        make([]PlayerStats, playerCount),
		MinRoundRTP:      math.MaxFloat64,
		MinCumulativeRTP: math.MaxFloat64,
		MinWindowRTP:     math.MaxFloat64,
	}
}

func (s *Stats) observeRoundRTP(rtp float64) {
	if s.roundRTPSamples == 0 || rtp < s.MinRoundRTP {
		s.MinRoundRTP = rtp
	}
	if rtp > s.MaxRoundRTP {
		s.MaxRoundRTP = rtp
	}
	s.roundRTPSamples++
}

func (s *Stats) observeCumulativeRTP(rtp float64) {
	if s.cumRTPSamples == 0 || rtp < s.MinCumulativeRTP {
		s.MinCumulativeRTP = rtp
	}
	if rtp > s.MaxCumulativeRTP {
		s.MaxCumulativeRTP = rtp
	}
	s.cumRTPSamples++
}

const (
	windowRTPRangeMaxRounds = 2400
	windowRTPHighPct        = 110.0
	windowRTPLowPct         = 80.0
	windowRTPHighStreakOver = 200
)

// ObserveWindowRTPAfterPush 於本局 Push 後記錄滑動窗口 RTP
//   - min/max 範圍：僅前 windowRTPRangeMaxRounds 局
//   - 極端值計數：全程（含 2400 局之後）
func (s *Stats) ObserveWindowRTPAfterPush(roundAfterPush int64, rtp float64, valid bool) {
	if !valid {
		return
	}
	if roundAfterPush <= windowRTPRangeMaxRounds {
		s.observeWindowRangeEarly(rtp)
	}
	s.observeWindowExtreme(rtp, roundAfterPush)
}

func (s *Stats) observeWindowRangeEarly(rtp float64) {
	if s.windowRTPSamples == 0 || rtp < s.MinWindowRTP {
		s.MinWindowRTP = rtp
	}
	if rtp > s.MaxWindowRTP {
		s.MaxWindowRTP = rtp
	}
	s.windowRTPSamples++
}

func (s *Stats) observeWindowExtreme(rtp float64, roundAfterPush int64) {
	if rtp > windowRTPHighPct || rtp < windowRTPLowPct {
		if roundAfterPush <= windowRTPRangeMaxRounds {
			s.windowRTPExtremeFirst2400++
		} else {
			s.windowRTPExtremeAfter2400++
		}
	}
	if rtp > windowRTPHighPct {
		s.windowRTPAbove110Count++
		s.windowRTPAbove110Streak++
		if s.windowRTPAbove110Streak > windowRTPHighStreakOver {
			s.windowRTPAbove110Over200++
		}
	} else {
		s.windowRTPAbove110Streak = 0
	}
	if rtp < windowRTPLowPct {
		s.windowRTPBelow80Count++
	}
}

func (s *Stats) windowRTPExtremeTotal() int64 {
	return s.windowRTPExtremeFirst2400 + s.windowRTPExtremeAfter2400
}

func (s *Stats) Add(r *RoundResult) {
	s.Rounds++
	s.TotalBet += r.TotalBet
	s.MainBetOnly += r.MainBetOnly
	s.MainGamePayout += r.MainGamePayout
	s.ExclExtraMainPayout += r.ExclExtraMainPayout
	s.BonusGamePayout += r.BonusGamePayout
	s.GrandPrizePayout += r.GrandPrizePayout
	if r.TwoSame {
		s.TwoSameOccurs++
	}
	if r.ThreeSame {
		s.ThreeSameOccurs++
	}
	s.BonusQualifiedTotal += int64(r.BonusQualifiedCount)
	for lv := 1; lv <= 5; lv++ {
		s.BonusLevelEnter[lv] += int64(r.BonusLevelEnter[lv])
		s.BonusLevelPass[lv] += int64(r.BonusLevelPass[lv])
		s.BonusLevelFail[lv] += int64(r.BonusLevelFail[lv])
	}
	s.BonusCashoutTotal += int64(r.BonusCashoutTotal)
	s.BonusGrandTotal += int64(r.BonusGrandTotal)
	for i := range r.PlayerGrandPayout {
		if gp := r.PlayerGrandPayout[i]; gp > s.MaxSingleJPPayout {
			s.MaxSingleJPPayout = gp
		}
	}
	if r.GrandPrizePayout > s.MaxRoundJPPayout {
		s.MaxRoundJPPayout = r.GrandPrizePayout
	}
	s.V3Interventions += int64(r.V3InterventionCount)

	z := s.PerZone[r.ZoneCode]
	if z == nil {
		z = &ZoneStats{}
		s.PerZone[r.ZoneCode] = z
	}
	z.Hits++
	z.V3Interventions += int64(r.V3InterventionCount)
	z.TotalBet += r.TotalBet
	z.MainPayout += r.MainGamePayout
	z.BonusPayout += r.BonusGamePayout
	z.GrandPayout += r.GrandPrizePayout

	for i := range r.PlayerBet {
		bet := r.PlayerBet[i]
		mp := r.PlayerMainPayout[i]
		bp := r.PlayerBonusPayout[i]
		gp := r.PlayerGrandPayout[i]
		s.PerPlayer[i].TotalBet += bet
		s.PerPlayer[i].MainPayout += mp
		s.PerPlayer[i].BonusPayout += bp
		s.PerPlayer[i].GrandPayout += gp
		if r.PlayerBuyPaid[i] {
			s.PerPlayer[i].BuyerRounds++
			s.PerPlayer[i].BuyerBet += bet
			s.PerPlayer[i].BuyerMain += mp
			s.PerPlayer[i].BuyerBonus += bp
			s.PerPlayer[i].BuyerGrand += gp
			s.BuyerRounds++
			s.BuyerBet += bet
			s.BuyerMain += mp
			s.BuyerBonus += bp
			s.BuyerGrand += gp
		} else {
			s.PerPlayer[i].NonBuyerRounds++
			s.PerPlayer[i].NonBuyerBet += bet
			s.PerPlayer[i].NonBuyerMain += mp
			s.PerPlayer[i].NonBuyerBonus += bp
			s.PerPlayer[i].NonBuyerGrand += gp
			s.NonBuyerRounds++
			s.NonBuyerBet += bet
			s.NonBuyerMain += mp
			s.NonBuyerBonus += bp
			s.NonBuyerGrand += gp
		}
		if r.PlayerInBonus[i] {
			s.PerPlayer[i].JPQualifiedCount++
		}
		if r.PlayerInGrand[i] {
			s.PerPlayer[i].JPGrandCount++
		}
	}

	if r.TotalBet > 0 {
		s.observeRoundRTP(r.RTPPayout() / r.TotalBet * 100)
	}
	if s.TotalBet > 0 {
		s.observeCumulativeRTP(s.OverallRTP())
	}
}

// OverallRTP — 不含 grand prize（依用戶定義）
func (s *Stats) OverallRTP() float64 {
	if s.TotalBet <= 0 {
		return 0
	}
	return (s.MainGamePayout + s.BonusGamePayout) / s.TotalBet * 100
}

// MainRTP — 僅主遊戲
func (s *Stats) MainRTP() float64 {
	if s.TotalBet <= 0 {
		return 0
	}
	return s.MainGamePayout / s.TotalBet * 100
}

// BonusRTP — 僅二級玩法
func (s *Stats) BonusRTP() float64 {
	if s.TotalBet <= 0 {
		return 0
	}
	return s.BonusGamePayout / s.TotalBet * 100
}

// GrandRTP — 僅大獎（單獨參考）
func (s *Stats) GrandRTP() float64 {
	if s.TotalBet <= 0 {
		return 0
	}
	return s.GrandPrizePayout / s.TotalBet * 100
}

// IncludingGrandRTP — 全部含 grand（單獨參考）
func (s *Stats) IncludingGrandRTP() float64 {
	if s.TotalBet <= 0 {
		return 0
	}
	return (s.MainGamePayout + s.BonusGamePayout + s.GrandPrizePayout) / s.TotalBet * 100
}

// ExclExtraMainRTP — 主遊戲 RTP（不含 EXTRA：分母=主注，分子=僅免費閃電主遊戲派彩）
func (s *Stats) ExclExtraMainRTP() float64 {
	if s.MainBetOnly <= 0 {
		return 0
	}
	return s.ExclExtraMainPayout / s.MainBetOnly * 100
}

func (s *Stats) ExclExtraBonusRTP() float64 {
	if s.MainBetOnly <= 0 {
		return 0
	}
	return s.BonusGamePayout / s.MainBetOnly * 100
}

func (s *Stats) ExclExtraGrandRTP() float64 {
	if s.MainBetOnly <= 0 {
		return 0
	}
	return s.GrandPrizePayout / s.MainBetOnly * 100
}

// ExclExtraIncludingGrandRTP — 不含 EXTRA 加價與付費閃電，分母=主注合計
func (s *Stats) ExclExtraIncludingGrandRTP() float64 {
	if s.MainBetOnly <= 0 {
		return 0
	}
	return (s.ExclExtraMainPayout + s.BonusGamePayout + s.GrandPrizePayout) / s.MainBetOnly * 100
}

func (s *Stats) BuyerRTP() float64 {
	if s.BuyerBet <= 0 {
		return 0
	}
	return (s.BuyerMain + s.BuyerBonus) / s.BuyerBet * 100
}
func (s *Stats) BuyerIncludingGrandRTP() float64 {
	if s.BuyerBet <= 0 {
		return 0
	}
	return (s.BuyerMain + s.BuyerBonus + s.BuyerGrand) / s.BuyerBet * 100
}

func (s *Stats) NonBuyerRTP() float64 {
	if s.NonBuyerBet <= 0 {
		return 0
	}
	return (s.NonBuyerMain + s.NonBuyerBonus) / s.NonBuyerBet * 100
}
