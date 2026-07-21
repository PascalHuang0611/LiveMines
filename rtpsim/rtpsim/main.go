//go:build !gui

package main

import (
	"flag"
	"log"
	"path/filepath"
	"sync"
	"time"
)

var (
	configPath      = flag.String("config", "sim_config.json", "JSON config 檔路徑")
	overrideRounds  = flag.Int64("rounds", 0, "覆蓋 simulation.rounds（0=用 config 值）")
	overrideWorkers = flag.Int("workers", 0, "覆蓋 simulation.workers（0=用 config 值）")
	overrideSeed    = flag.Int64("seed", -1, "覆蓋 simulation.rng_seed（-1=用 config 值）")
	overrideOut     = flag.String("out", "", "覆蓋 output.dir")
	triple          = flag.Bool("triple", false, "跑三種風控設定的對比（同 seed / 同玩家決策）")
	allExtra        = flag.Bool("all-extra", false, "全員強制購買 EXTRA（仍消耗 RNG 保持 seed 對齊）")

	// replay 模式：固定賽果 CSV + N 次循環
	replayCSV    = flag.String("replay", "", "固定賽果 CSV 路徑（含 ball1/ball2/ball3 欄位）")
	replayCycles = flag.Int("cycles", 30, "replay 模式循環次數（總局數 = CSV 行數 × cycles）")
	replayMode   = flag.Int("replay-mode", 0, "replay 模式風控 mode（0=無風控，直接驗 raw RTP；1=自動；101-203=強制）")
)

func main() {
	flag.Parse()

	cfg, err := LoadConfig(*configPath)
	if err != nil {
		log.Fatalf("載入 config 失敗: %v", err)
	}
	if *overrideRounds > 0 {
		cfg.Simulation.Rounds = *overrideRounds
	}
	if *overrideWorkers > 0 {
		cfg.Simulation.Workers = *overrideWorkers
	}
	if *overrideSeed != -1 {
		cfg.Simulation.RNGSeed = *overrideSeed
	}
	if *overrideOut != "" {
		cfg.Output.Dir = *overrideOut
	}

	if *allExtra {
		cfg.Players.ForceAllPaidLightning = true
	}

	mathConfigs, err := LoadMathConfigs(cfg)
	if err != nil {
		log.Fatalf("載入 math configs 失敗: %v", err)
	}
	log.Printf("已載入 %d 份 math configs", len(mathConfigs))

	seed := cfg.Simulation.RNGSeed
	if seed == 0 {
		seed = time.Now().UnixNano()
	}

	// replay 模式：讀 CSV 固定賽果，循環跑 N 次
	if *replayCSV != "" {
		csvRounds, err := LoadReplayCSV(*replayCSV)
		if err != nil {
			log.Fatalf("載入 replay CSV 失敗: %v", err)
		}
		log.Printf("已載入 replay CSV: %d 局", len(csvRounds))
		outDir := cfg.Output.Dir
		if *overrideOut != "" {
			outDir = *overrideOut
		} else {
			outDir = filepath.Join(outDir, "replay")
		}
		if *triple {
			// -replay + -triple：同 CSV / 同 seed，三種風控設定並行對比
			runReplayTriple(cfg, mathConfigs, csvRounds, *replayCycles, seed, cfg.RTPControl.Zones, outDir)
		} else {
			toggles := RunToggles{
				V2: *replayMode != 0,
				V3: cfg.RTPControl.JPProtectionV3.Enabled,
				V4: cfg.RTPControl.RiskScoreV4,
			}
			runReplay(cfg, mathConfigs, csvRounds, *replayCycles, *replayMode, seed, cfg.RTPControl.Zones, toggles, outDir, "replay")
		}
		return
	}

	if *triple {
		runTriple(cfg, mathConfigs, seed)
		return
	}

	toggles := RunToggles{V2: true, V3: cfg.RTPControl.JPProtectionV3.Enabled, V4: cfg.RTPControl.RiskScoreV4}
	runOnce(cfg, mathConfigs, cfg.RTPControl.Mode, seed, cfg.RTPControl.Zones, toggles, cfg.Output.Dir, "single")
}

/**
 * @brief 三跑：無風控 / 僅V2 / V2+V3+V4
 *        同 masterSeed → 同玩家決策（bet 位置、paid 購買、cashout、4 選 1）
 */
func runTriple(cfg *Config, mcs map[string]*MathConfig, seed int64) {
	log.Printf("=== 三跑對比模式（並行）(master_seed=%d, rounds=%d) ===", seed, cfg.Simulation.Rounds)

	specs := tripleRunSpecs(cfg)
	var sums [3]Summary
	var wg sync.WaitGroup
	wg.Add(3)
	for i := range specs {
		go func(i int) {
			defer wg.Done()
			sp := specs[i]
			sums[i] = runOnce(cfg, mcs, sp.mode, seed, cfg.RTPControl.Zones, sp.toggles,
				filepath.Join(cfg.Output.Dir, sp.label), sp.label)
		}(i)
	}
	wg.Wait()

	// 對比報告
	runs := map[string]Summary{}
	for i, sp := range specs {
		runs[sp.label] = sums[i]
	}
	if err := WriteTripleCompare(cfg.Output.Dir, seed, cfg.Simulation.Rounds, runs); err != nil {
		log.Fatalf("寫對比報告失敗: %v", err)
	}

	PrintTripleCompareTables("=== 三跑 RTP 對比（無風控 / 僅V2 / V2+V3+V4）===", runs)
}
