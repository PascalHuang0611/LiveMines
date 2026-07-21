package main

import (
	"encoding/json"
	"os"
	"path/filepath"
)

// GUIPrefs 本地設定（與執行檔同目錄 rtpsim_gui_prefs.json）
type GUIPrefs struct {
	PlayerCount      int     `json:"player_count"`
	BetPerPosition   float64 `json:"bet_per_position"`
	ReplayCycles     int     `json:"replay_cycles"`
	ExtraRatePercent float64 `json:"extra_rate_percent"`
	ForceAllExtra    bool    `json:"force_all_extra"`
	BettingStrategy  string  `json:"betting_strategy"`
	Seed             int64   `json:"seed"`
	CashoutL1        float64 `json:"cashout_l1"`
	CashoutL2        float64 `json:"cashout_l2"`
	CashoutL3        float64 `json:"cashout_l3"`
	CashoutL4        float64 `json:"cashout_l4"`
}

func defaultGUIPrefs() GUIPrefs {
	return GUIPrefs{
		PlayerCount:      1000,
		BetPerPosition:   1.0,
		ReplayCycles:     30,
		ExtraRatePercent: 40,
		ForceAllExtra:    false,
		BettingStrategy:  BettingStrategyAll9,
		Seed:             42,
		CashoutL1:        0.25,
		CashoutL2:        0.15,
		CashoutL3:        0.055,
		CashoutL4:        0.04,
	}
}

func prefsPath() string {
	return filepath.Join(ExecutableDir(), "rtpsim_gui_prefs.json")
}

func LoadGUIPrefs() GUIPrefs {
	p := defaultGUIPrefs()
	data, err := os.ReadFile(prefsPath())
	if err != nil {
		return p
	}
	if err := json.Unmarshal(data, &p); err != nil {
		return defaultGUIPrefs()
	}
	if p.PlayerCount <= 0 {
		p.PlayerCount = 1000
	}
	if p.BetPerPosition <= 0 {
		p.BetPerPosition = 1.0
	}
	if p.ReplayCycles <= 0 {
		p.ReplayCycles = 30
	}
	if p.BettingStrategy == "" {
		p.BettingStrategy = BettingStrategyAll9
	}
	return p
}

func SaveGUIPrefs(p GUIPrefs) error {
	data, err := json.MarshalIndent(p, "", "  ")
	if err != nil {
		return err
	}
	return os.WriteFile(prefsPath(), data, 0o644)
}

func (p GUIPrefs) toRunRequest(bundle *AppBundle) GUIRunRequest {
	return GUIRunRequest{
		Bundle:               bundle,
		PlayerCount:          p.PlayerCount,
		BetPerPosition:       p.BetPerPosition,
		ReplayCycles:         p.ReplayCycles,
		ExtraRatePercent:     p.ExtraRatePercent,
		ForceAllExtra:        p.ForceAllExtra,
		BettingStrategy:      p.BettingStrategy,
		Seed:                 p.Seed,
		BonusCashoutPerLevel: []float64{p.CashoutL1, p.CashoutL2, p.CashoutL3, p.CashoutL4},
	}
}
