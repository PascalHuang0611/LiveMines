package main

import (
	"log"
	"path/filepath"
	"sync"
)

// tripleRunSpec 三跑對比的單組風控組合
type tripleRunSpec struct {
	label   string
	mode    int
	toggles RunToggles
}

// tripleRunSpecs 三跑對比：無風控 / 僅V2 / V2+V3+V4
func tripleRunSpecs(cfg *Config) [3]tripleRunSpec {
	return [3]tripleRunSpec{
		{label: "run1_no_control", mode: 0, toggles: RunToggles{}},
		{label: "run2_v2_only", mode: cfg.RTPControl.Mode, toggles: RunToggles{V2: true}},
		{label: "run3_v2_v3_v4", mode: cfg.RTPControl.Mode, toggles: RunToggles{V2: true, V3: true, V4: true}},
	}
}

// runReplayTripleSummaries 三跑 replay（無風控 / 僅V2 / V2+V3+V4），baseOutDir 非空時寫報表
func runReplayTripleSummaries(cfg *Config, mcs map[string]*MathConfig, csvRounds []ReplayRound,
	cycles int, masterSeed int64, zones []ZoneSpec, baseOutDir string) map[string]Summary {

	specs := tripleRunSpecs(cfg)
	var sums [3]Summary
	var wg sync.WaitGroup
	wg.Add(3)
	for i := range specs {
		go func(i int) {
			defer wg.Done()
			sp := specs[i]
			out := ""
			if baseOutDir != "" {
				out = filepath.Join(baseOutDir, sp.label)
			}
			sums[i] = runReplay(cfg, mcs, csvRounds, cycles, sp.mode, masterSeed, zones, sp.toggles, out, sp.label)
		}(i)
	}
	wg.Wait()

	runs := map[string]Summary{}
	for i, sp := range specs {
		runs[sp.label] = sums[i]
	}
	if baseOutDir != "" {
		totalRounds := int64(len(csvRounds)) * int64(cycles)
		if err := WriteTripleCompare(baseOutDir, masterSeed, totalRounds, runs); err != nil {
			log.Fatalf("寫 replay triple 報告失敗: %v", err)
		}
	}
	return runs
}
