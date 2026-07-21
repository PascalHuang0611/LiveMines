package main

import (
	"strings"
	"testing"
)

func TestDescribePlayerBettingStrategy_Random(t *testing.T) {
	cfg := &Config{}
	cfg.Players.BettingStrategy = BettingStrategyRandom
	cfg.Players.PaidLightningPurchaseRate = 0.4
	cfg.Players.BonusCashoutPerLevel = []float64{0.5, 0.3, 0.11, 0.08}
	cfg.Players.BonusRandomPick = true
	s := DescribePlayerBettingStrategy(cfg)
	for _, want := range []string{"random", "隨機3格", "40%"} {
		if !strings.Contains(s, want) {
			t.Fatalf("missing %q in %q", want, s)
		}
	}
}

func TestDescribePlayerBettingStrategy_Optimal(t *testing.T) {
	cfg := &Config{}
	cfg.Players.BettingStrategy = BettingStrategyOptimal
	s := DescribePlayerBettingStrategy(cfg)
	for _, want := range []string{"optimal", "最高3格", "必買"} {
		if !strings.Contains(s, want) {
			t.Fatalf("missing %q in %q", want, s)
		}
	}
}
