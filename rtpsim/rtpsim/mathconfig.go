package main

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"

	"git.trevi.cc/server/tg001_product/entity/riskscore"
)

/**
 * @brief 本地簡化版 math config struct（對齊 gms/internal/livemines/mathconfig 結構）
 *
 *   整組倍數分佈（bd93621）：一次抽出整組倍數 combo，
 *   combo 長度 = 該次閃電數量，抽出後洗牌再與加權位置 1:1 綁定。
 */
type MultiplierSetDistribution struct {
	Values  [][]float64 `json:"values"`
	Weights []int       `json:"weights"`
}

type LightningFeature struct {
	PayoutMultipliers MultiplierSetDistribution  `json:"payoutMultipliers"`
	GridWeights       riskscore.GridWeightLevels `json:"gridWeights"`
}

type MainGame struct {
	NumberOfGrids            int       `json:"numberOfGrids"`
	NumberOfBalls            int       `json:"numberOfBalls"`
	ExtraPurchaseCostPercent float64   `json:"extraPurchaseCostPercent"`
	SingleAreaBasePayouts    []float64 `json:"singleAreaBasePayouts"`
}

type LevelSettings struct {
	TotalChoices []int     `json:"totalChoices"`
	WinChoices   []int     `json:"winChoices"`
	Payouts      []float64 `json:"payouts"`
}

type BonusGame struct {
	TriggerCondition   string        `json:"triggerCondition"`
	EndLevel           int           `json:"endLevel"`
	JPContributionRate float64       `json:"jp_contribution_rate"`
	LevelSettings      LevelSettings `json:"levelSettings"`
}

type MathConfig struct {
	SimulationRuns            int64            `json:"simulationRuns"`
	MainGame                  MainGame         `json:"mainGame"`
	LightningFeature          LightningFeature `json:"lightningFeature"`
	PurchasedLightningFeature LightningFeature `json:"purchasedLightningFeature"`
	BonusGame                 BonusGame        `json:"bonusGame"`
	RiskScore                 riskscore.Params `json:"riskScore"`
}

/**
 * @brief 組合長度期望值 E[閃電數]（對齊生產端 ExpectedComboLength）
 */
func ExpectedComboLength(d *MultiplierSetDistribution) float64 {
	if d == nil || len(d.Values) == 0 || len(d.Values) != len(d.Weights) {
		return 0
	}
	totalWeight := 0
	sum := 0.0
	for i, w := range d.Weights {
		totalWeight += w
		sum += float64(len(d.Values[i])) * float64(w)
	}
	if totalWeight == 0 {
		return 0
	}
	return sum / float64(totalWeight)
}

// LoadMathConfigs 依 config 載入所有指定 math config JSON
func LoadMathConfigs(cfg *Config) (map[string]*MathConfig, error) {
	out := make(map[string]*MathConfig, len(cfg.MathConfigs.Files))
	for key, fname := range cfg.MathConfigs.Files {
		path := filepath.Join(cfg.MathConfigs.BaseDir, fname)
		mc, err := loadOne(path)
		if err != nil {
			return nil, fmt.Errorf("載入 %s 失敗: %w", key, err)
		}
		if err := validateMathConfig(mc); err != nil {
			return nil, fmt.Errorf("驗證 %s 失敗: %w", key, err)
		}
		out[key] = mc
	}
	return out, nil
}

func loadOne(path string) (*MathConfig, error) {
	data, err := os.ReadFile(path)
	if err != nil {
		return nil, err
	}
	var mc MathConfig
	if err := json.Unmarshal(data, &mc); err != nil {
		return nil, err
	}
	return &mc, nil
}

func validateMathConfig(c *MathConfig) error {
	if c.MainGame.NumberOfGrids <= 0 {
		return fmt.Errorf("numberOfGrids 必須 > 0")
	}
	if c.MainGame.NumberOfBalls <= 0 {
		return fmt.Errorf("numberOfBalls 必須 > 0")
	}
	if len(c.MainGame.SingleAreaBasePayouts) != c.MainGame.NumberOfBalls {
		return fmt.Errorf("singleAreaBasePayouts 長度 %d 與 numberOfBalls=%d 不符",
			len(c.MainGame.SingleAreaBasePayouts), c.MainGame.NumberOfBalls)
	}
	if err := validateMultiplierSetDistribution(&c.LightningFeature.PayoutMultipliers, "lightning.payoutMultipliers"); err != nil {
		return err
	}
	if err := validateMultiplierSetDistribution(&c.PurchasedLightningFeature.PayoutMultipliers, "paid.payoutMultipliers"); err != nil {
		return err
	}
	if err := c.LightningFeature.GridWeights.Validate("lightning.gridWeights"); err != nil {
		return err
	}
	if err := c.PurchasedLightningFeature.GridWeights.Validate("paid.gridWeights"); err != nil {
		return err
	}
	if err := c.RiskScore.Validate("riskScore"); err != nil {
		return err
	}
	if c.BonusGame.EndLevel <= 0 {
		return fmt.Errorf("bonusGame.endLevel 必須 > 0")
	}
	if len(c.BonusGame.LevelSettings.Payouts) != c.BonusGame.EndLevel {
		return fmt.Errorf("bonusGame.payouts 長度 %d 與 endLevel=%d 不符",
			len(c.BonusGame.LevelSettings.Payouts), c.BonusGame.EndLevel)
	}
	return nil
}

func validateMultiplierSetDistribution(d *MultiplierSetDistribution, name string) error {
	if len(d.Values) == 0 || len(d.Weights) == 0 {
		return fmt.Errorf("%s 空", name)
	}
	if len(d.Values) != len(d.Weights) {
		return fmt.Errorf("%s 長度不符", name)
	}
	sum := 0
	for i, w := range d.Weights {
		if w < 0 {
			return fmt.Errorf("%s 權重 < 0", name)
		}
		sum += w
		if len(d.Values[i]) == 0 {
			return fmt.Errorf("%s.values[%d] 組合為空", name, i)
		}
		for j, m := range d.Values[i] {
			if m <= 0 {
				return fmt.Errorf("%s.values[%d][%d] 倍數必須 > 0，得到 %f", name, i, j, m)
			}
		}
	}
	if sum == 0 {
		return fmt.Errorf("%s 權重總和為 0", name)
	}
	return nil
}
