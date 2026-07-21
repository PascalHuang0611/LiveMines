package main

import (
	"encoding/csv"
	"encoding/json"
	"fmt"
	"log"
	"os"
	"path/filepath"
	"sort"
	"strconv"
)

type Summary struct {
	RoundsSimulated       int64   `json:"rounds_simulated"`
	WallSeconds           float64 `json:"wall_seconds"`
	Mode                  int     `json:"mode"`
	Label                 string  `json:"label"`
	PlayerBettingStrategy string  `json:"player_betting_strategy"`

	Overall struct {
		TotalBet          float64 `json:"total_bet"`
		MainGamePayout    float64 `json:"main_game_payout"`
		BonusGamePayout   float64 `json:"bonus_game_payout"`
		GrandPrizePayout  float64 `json:"grand_prize_payout"`
		RTPPercent        float64 `json:"rtp_percent_excl_grand"` // RTP（不含大獎）
		MainRTPPercent    float64 `json:"main_rtp_percent"`       // 僅主遊戲
		BonusRTPPercent   float64 `json:"bonus_rtp_percent"`      // 僅二級玩法
		GrandRTPPercent   float64 `json:"grand_rtp_percent"`      // 僅大獎
		IncludingGrandRTP float64 `json:"rtp_percent_incl_grand"` // 全含（參考）
	} `json:"overall"`

	ExclExtra struct {
		MainBetOnly       float64 `json:"main_bet_only"`              // 主注合計（不含 EXTRA 加價）
		MainGamePayout    float64 `json:"main_game_payout_free_only"` // 僅免費閃電主遊戲派彩
		BonusGamePayout   float64 `json:"bonus_game_payout"`
		GrandPrizePayout  float64 `json:"grand_prize_payout"`
		MainRTPPercent    float64 `json:"main_rtp_percent"`
		BonusRTPPercent   float64 `json:"bonus_rtp_percent"`
		GrandRTPPercent   float64 `json:"grand_rtp_percent"`
		IncludingGrandRTP float64 `json:"rtp_percent_incl_grand"`
	} `json:"rtp_excl_extra"`

	RTPRange struct {
		MinRoundRTPPercent          float64 `json:"min_round_rtp_percent_excl_grand"`
		MaxRoundRTPPercent          float64 `json:"max_round_rtp_percent_excl_grand"`
		MinCumulativeRTPPercent     float64 `json:"min_cumulative_rtp_percent_excl_grand"`
		MaxCumulativeRTPPercent     float64 `json:"max_cumulative_rtp_percent_excl_grand"`
		WindowRangeMaxRounds        int64   `json:"window_range_max_rounds,omitempty"`
		MinWindowRTPPercent         float64 `json:"min_window_rtp_percent_excl_grand,omitempty"`
		MaxWindowRTPPercent         float64 `json:"max_window_rtp_percent_excl_grand,omitempty"`
		WindowSamples               int64   `json:"window_rtp_samples,omitempty"`
		WindowExtremeCountFirst2400 int64   `json:"window_extreme_count_first_2400,omitempty"`
		WindowExtremeCountAfter2400 int64   `json:"window_extreme_count_after_2400,omitempty"`
		WindowExtremeCountTotal     int64   `json:"window_extreme_count_total,omitempty"`
		WindowAbove110Count         int64   `json:"window_above_110_count,omitempty"`
		WindowBelow80Count          int64   `json:"window_below_80_count,omitempty"`
		WindowAbove110Over200Count  int64   `json:"window_above_110_over_200_streak_count,omitempty"`
	} `json:"rtp_range_excl_grand"`

	RTPSplitByPaidLightning struct {
		Buyer    SubsetStats `json:"buyer_subset"`
		NonBuyer SubsetStats `json:"nonbuyer_subset"`
	} `json:"rtp_split_by_paid_lightning"`

	JPPool struct {
		MainPoolStart     float64 `json:"main_pool_start"`
		MainPoolEnd       float64 `json:"main_pool_end"`
		SubPoolStart      float64 `json:"sub_pool_start"`
		SubPoolEnd        float64 `json:"sub_pool_end"`
		TotalRakeMain     float64 `json:"total_rake_main"`
		TotalRakeSub      float64 `json:"total_rake_sub"`
		AutoInjectEvents  int64   `json:"auto_inject_events"`
		AutoInjectTotal   float64 `json:"auto_inject_total"`
		GrandPrizeTotal   float64 `json:"grand_prize_total"`
		MaxSingleJPPayout float64 `json:"max_single_jp_payout"`
		MaxRoundJPPayout  float64 `json:"max_round_jp_payout"`
	} `json:"jp_pool"`

	PerZone []ZoneSummary `json:"per_zone"`

	// 各層風控統計（未啟用的層為 nil）
	ControlStats struct {
		V2 *V2Summary `json:"v2,omitempty"`
		V3 *V3Summary `json:"v3,omitempty"`
		V4 *V4Summary `json:"v4,omitempty"`
	} `json:"control_stats"`

	BallResults struct {
		TwoSameOccurrences   int64   `json:"two_same_occurrences"`
		TwoSameRatePercent   float64 `json:"two_same_rate_percent"`
		ThreeSameOccurrences int64   `json:"three_same_occurrences"`
		ThreeSameRatePercent float64 `json:"three_same_rate_percent"`
	} `json:"ball_results"`

	ThreeSameBalls struct {
		Occurrences int64   `json:"occurrences"`
		RatePercent float64 `json:"rate_percent"`
	} `json:"three_same_balls"`

	BonusDetail struct {
		QualifiedPlayers int64           `json:"qualified_players"`
		CashoutTotal     int64           `json:"cashout_total"`
		GrandTotal       int64           `json:"grand_total"`
		PerLevel         []BonusLevelRow `json:"per_level"`
	} `json:"bonus_detail"`

	PerPlayerQuantiles *Quantiles `json:"per_player_quantiles,omitempty"`
}

