package main

import "fmt"

func ValidateGUIPrefs(p GUIPrefs) error {
	if p.PlayerCount <= 0 {
		return fmt.Errorf("下注人數須為正整數")
	}
	if p.BetPerPosition <= 0 {
		return fmt.Errorf("單格下注額須為正數")
	}
	if p.ReplayCycles <= 0 {
		return fmt.Errorf("循環次數須為正整數")
	}
	if p.ExtraRatePercent < 0 || p.ExtraRatePercent > 100 {
		return fmt.Errorf("EXTRA 比例須在 0–100")
	}
	for i, v := range []float64{p.CashoutL1, p.CashoutL2, p.CashoutL3, p.CashoutL4} {
		if v < 0 || v > 1 {
			return fmt.Errorf("Cashout L%d 須在 0–1", i+1)
		}
	}
	switch p.BettingStrategy {
	case BettingStrategyAll9, BettingStrategyRandom, BettingStrategyOptimal:
	default:
		return fmt.Errorf("未知的下注策略")
	}
	return nil
}
