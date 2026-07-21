package main

import (
	"encoding/csv"
	"fmt"
	"io"
	"log"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"sync"
	"time"
)

// ReplayRound 一局固定賽果（來自 CSV）
type ReplayRound struct {
	Ball1, Ball2, Ball3 int32 // 格位 1–9
}

/**
 * @brief 讀取含 ball1/ball2/ball3 欄位的 CSV 檔，回傳固定賽果列表
 * @param path CSV 路徑
 * @return []ReplayRound, error
 */
func LoadReplayCSV(path string) ([]ReplayRound, error) {
	f, err := os.Open(path)
	if err != nil {
		return nil, fmt.Errorf("開啟 CSV %s 失敗: %w", path, err)
	}
	defer f.Close()

	r := csv.NewReader(f)
	r.TrimLeadingSpace = true

	header, err := r.Read()
	if err != nil {
		return nil, fmt.Errorf("讀取 CSV header 失敗: %w", err)
	}

	findCol := func(name string) int {
		for i, h := range header {
			if strings.EqualFold(strings.TrimSpace(h), name) {
				return i
			}
		}
		return -1
	}

	idxB1 := findCol("ball1")
	idxB2 := findCol("ball2")
	idxB3 := findCol("ball3")
	if idxB1 < 0 || idxB2 < 0 || idxB3 < 0 {
		return nil, fmt.Errorf("CSV 缺少 ball1/ball2/ball3 欄位，header=%v", header)
	}

	maxIdx := idxB1
	if idxB2 > maxIdx {
		maxIdx = idxB2
	}
	if idxB3 > maxIdx {
		maxIdx = idxB3
	}

	var rounds []ReplayRound
	lineNum := 1
	for {
		lineNum++
		rec, err := r.Read()
		if err == io.EOF {
			break
		}
		if err != nil {
			return nil, fmt.Errorf("CSV 第 %d 行讀取失敗: %w", lineNum, err)
		}
		if len(rec) <= maxIdx {
			return nil, fmt.Errorf("CSV 第 %d 行欄位數不足（需 %d 欄，實有 %d）", lineNum, maxIdx+1, len(rec))
		}
		b1, e1 := strconv.ParseInt(strings.TrimSpace(rec[idxB1]), 10, 32)
		b2, e2 := strconv.ParseInt(strings.TrimSpace(rec[idxB2]), 10, 32)
		b3, e3 := strconv.ParseInt(strings.TrimSpace(rec[idxB3]), 10, 32)
		if e1 != nil || e2 != nil || e3 != nil {
			return nil, fmt.Errorf("CSV 第 %d 行 ball 值無法解析: %q %q %q",
				lineNum, rec[idxB1], rec[idxB2], rec[idxB3])
		}
		rounds = append(rounds, ReplayRound{Ball1: int32(b1), Ball2: int32(b2), Ball3: int32(b3)})
	}
	if len(rounds) == 0 {
		return nil, fmt.Errorf("CSV 無有效資料行")
	}
	return rounds, nil
}

/**
 * @brief 固定賽果回放模擬
 *        球由 CSV 固定，閃電 / 二級 / 玩家下注仍用 RNG（依 masterSeed + roundIdx）
 * @param csvRounds  載入的固定賽果（每次循環以相同順序重放）
 * @param cycles     循環次數，總局數 = len(csvRounds) × cycles
 * @param mode       風控 mode（建議 0=無風控，直接驗證原始 RTP）
 */
