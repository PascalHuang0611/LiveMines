package main

import (
	"fmt"
	"time"
)

// GUIRunRequest GUI 執行參數
type GUIRunRequest struct {
	Bundle               *AppBundle
	PlayerCount          int
	BetPerPosition       float64
	ReplayCycles         int
	ExtraRatePercent     float64 // 0–100
	ForceAllExtra        bool
	BettingStrategy      string
	Seed                 int64
	BonusCashoutPerLevel []float64
}

// GUIRunResult 模擬結果
type GUIRunResult struct {
	Report      string
	SummaryLine string
	ElapsedSec  float64
}

// BuildConfigForGUI 依 GUI 輸入組裝設定
func BuildConfigForGUI(req GUIRunRequest) (*Config, error) {
	cfg, err := ConfigFromBundle(req.Bundle)
	if err != nil {
		return nil, err
	}
	cfg.Players.Count = req.PlayerCount
	cfg.Players.BetPerPosition = req.BetPerPosition
	cfg.Players.BettingStrategy = req.BettingStrategy
	cfg.Players.PaidLightningPurchaseRate = req.ExtraRatePercent / 100.0
	cfg.Players.ForceAllPaidLightning = req.ForceAllExtra
	cfg.Simulation.RNGSeed = req.Seed
	if len(req.BonusCashoutPerLevel) == 4 {
		cfg.Players.BonusCashoutPerLevel = append([]float64(nil), req.BonusCashoutPerLevel...)
	}
	return cfg, nil
}

// RunGUISimulation 執行模擬並回傳 TSV 報告（不寫檔）
func RunGUISimulation(req GUIRunRequest) (*GUIRunResult, error) {
	cfg, err := BuildConfigForGUI(req)
	if err != nil {
		return nil, err
	}
	mcs, err := LoadMathConfigs(cfg)
	if err != nil {
		return nil, err
	}
	csvRounds, err := LoadReplayCSV(req.Bundle.CSVPath)
	if err != nil {
		return nil, err
	}

	seed := cfg.Simulation.RNGSeed
	if seed == 0 {
		seed = time.Now().UnixNano()
	}

	start := time.Now()
	runs := runReplayTripleSummaries(cfg, mcs, csvRounds, req.ReplayCycles, seed, cfg.RTPControl.Zones, "")
	report := FormatTripleCompareTables("=== Replay 三跑 RTP 對比（含 grand，不含 EXTRA）===", runs)

	elapsed := time.Since(start).Seconds()
	totalRounds := int64(len(csvRounds)) * int64(req.ReplayCycles)
	summary := fmt.Sprintf("完成：%d 局 × %d 循環 = %d 局 | seed=%d | 耗時 %.1fs",
		len(csvRounds), req.ReplayCycles, totalRounds, seed, elapsed)

	return &GUIRunResult{
		Report:      report,
		SummaryLine: summary,
		ElapsedSec:  elapsed,
	}, nil
}