type BonusLevelRow struct {
	Level int   `json:"level"`
	Enter int64 `json:"enter"`
	Pass  int64 `json:"pass"`
	Fail  int64 `json:"fail"`
}

// V2Summary V2 機率表切換統計
type V2Summary struct {
	ZoneSwitches int `json:"zone_switches"`
}

// V3Summary V3 JP 開獎強控統計
type V3Summary struct {
	Checks             int64        `json:"checks"`              // 進入檢查的關數
	TotalInterventions int64        `json:"total_interventions"` // 實際介入關數
	SavedPayout        float64      `json:"saved_payout"`        // 預估省下派彩
	PerPhase           []V3PhaseRow `json:"per_phase"`
}

type V3PhaseRow struct {
	Code     string   `json:"code"`
	PerLevel [5]int64 `json:"per_level"` // BG L1~L5 介入次數
	Total    int64    `json:"total"`
}

// V4Summary V4 風險分數統計
type V4Summary struct {
	RoundsComputed    int64      `json:"rounds_computed"`
	NonNeutralRounds  int64      `json:"non_neutral_rounds"`
	NonNeutralPercent float64    `json:"non_neutral_percent"`
	TRSFailedPercent  float64    `json:"trs_module_failed_percent"`
	LRSFailedPercent  float64    `json:"lrs_module_failed_percent"`
	AvgSmoothedTRS    [9]float64 `json:"avg_smoothed_trs"`
	AvgSmoothedLRS    [9]float64 `json:"avg_smoothed_lrs"`
	MinTRS            float64    `json:"min_trs"`
	MaxTRS            float64    `json:"max_trs"`
	MinLRS            float64    `json:"min_lrs"`
	MaxLRS            float64    `json:"max_lrs"`
}

type SubsetStats struct {
	Rounds            int64   `json:"rounds"`
	TotalBet          float64 `json:"total_bet"`
	MainPayout        float64 `json:"main_payout"`
	BonusPayout       float64 `json:"bonus_payout"`
	GrandPayout       float64 `json:"grand_payout"`
	RTPPercent        float64 `json:"rtp_percent_excl_grand"`
	MainRTPPercent    float64 `json:"main_rtp_percent"`
	BonusRTPPercent   float64 `json:"bonus_rtp_percent"`
	GrandRTPPercent   float64 `json:"grand_rtp_percent"`
	IncludingGrandRTP float64 `json:"rtp_percent_incl_grand"`
}

