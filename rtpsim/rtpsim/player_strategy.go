package main

import (
	"fmt"
	"strings"
)

/**
 * @brief 玩家下注策略（rtpsim） *
 * optimal（玩家 EV 最大化，與 Math 表「最佳策略」對齊）：
 *   - 主遊戲：依 ball_drop.grid_weights 押權重最高的 3 格（提高三同命中與主遊戲派彩）
 *   - 付費閃電：每局必買（模擬歷史 buyer 子集 RTP 高於 non-buyer）
 *   - 二級：永不提前 cashout（4 選 2 每關 50% 時，繼續闖關 EV > 當關領獎）
 *   - 二級選位：風控保護且觸發時避開 hot 選項（其餘隨機）
 */

const (
	BettingStrategyOptimal = "optimal"
	BettingStrategyRandom  = "random"
	BettingStrategyAll9    = "all9" // 九格全下：每玩家每局押所有 9 格
)

func (c *Config) useOptimalBetting() bool {
	return c.Players.BettingStrategy == BettingStrategyOptimal
}

func (c *Config) useAll9Betting() bool {
	return c.Players.BettingStrategy == BettingStrategyAll9
}

func (c *Config) useForceAllPaidLightning() bool {
	return c.Players.ForceAllPaidLightning
}

// pickOptimalBetPositions 選 grid_weights 最高的 3 個位置（1..9）
func pickOptimalBetPositions(p *Player, gridWeights []int) {
	p.NumBetPos = 3
	if len(gridWeights) < 9 {
		p.BetPos[0], p.BetPos[1], p.BetPos[2] = 1, 2, 3
		return
	}
	best := []int32{1, 2, 3}
	bestW := []int{gridWeights[0], gridWeights[1], gridWeights[2]}
	for pos := 4; pos <= 9; pos++ {
		w := gridWeights[pos-1]
		minIdx := 0
		if bestW[1] < bestW[minIdx] {
			minIdx = 1
		}
		if bestW[2] < bestW[minIdx] {
			minIdx = 2
		}
		if w <= bestW[minIdx] {
			continue
		}
		best[minIdx] = int32(pos)
		bestW[minIdx] = w
	}
	p.BetPos[0], p.BetPos[1], p.BetPos[2] = best[0], best[1], best[2]
}

// pickAll9 押全部 9 格（all9 策略）
func pickAll9(p *Player) {
	for i := int32(0); i < 9; i++ {
		p.BetPos[i] = i + 1
	}
	p.NumBetPos = 9
}

// optimalCashoutProbs 最佳策略：不在 L1–L4 過關後收手
func optimalCashoutProbs() []float64 {
	return []float64{0, 0, 0, 0}
}

// DescribePlayerBettingStrategy 產出壓測 LOG / 報表用的策略說明
func DescribePlayerBettingStrategy(cfg *Config) string {
	p := cfg.Players
	strategy := p.BettingStrategy
	if strategy == "" {
		strategy = BettingStrategyRandom
	}
	var b strings.Builder
	fmt.Fprintf(&b, "betting_strategy=%s", strategy)
	if cfg.useOptimalBetting() {
		b.WriteString(" | 主遊戲:grid_weights最高3格")
		b.WriteString(" | 付費閃電:每局必買(EXTRABET)")
		b.WriteString(" | 二級:永不cashout")
		return b.String()
	}
	if cfg.useAll9Betting() {
		b.WriteString(" | 主遊戲:九格全下(bet×9)")
		if cfg.useForceAllPaidLightning() {
			fmt.Fprintf(&b, " | 付費閃電(EXTRABET):100%%強制(原設定%.0f%%)", p.PaidLightningPurchaseRate*100)
		} else {
			fmt.Fprintf(&b, " | 付費閃電(EXTRABET):%.0f%%", p.PaidLightningPurchaseRate*100)
		}
		if len(p.BonusCashoutPerLevel) > 0 {
			fmt.Fprintf(&b, " | 二級cashout L1-L4=%v", p.BonusCashoutPerLevel)
		} else {
			fmt.Fprintf(&b, " | 二級cashout:%.0f%%", p.BonusCashoutProbability*100)
		}
		return b.String()
	}
	b.WriteString(" | 主遊戲:隨機3格")
	if cfg.useForceAllPaidLightning() {
		fmt.Fprintf(&b, " | 付費閃電(EXTRABET):100%%強制(原設定%.0f%%)", p.PaidLightningPurchaseRate*100)
	} else {
		fmt.Fprintf(&b, " | 付費閃電(EXTRABET):%.0f%%", p.PaidLightningPurchaseRate*100)
	}
	if len(p.BonusCashoutPerLevel) > 0 {
		fmt.Fprintf(&b, " | 二級cashout L1-L4=%v", p.BonusCashoutPerLevel)
	} else {
		fmt.Fprintf(&b, " | 二級cashout:%.0f%%", p.BonusCashoutProbability*100)
	}
	if p.BonusRandomPick {
		b.WriteString(" | 二級選位:隨機")
	} else {
		b.WriteString(" | 二級選位:保護模式避hot")
	}
	return b.String()
}
