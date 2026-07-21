package main

import (
	"fmt"
	"log"
	"os"
	"strings"
	"time"
)

/**
 * @brief 跑一次完整模擬，輸出報表，回傳 Summary
 * @param toggles 風控開關組合（V2 機率表 / V3 JP 強控 / V4 風險權重）
 */
func runOnce(cfg *Config, mcs map[string]*MathConfig, mode int, masterSeed int64,
	zones []ZoneSpec, toggles RunToggles, outDir string, label string) Summary {

	sel, err := NewSelector(zones)
	if err != nil {
		log.Fatalf("[%s] 建立 selector 失敗: %v", label, err)
	}
	pool := NewPool(cfg)
	window := NewRTPWindow(cfg.Simulation.RTPWindowRounds, cfg.Simulation.InitialRTP)
	engine := NewEngine(cfg, sel, mcs, pool, mode, masterSeed, toggles, window)
	zoneCodes := make([]int, 0, len(zones))
	for _, z := range zones {
		zoneCodes = append(zoneCodes, z.Code)
	}
	stats := NewStats(cfg.Players.Count, zoneCodes)
	players := make([]Player, cfg.Players.Count)
	for i := range players {
		players[i].ID = i
	}

	strategy := cfg.Players.BettingStrategy
	if strategy == "" {
		strategy = BettingStrategyRandom
	}
	log.Printf("[%s] %s betting=%s 開始 rounds=%d seed=%d",
		label, describeToggles(mode, toggles), strategy, cfg.Simulation.Rounds, masterSeed)
	start := time.Now()
	const logEvery = 1_000_000
	for i := int64(0); i < cfg.Simulation.Rounds; i++ {
		rtp, valid := window.CurrentRTP()
		r := engine.RunRound(players, i, rtp, valid)
		stats.Add(r)
		window.Push(r.TotalBet, r.RTPPayout())
		postRTP, postValid := window.CurrentRTP()
		stats.ObserveWindowRTPAfterPush(window.TotalRounds(), postRTP, postValid)

		if (i+1)%logEvery == 0 {
			log.Printf("  [%s] 進度 %d / %d，RTP=%.4f%% main_pool=%.2f sub_pool=%.2f",
				label, i+1, cfg.Simulation.Rounds, stats.OverallRTP(), pool.MainPool, pool.SubPool)
		}
	}
	wall := time.Since(start).Seconds()

	sum := BuildSummary(label, mode, cfg, stats, pool, wall, engine)
	if outDir != "" {
		if err := WriteReport(outDir, sum, sum.PerZone, stats.PerPlayer); err != nil {
			log.Fatalf("[%s] 寫報表失敗: %v", label, err)
		}
	}
	printRunReport(label, mode, toggles, sum)
	_ = os.Stdout.Sync()
	return sum
}

// describeToggles 執行標頭描述
func describeToggles(mode int, t RunToggles) string {
	parts := []string{}
	if t.V2 {
		parts = append(parts, fmt.Sprintf("V2(mode=%d)", mode))
	}
	if t.V3 {
		parts = append(parts, "V3")
	}
	if t.V4 {
		parts = append(parts, "V4")
	}
	if len(parts) == 0 {
		return "風控=無（純 BASE）"
	}
	return "風控=" + strings.Join(parts, "+")
}

/**
 * @brief 分區塊 Console 報告（欄位對齊）
 */