func buildSubsetStats(rounds int64, bet, main, bonus, grand float64) SubsetStats {
	ss := SubsetStats{
		Rounds: rounds, TotalBet: bet,
		MainPayout: main, BonusPayout: bonus, GrandPayout: grand,
	}
	if bet > 0 {
		ss.RTPPercent = (main + bonus) / bet * 100
		ss.MainRTPPercent = main / bet * 100
		ss.BonusRTPPercent = bonus / bet * 100
		ss.GrandRTPPercent = grand / bet * 100
		ss.IncludingGrandRTP = (main + bonus + grand) / bet * 100
	}
	return ss
}

type ZoneSummary struct {
	Code            int     `json:"code"`
	MathConfig      string  `json:"mathconfig"`
	Hits            int64   `json:"hits"`
	HitRatePercent  float64 `json:"hit_rate_percent"`
	V3Interventions int64   `json:"v3_interventions"`
	TotalBet        float64 `json:"total_bet"`
	MainPayout      float64 `json:"main_payout"`
	BonusPayout     float64 `json:"bonus_payout"`
	GrandPayout     float64 `json:"grand_payout"`
	RTPPercent      float64 `json:"rtp_percent_excl_grand"`
}

type Quantiles struct {
	MinRTP float64 `json:"min_rtp"`
	P5     float64 `json:"p5"`
	P25    float64 `json:"p25"`
	P50    float64 `json:"p50"`
	P75    float64 `json:"p75"`
	P95    float64 `json:"p95"`
	MaxRTP float64 `json:"max_rtp"`
}