func runReplay(cfg *Config, mcs map[string]*MathConfig, csvRounds []ReplayRound,
	cycles int, mode int, masterSeed int64, zones []ZoneSpec, toggles RunToggles, outDir string, label string) Summary {

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

	// CSV 球型分布統計
	var cntAllDiff, cntTwoSame, cntThreeSame int
	for _, cr := range csvRounds {
		if cr.Ball1 == cr.Ball2 && cr.Ball2 == cr.Ball3 {
			cntThreeSame++
		} else if cr.Ball1 == cr.Ball2 || cr.Ball2 == cr.Ball3 || cr.Ball1 == cr.Ball3 {
			cntTwoSame++
		} else {
			cntAllDiff++
		}
	}
	n := len(csvRounds)
	log.Printf("[%s] CSV 賽果 %d 局：全不同=%d(%.1f%%) 二同=%d(%.1f%%) 三同=%d(%.1f%%)",
		label, n,
		cntAllDiff, float64(cntAllDiff)/float64(n)*100,
		cntTwoSame, float64(cntTwoSame)/float64(n)*100,
		cntThreeSame, float64(cntThreeSame)/float64(n)*100,
	)

	totalRounds := int64(n) * int64(cycles)
	log.Printf("[%s] mode=%d cycles=%d 每循環=%d 局 共=%d 局 seed=%d",
		label, mode, cycles, n, totalRounds, masterSeed)

	strategy := cfg.Players.BettingStrategy
	if strategy == "" {
		strategy = BettingStrategyRandom
	}
	log.Printf("[%s] 玩家策略=%s 人數=%d", label, strategy, cfg.Players.Count)

	start := time.Now()
	roundIdx := int64(0)
	for c := 0; c < cycles; c++ {
		for _, cr := range csvRounds {
			rtp, valid := window.CurrentRTP()
			balls := [3]int32{cr.Ball1, cr.Ball2, cr.Ball3}
			r := engine.RunRoundFixed(players, roundIdx, rtp, valid, balls)
			stats.Add(r)
			window.Push(r.TotalBet, r.RTPPayout())
			postRTP, postValid := window.CurrentRTP()
			stats.ObserveWindowRTPAfterPush(window.TotalRounds(), postRTP, postValid)
			roundIdx++
		}
	}
	wall := time.Since(start).Seconds()

	sum := BuildSummary(label, mode, cfg, stats, pool, wall, engine)
	if outDir != "" {
		if err := WriteReport(outDir, sum, sum.PerZone, stats.PerPlayer); err != nil {
			log.Fatalf("[%s] 寫報表失敗: %v", label, err)
		}
		log.Printf("[%s]   報表輸出: %s", label, outDir)
	}

	if outDir != "" {
		log.Printf("[%s] 完成 wall=%.2fs RTP(不含 grand)=%.4f%% (main=%.4f%% bonus=%.4f%% grand=%.4f%%)",
			label, wall, sum.Overall.RTPPercent,
			sum.Overall.MainRTPPercent, sum.Overall.BonusRTPPercent, sum.Overall.GrandRTPPercent)
		log.Printf("[%s]   含大獎 RTP=%.4f%%", label, sum.Overall.IncludingGrandRTP)
		logBuyerExtraRTP(label, sum)
		rr := sum.RTPRange
		log.Printf("[%s]   RTP範圍(不含grand): 單局 最低=%.4f%% 最高=%.4f%% | 累計 最低=%.4f%% 最高=%.4f%%",
			label,
			rr.MinRoundRTPPercent, rr.MaxRoundRTPPercent,
			rr.MinCumulativeRTPPercent, rr.MaxCumulativeRTPPercent)
		log.Printf("[%s]   球型: 二同=%d(%.4f%%) 三同=%d(%.4f%%)",
			label,
			sum.BallResults.TwoSameOccurrences, sum.BallResults.TwoSameRatePercent,
			sum.BallResults.ThreeSameOccurrences, sum.BallResults.ThreeSameRatePercent)
		log.Printf("[%s]   池水位: main_pool=%.2f (起始 %.2f) sub_pool=%.2f (起始 %.2f)",
			label,
			sum.JPPool.MainPoolEnd, sum.JPPool.MainPoolStart,
			sum.JPPool.SubPoolEnd, sum.JPPool.SubPoolStart)
		bd := sum.BonusDetail
		log.Printf("[%s]   二級: 合格=%d cashout=%d grand=%d", label, bd.QualifiedPlayers, bd.CashoutTotal, bd.GrandTotal)
	}
	return sum
}

/**
 * @brief Replay 三跑對比：同一 CSV + 同 seed，分別跑 無風控 / 僅V2 / V2+V3+V4
 *        與 runTriple 行為一致，但球由 CSV 固定
 */
func runReplayTriple(cfg *Config, mcs map[string]*MathConfig, csvRounds []ReplayRound,
	cycles int, masterSeed int64, zones []ZoneSpec, baseOutDir string) {

	log.Printf("=== Replay 三跑對比模式（並行）master_seed=%d csv=%d局 cycles=%d ===",
		masterSeed, len(csvRounds), cycles)

	specs := tripleRunSpecs(cfg)
	var sums [3]Summary
	var wg sync.WaitGroup
	wg.Add(3)
	for i := range specs {
		go func(i int) {
			defer wg.Done()
			sp := specs[i]
			sums[i] = runReplay(cfg, mcs, csvRounds, cycles, sp.mode, masterSeed, zones, sp.toggles,
				filepath.Join(baseOutDir, sp.label), sp.label)
		}(i)
	}
	wg.Wait()

	runs := map[string]Summary{}
	for i, sp := range specs {
		runs[sp.label] = sums[i]
	}
	totalRounds := int64(len(csvRounds)) * int64(cycles)
	if err := WriteTripleCompare(baseOutDir, masterSeed, totalRounds, runs); err != nil {
		log.Fatalf("寫 replay 對比報告失敗: %v", err)
	}

	PrintTripleCompareTables("=== Replay 三跑 RTP 對比（無風控 / 僅V2 / V2+V3+V4）===", runs)
}