func printRunReport(label string, mode int, toggles RunToggles, sum Summary) {
	var b strings.Builder
	section := func(title string) {
		fmt.Fprintf(&b, "\n══════ [%s] %s ══════\n", label, title)
	}
	row := func(name string, format string, args ...interface{}) {
		fmt.Fprintf(&b, "  %-26s %s\n", name, fmt.Sprintf(format, args...))
	}

	section("模擬摘要")
	row("局數 / 耗時", "%s 局 / %.2f s", comma(sum.RoundsSimulated), sum.WallSeconds)
	row("風控組合", "%s", describeToggles(mode, toggles))
	row("玩家策略", "%s", sum.PlayerBettingStrategy)

	section("RTP 總覽（分母=總下注，含 EXTRA 加價）")
	o := sum.Overall
	row("總下注", "%s", commaF(o.TotalBet))
	row("RTP（不含大獎）", "%8.4f%%   （主遊戲 %.4f%% + 二級 %.4f%%）", o.RTPPercent, o.MainRTPPercent, o.BonusRTPPercent)
	row("RTP（含大獎）", "%8.4f%%   （大獎 %.4f%%）", o.IncludingGrandRTP, o.GrandRTPPercent)
	x := sum.ExclExtra
	row("不含EXTRA口徑 RTP", "%8.4f%%   （主 %.4f%% / 二級 %.4f%% / 大獎 %.4f%%，分母=主注 %s）",
		x.IncludingGrandRTP, x.MainRTPPercent, x.BonusRTPPercent, x.GrandRTPPercent, commaF(x.MainBetOnly))
	bb := sum.RTPSplitByPaidLightning.Buyer
	if bb.TotalBet > 0 {
		row("EXTRA 買家子集", "%8.4f%%（含大獎，rounds=%s bet=%s）", bb.IncludingGrandRTP, comma(bb.Rounds), commaF(bb.TotalBet))
	}
	nb := sum.RTPSplitByPaidLightning.NonBuyer
	if nb.TotalBet > 0 {
		row("未購買子集", "%8.4f%%（不含大獎）", nb.RTPPercent)
	}

	if len(sum.PerZone) > 0 {
		section("V2 機率表（zone 停留分布）")
		fmt.Fprintf(&b, "  %-6s %-6s %12s %9s %10s %12s\n", "zone", "math", "局數", "占比", "V3介入", "區間RTP")
		for _, z := range sum.PerZone {
			if z.Hits == 0 {
				continue
			}
			fmt.Fprintf(&b, "  %-6d %-6s %12s %8.2f%% %10d %11.4f%%\n",
				z.Code, z.MathConfig, comma(z.Hits), z.HitRatePercent, z.V3Interventions, z.RTPPercent)
		}
		if v2 := sum.ControlStats.V2; v2 != nil {
			row("zone 切換次數", "%d", v2.ZoneSwitches)
		}
	}

	if v3 := sum.ControlStats.V3; v3 != nil {
		section("V3 JP 開獎強控")
		row("檢查關數 / 介入關數", "%s / %s", comma(v3.Checks), comma(v3.TotalInterventions))
		row("預估省下派彩", "%s", commaF(v3.SavedPayout))
		fmt.Fprintf(&b, "  %-10s %8s %8s %8s %8s %8s %10s\n", "階段", "L1", "L2", "L3", "L4", "L5", "合計")
		for _, p := range v3.PerPhase {
			fmt.Fprintf(&b, "  %-10s %8d %8d %8d %8d %8d %10d\n",
				p.Code, p.PerLevel[0], p.PerLevel[1], p.PerLevel[2], p.PerLevel[3], p.PerLevel[4], p.Total)
		}
	}

	if v4 := sum.ControlStats.V4; v4 != nil {
		section("V4 風險分數（TRS/LRS）")
		row("重算局數", "%s", comma(v4.RoundsComputed))
		row("權重非中性局數", "%s（%.2f%%）", comma(v4.NonNeutralRounds), v4.NonNeutralPercent)
		row("模組失效占比", "TRS %.2f%% / LRS %.2f%%", v4.TRSFailedPercent, v4.LRSFailedPercent)
		row("平滑分數範圍", "TRS [%.1f, %.1f] / LRS [%.1f, %.1f]", v4.MinTRS, v4.MaxTRS, v4.MinLRS, v4.MaxLRS)
		fmt.Fprintf(&b, "  %-26s", "各格平均 TRS")
		for i := 0; i < 9; i++ {
			fmt.Fprintf(&b, " %6.2f", v4.AvgSmoothedTRS[i])
		}
		fmt.Fprintf(&b, "\n  %-26s", "各格平均 LRS")
		for i := 0; i < 9; i++ {
			fmt.Fprintf(&b, " %6.2f", v4.AvgSmoothedLRS[i])
		}
		fmt.Fprintln(&b)
	}

	section("RTP 極端值（滑動窗口）")
	rr := sum.RTPRange
	row("單局 RTP 範圍", "[%.4f%%, %.4f%%]", rr.MinRoundRTPPercent, rr.MaxRoundRTPPercent)
	row("累計 RTP 範圍", "[%.4f%%, %.4f%%]", rr.MinCumulativeRTPPercent, rr.MaxCumulativeRTPPercent)
	if rr.WindowSamples > 0 {
		row(fmt.Sprintf("窗口 RTP 範圍（前%d局）", rr.WindowRangeMaxRounds), "[%.4f%%, %.4f%%]（樣本 %s）",
			rr.MinWindowRTPPercent, rr.MaxWindowRTPPercent, comma(rr.WindowSamples))
	}
	row("極端局數（>110% 或 <80%）", "前段 %s / 後段 %s / 全程 %s",
		comma(rr.WindowExtremeCountFirst2400), comma(rr.WindowExtremeCountAfter2400), comma(rr.WindowExtremeCountTotal))
	row("極端明細（全程）", ">110%%=%s  <80%%=%s  連續>110%%超%d局=%s",
		comma(rr.WindowAbove110Count), comma(rr.WindowBelow80Count),
		windowRTPHighStreakOver, comma(rr.WindowAbove110Over200Count))

	section("JP 池與二級")
	jp := sum.JPPool
	row("主池 / 副池", "%s → %s   /   %s → %s",
		commaF(jp.MainPoolStart), commaF(jp.MainPoolEnd), commaF(jp.SubPoolStart), commaF(jp.SubPoolEnd))
	row("抽水（主/副）", "%s / %s", commaF(jp.TotalRakeMain), commaF(jp.TotalRakeSub))
	row("自動注資", "%d 次 共 %s", jp.AutoInjectEvents, commaF(jp.AutoInjectTotal))
	row("大獎發放", "總額 %s（單人最大 %s / 單局最大 %s）",
		commaF(jp.GrandPrizeTotal), commaF(jp.MaxSingleJPPayout), commaF(jp.MaxRoundJPPayout))
	br := sum.BallResults
	row("球型", "二同 %s（%.4f%%） 三同 %s（%.4f%%）",
		comma(br.TwoSameOccurrences), br.TwoSameRatePercent,
		comma(br.ThreeSameOccurrences), br.ThreeSameRatePercent)
	bd := sum.BonusDetail
	row("二級", "合格 %s / cashout %s / grand %s",
		comma(bd.QualifiedPlayers), comma(bd.CashoutTotal), comma(bd.GrandTotal))
	for _, lv := range bd.PerLevel {
		if lv.Enter == 0 {
			continue
		}
		row(fmt.Sprintf("  L%d", lv.Level), "入場 %-12s 過關 %-12s 失敗 %s",
			comma(lv.Enter), comma(lv.Pass), comma(lv.Fail))
	}

	fmt.Print(b.String())
}