func BuildSummary(label string, mode int, cfg *Config, s *Stats, pool *Pool, wallSec float64, engine *Engine) Summary {
	sum := Summary{
		RoundsSimulated:       s.Rounds,
		WallSeconds:           wallSec,
		Mode:                  mode,
		Label:                 label,
		PlayerBettingStrategy: DescribePlayerBettingStrategy(cfg),
	}
	sum.Overall.TotalBet = s.TotalBet
	sum.Overall.MainGamePayout = s.MainGamePayout
	sum.Overall.BonusGamePayout = s.BonusGamePayout
	sum.Overall.GrandPrizePayout = s.GrandPrizePayout
	sum.Overall.RTPPercent = s.OverallRTP()
	sum.Overall.MainRTPPercent = s.MainRTP()
	sum.Overall.BonusRTPPercent = s.BonusRTP()
	sum.Overall.GrandRTPPercent = s.GrandRTP()
	sum.Overall.IncludingGrandRTP = s.IncludingGrandRTP()

	sum.ExclExtra.MainBetOnly = s.MainBetOnly
	sum.ExclExtra.MainGamePayout = s.ExclExtraMainPayout
	sum.ExclExtra.BonusGamePayout = s.BonusGamePayout
	sum.ExclExtra.GrandPrizePayout = s.GrandPrizePayout
	sum.ExclExtra.MainRTPPercent = s.ExclExtraMainRTP()
	sum.ExclExtra.BonusRTPPercent = s.ExclExtraBonusRTP()
	sum.ExclExtra.GrandRTPPercent = s.ExclExtraGrandRTP()
	sum.ExclExtra.IncludingGrandRTP = s.ExclExtraIncludingGrandRTP()

	if s.roundRTPSamples > 0 {
		sum.RTPRange.MinRoundRTPPercent = s.MinRoundRTP
		sum.RTPRange.MaxRoundRTPPercent = s.MaxRoundRTP
	}
	if s.cumRTPSamples > 0 {
		sum.RTPRange.MinCumulativeRTPPercent = s.MinCumulativeRTP
		sum.RTPRange.MaxCumulativeRTPPercent = s.MaxCumulativeRTP
	}
	if s.windowRTPSamples > 0 {
		sum.RTPRange.WindowRangeMaxRounds = windowRTPRangeMaxRounds
		sum.RTPRange.MinWindowRTPPercent = s.MinWindowRTP
		sum.RTPRange.MaxWindowRTPPercent = s.MaxWindowRTP
		sum.RTPRange.WindowSamples = s.windowRTPSamples
	}
	sum.RTPRange.WindowExtremeCountFirst2400 = s.windowRTPExtremeFirst2400
	sum.RTPRange.WindowExtremeCountAfter2400 = s.windowRTPExtremeAfter2400
	sum.RTPRange.WindowExtremeCountTotal = s.windowRTPExtremeTotal()
	sum.RTPRange.WindowAbove110Count = s.windowRTPAbove110Count
	sum.RTPRange.WindowBelow80Count = s.windowRTPBelow80Count
	sum.RTPRange.WindowAbove110Over200Count = s.windowRTPAbove110Over200

	sum.RTPSplitByPaidLightning.Buyer = buildSubsetStats(
		s.BuyerRounds, s.BuyerBet, s.BuyerMain, s.BuyerBonus, s.BuyerGrand,
	)
	sum.RTPSplitByPaidLightning.NonBuyer = buildSubsetStats(
		s.NonBuyerRounds, s.NonBuyerBet, s.NonBuyerMain, s.NonBuyerBonus, s.NonBuyerGrand,
	)

	sum.JPPool.MainPoolStart = cfg.EgameData.InitialMainPool
	sum.JPPool.MainPoolEnd = pool.MainPool
	sum.JPPool.SubPoolStart = cfg.EgameData.InitialSubPool
	sum.JPPool.SubPoolEnd = pool.SubPool
	sum.JPPool.TotalRakeMain = pool.TotalRakeMain
	sum.JPPool.TotalRakeSub = pool.TotalRakeSub
	sum.JPPool.AutoInjectEvents = pool.AutoInjectEvents
	sum.JPPool.AutoInjectTotal = pool.AutoInjectTotal
	sum.JPPool.GrandPrizeTotal = pool.GrandPrizePayout
	sum.JPPool.MaxSingleJPPayout = s.MaxSingleJPPayout
	sum.JPPool.MaxRoundJPPayout = s.MaxRoundJPPayout

	codes := make([]int, 0, len(s.PerZone))
	for c := range s.PerZone {
		codes = append(codes, c)
	}
	sort.Ints(codes)
	zoneMath := make(map[int]string, len(cfg.RTPControl.Zones))
	for _, zs := range cfg.RTPControl.Zones {
		zoneMath[zs.Code] = zs.MathConfig
	}
	for _, c := range codes {
		z := s.PerZone[c]
		hitRate := 0.0
		if s.Rounds > 0 {
			hitRate = float64(z.Hits) / float64(s.Rounds) * 100
		}
		sum.PerZone = append(sum.PerZone, ZoneSummary{
			Code: c, MathConfig: zoneMath[c], Hits: z.Hits, HitRatePercent: hitRate,
			V3Interventions: z.V3Interventions,
			TotalBet:        z.TotalBet,
			MainPayout:      z.MainPayout, BonusPayout: z.BonusPayout, GrandPayout: z.GrandPayout,
			RTPPercent: z.RTP(),
		})
	}

	if engine != nil {
		fillControlStats(&sum, engine)
	}

	sum.BallResults.TwoSameOccurrences = s.TwoSameOccurs
	sum.BallResults.ThreeSameOccurrences = s.ThreeSameOccurs
	if s.Rounds > 0 {
		sum.BallResults.TwoSameRatePercent = float64(s.TwoSameOccurs) / float64(s.Rounds) * 100
		sum.BallResults.ThreeSameRatePercent = float64(s.ThreeSameOccurs) / float64(s.Rounds) * 100
	}

	sum.ThreeSameBalls.Occurrences = s.ThreeSameOccurs
	if s.Rounds > 0 {
		sum.ThreeSameBalls.RatePercent = float64(s.ThreeSameOccurs) / float64(s.Rounds) * 100
	}

	sum.BonusDetail.QualifiedPlayers = s.BonusQualifiedTotal
	sum.BonusDetail.CashoutTotal = s.BonusCashoutTotal
	sum.BonusDetail.GrandTotal = s.BonusGrandTotal
	for lv := 1; lv <= 5; lv++ {
		sum.BonusDetail.PerLevel = append(sum.BonusDetail.PerLevel, BonusLevelRow{
			Level: lv,
			Enter: s.BonusLevelEnter[lv],
			Pass:  s.BonusLevelPass[lv],
			Fail:  s.BonusLevelFail[lv],
		})
	}

	if cfg.Output.PerPlayerQuantiles && len(s.PerPlayer) > 0 {
		rtps := make([]float64, 0, len(s.PerPlayer))
		for _, p := range s.PerPlayer {
			rtps = append(rtps, p.RTP())
		}
		sort.Float64s(rtps)
		q := computeQuantiles(rtps)
		sum.PerPlayerQuantiles = &q
	}

	return sum
}

// fillControlStats 依 Engine 的風控開關填入各層統計
func fillControlStats(sum *Summary, e *Engine) {
	if e.toggles.V2 {
		sum.ControlStats.V2 = &V2Summary{ZoneSwitches: e.decider.ZoneSwitches()}
	}
	if v3 := e.v3; v3 != nil {
		v3sum := &V3Summary{Checks: v3.Checks, SavedPayout: v3.SavedPayout}
		for i := 0; i < v3.PhaseCount(); i++ {
			row := V3PhaseRow{Code: v3.PhaseCode(i), PerLevel: v3.Interventions[i]}
			for _, n := range row.PerLevel {
				row.Total += n
			}
			v3sum.TotalInterventions += row.Total
			v3sum.PerPhase = append(v3sum.PerPhase, row)
		}
		sum.ControlStats.V3 = v3sum
	}
	if r := e.risk; r != nil && r.RoundsComputed > 0 {
		v4 := &V4Summary{
			RoundsComputed:   r.RoundsComputed,
			NonNeutralRounds: r.NonNeutralRounds,
			MinTRS:           r.MinTRS, MaxTRS: r.MaxTRS,
			MinLRS: r.MinLRS, MaxLRS: r.MaxLRS,
		}
		n := float64(r.RoundsComputed)
		v4.NonNeutralPercent = float64(r.NonNeutralRounds) / n * 100
		v4.TRSFailedPercent = float64(r.TRSFailedRounds) / n * 100
		v4.LRSFailedPercent = float64(r.LRSFailedRounds) / n * 100
		for i := 0; i < 9; i++ {
			v4.AvgSmoothedTRS[i] = r.SumSmoothedTRS[i] / n
			v4.AvgSmoothedLRS[i] = r.SumSmoothedLRS[i] / n
		}
		sum.ControlStats.V4 = v4
	}
}

func logBuyerExtraRTP(label string, sum Summary) {
	b := sum.RTPSplitByPaidLightning.Buyer
	if b.TotalBet <= 0 {
		return
	}
	log.Printf("[%s]   購買 EXTRA 子集: rounds=%d bet=%.2f main=%.4f%% bonus=%.4f%% grand=%.4f%% ★RTP(含grand)=%.4f%%",
		label, b.Rounds, b.TotalBet,
		b.MainRTPPercent, b.BonusRTPPercent, b.GrandRTPPercent, b.IncludingGrandRTP)
}

func WriteReport(outDir string, sum Summary, perZone []ZoneSummary, players []PlayerStats) error {
	if err := os.MkdirAll(outDir, 0o755); err != nil {
		return err
	}
	if err := writeJSON(filepath.Join(outDir, "summary.json"), sum); err != nil {
		return err
	}
	if err := writePerZoneCSV(filepath.Join(outDir, "per_zone.csv"), perZone); err != nil {
		return err
	}
	if err := writePerPlayerCSV(filepath.Join(outDir, "per_player.csv"), players); err != nil {
		return err
	}
	return nil
}

func writeJSON(path string, v interface{}) error {
	f, err := os.Create(path)
	if err != nil {
		return err
	}
	defer f.Close()
	enc := json.NewEncoder(f)
	enc.SetIndent("", "  ")
	return enc.Encode(v)
}

func writePerZoneCSV(path string, rows []ZoneSummary) error {
	f, err := os.Create(path)
	if err != nil {
		return err
	}
	defer f.Close()
	w := csv.NewWriter(f)
	defer w.Flush()
	_ = w.Write([]string{
		"zone_code", "mathconfig", "hits", "hit_rate_percent",
		"v3_interventions",
		"total_bet", "main_payout", "bonus_payout", "grand_payout", "rtp_percent_excl_grand",
	})
	for _, r := range rows {
		_ = w.Write([]string{
			strconv.Itoa(r.Code),
			r.MathConfig,
			strconv.FormatInt(r.Hits, 10),
			f64(r.HitRatePercent),
			strconv.FormatInt(r.V3Interventions, 10),
			f64(r.TotalBet), f64(r.MainPayout), f64(r.BonusPayout), f64(r.GrandPayout),
			f64(r.RTPPercent),
		})
	}
	return nil
}

func writePerPlayerCSV(path string, players []PlayerStats) error {
	f, err := os.Create(path)
	if err != nil {
		return err
	}
	defer f.Close()
	w := csv.NewWriter(f)
	defer w.Flush()
	_ = w.Write([]string{
		"player_id", "total_bet", "main_payout", "bonus_payout", "grand_payout", "rtp_percent_excl_grand",
		"buyer_rounds", "buyer_bet", "buyer_main", "buyer_bonus", "buyer_grand",
		"buyer_rtp_excl_grand", "buyer_rtp_incl_grand",
		"nonbuyer_rounds", "nonbuyer_bet", "nonbuyer_main", "nonbuyer_bonus", "nonbuyer_grand", "nonbuyer_rtp",
		"jp_qualified_count", "jp_grand_prize_count",
	})
	type row struct {
		id  int
		rtp float64
		p   PlayerStats
	}
	rows := make([]row, len(players))
	for i, p := range players {
		rows[i] = row{id: i, rtp: p.RTP(), p: p}
	}
	sort.Slice(rows, func(i, j int) bool { return rows[i].rtp < rows[j].rtp })
	for _, r := range rows {
		p := r.p
		_ = w.Write([]string{
			strconv.Itoa(r.id),
			f64(p.TotalBet), f64(p.MainPayout), f64(p.BonusPayout), f64(p.GrandPayout), f64(p.RTP()),
			strconv.FormatInt(p.BuyerRounds, 10),
			f64(p.BuyerBet), f64(p.BuyerMain), f64(p.BuyerBonus), f64(p.BuyerGrand),
			f64(p.BuyerRTP()), f64(p.BuyerIncludingGrandRTP()),
			strconv.FormatInt(p.NonBuyerRounds, 10),
			f64(p.NonBuyerBet), f64(p.NonBuyerMain), f64(p.NonBuyerBonus), f64(p.NonBuyerGrand), f64(p.NonBuyerRTP()),
			strconv.FormatInt(p.JPQualifiedCount, 10),
			strconv.FormatInt(p.JPGrandCount, 10),
		})
	}
	return nil
}

func f64(x float64) string { return strconv.FormatFloat(x, 'f', 4, 64) }

func computeQuantiles(sorted []float64) Quantiles {
	if len(sorted) == 0 {
		return Quantiles{}
	}
	pick := func(p float64) float64 {
		idx := int(p * float64(len(sorted)-1))
		if idx < 0 {
			idx = 0
		}
		if idx >= len(sorted) {
			idx = len(sorted) - 1
		}
		return sorted[idx]
	}
	return Quantiles{
		MinRTP: sorted[0],
		P5:     pick(0.05),
		P25:    pick(0.25),
		P50:    pick(0.5),
		P75:    pick(0.75),
		P95:    pick(0.95),
		MaxRTP: sorted[len(sorted)-1],
	}
}

/**
 * @brief 三跑比較報告
 */
type TripleCompare struct {
	MasterSeed int64                 `json:"master_seed"`
	Rounds     int64                 `json:"rounds"`
	Runs       map[string]CompareRow `json:"runs"`
}

type CompareRow struct {
	Mode              int     `json:"mode"`
	TotalBet          float64 `json:"total_bet"`
	MainBetOnly       float64 `json:"main_bet_only"`
	MainPayout        float64 `json:"main_payout"`
	BonusPayout       float64 `json:"bonus_payout"`
	GrandPayout       float64 `json:"grand_payout"`
	RTPExclGrand      float64 `json:"rtp_percent_excl_grand"`
	MainRTP           float64 `json:"main_rtp_percent"`
	BonusRTP          float64 `json:"bonus_rtp_percent"`
	GrandRTP          float64 `json:"grand_rtp_percent"`
	IncludingGrandRTP float64 `json:"rtp_percent_incl_grand"`
	// 含 EXTRA 全體（TotalBet 含加價、主遊戲含付費閃電）
	InclExtraTotalBet          float64        `json:"incl_extra_total_bet"`
	InclExtraIncludingGrandRTP float64        `json:"incl_extra_rtp_percent_incl_grand"`
	WallSeconds                float64        `json:"wall_seconds"`
	BuyerExtra                 *SubsetStats   `json:"buyer_extra,omitempty"`
	ZoneUsage                  []ZoneUsageRow `json:"zone_usage"`
}

type ZoneUsageRow struct {
	Code           int     `json:"zone_code"`
	MathConfig     string  `json:"mathconfig"`
	Hits           int64   `json:"hits"`
	HitRatePercent float64 `json:"hit_rate_percent"`
}

func summaryToCompareRow(s Summary) CompareRow {
	row := CompareRow{
		Mode:                       s.Mode,
		TotalBet:                   s.ExclExtra.MainBetOnly,
		MainBetOnly:                s.ExclExtra.MainBetOnly,
		MainPayout:                 s.ExclExtra.MainGamePayout,
		BonusPayout:                s.ExclExtra.BonusGamePayout,
		GrandPayout:                s.ExclExtra.GrandPrizePayout,
		RTPExclGrand:               s.Overall.RTPPercent,
		MainRTP:                    s.ExclExtra.MainRTPPercent,
		BonusRTP:                   s.ExclExtra.BonusRTPPercent,
		GrandRTP:                   s.ExclExtra.GrandRTPPercent,
		IncludingGrandRTP:          s.ExclExtra.IncludingGrandRTP,
		InclExtraTotalBet:          s.Overall.TotalBet,
		InclExtraIncludingGrandRTP: s.Overall.IncludingGrandRTP,
		WallSeconds:                s.WallSeconds,
		ZoneUsage:                  make([]ZoneUsageRow, 0, len(s.PerZone)),
	}
	for _, z := range s.PerZone {
		row.ZoneUsage = append(row.ZoneUsage, ZoneUsageRow{
			Code: z.Code, MathConfig: z.MathConfig,
			Hits: z.Hits, HitRatePercent: z.HitRatePercent,
		})
	}
	b := s.RTPSplitByPaidLightning.Buyer
	if b.TotalBet > 0 {
		bCopy := b
		row.BuyerExtra = &bCopy
	}
	return row
}

// PrintTripleCompareTables 輸出三跑對比（主表=不含 EXTRA；子表=購買 EXTRA 含 JP）
func PrintTripleCompareTables(title string, runs map[string]Summary) {
	fmt.Print(FormatTripleCompareTables(title, runs))
}

var tripleCompareRunLabels = []string{"run1_no_control", "run2_v2_only", "run3_v2_v3_v4"}

func printTripleCompareZoneUsage(runs map[string]Summary, title string) {
	codes := collectZoneCodesFromRuns(runs)
	if len(codes) == 0 {
		return
	}

	fmt.Println("\n" + title)
	fmt.Printf("%-6s %-8s", "zone", "math")
	for _, lbl := range tripleCompareRunLabels {
		if _, ok := runs[lbl]; ok {
			fmt.Printf("  %-14s", lbl+"_hits")
			fmt.Printf("  %-14s", lbl+"_%")
		}
	}
	fmt.Println()

	for _, code := range codes {
		mathKey := zoneMathConfigFromRuns(runs, code)
		fmt.Printf("%-6d %-8s", code, mathKey)
		for _, lbl := range tripleCompareRunLabels {
			s, ok := runs[lbl]
			if !ok {
				continue
			}
			hits, rate := zoneHitsAndRate(s, code)
			fmt.Printf("  %-14d", hits)
			fmt.Printf("  %-13.2f%%", rate)
		}
		fmt.Println()
	}
}

func collectZoneCodesFromRuns(runs map[string]Summary) []int {
	seen := make(map[int]struct{})
	for _, s := range runs {
		for _, z := range s.PerZone {
			seen[z.Code] = struct{}{}
		}
	}
	codes := make([]int, 0, len(seen))
	for c := range seen {
		codes = append(codes, c)
	}
	sort.Ints(codes)
	return codes
}

func zoneMathConfigFromRuns(runs map[string]Summary, code int) string {
	for _, s := range runs {
		for _, z := range s.PerZone {
			if z.Code == code && z.MathConfig != "" {
				return z.MathConfig
			}
		}
	}
	return ""
}

func zoneHitsAndRate(s Summary, code int) (hits int64, rate float64) {
	for _, z := range s.PerZone {
		if z.Code == code {
			return z.Hits, z.HitRatePercent
		}
	}
	return 0, 0
}

func WriteTripleCompare(outDir string, masterSeed int64, rounds int64, runs map[string]Summary) error {
	c := TripleCompare{
		MasterSeed: masterSeed,
		Rounds:     rounds,
		Runs:       make(map[string]CompareRow, len(runs)),
	}
	for label, s := range runs {
		c.Runs[label] = summaryToCompareRow(s)
	}
	return writeJSON(filepath.Join(outDir, "triple_compare.json"), c)
}

var _ = fmt.Sprintf
