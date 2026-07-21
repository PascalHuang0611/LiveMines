package main

import (
	"encoding/json"
	"fmt"
	"math"
	"os"
	"strconv"
	"strings"
)

/**
 * @brief rtpsim 模擬器設定（從 JSON 載入）
 */
type Config struct {
	Simulation struct {
		Rounds               int64   `json:"rounds"`                 // 模擬局數
		Workers              int     `json:"workers"`                // 並行 worker 數；0=runtime.NumCPU()
		RNGSeed              int64   `json:"rng_seed"`               // 0=time-based
		RTPWindowRounds      int     `json:"rtp_window_rounds"`      // sliding window 局數
		InitialRTP           float64 `json:"initial_rtp"`            // 冷啟動 RTP
		RoundIntervalSeconds int     `json:"round_interval_seconds"` // 虛擬時鐘：每局間隔秒數（V4 時間窗用）
	} `json:"simulation"`

	Players struct {
		Count                     int       `json:"count"`
		BetPerPosition            float64   `json:"bet_per_position"`
		BettingStrategy           string    `json:"betting_strategy"` // optimal | random
		PaidLightningPurchaseRate float64   `json:"paid_lightning_purchase_rate"`
		ForceAllPaidLightning     bool      `json:"force_all_paid_lightning"` // true=全員必買 EXTRA（仍消耗 RNG 保持 seed 對齊）
		BonusCashoutProbability   float64   `json:"bonus_cashout_probability"`
		BonusCashoutPerLevel      []float64 `json:"bonus_cashout_per_level"` // 各關收手率 [L1..L4]；nil=用 bonus_cashout_probability
		BonusRandomPick           bool      `json:"bonus_random_pick"`       // random 策略用；optimal 時改為避 hot
	} `json:"players"`

	MathConfigs struct {
		BaseDir string            `json:"base_dir"`
		Files   map[string]string `json:"files"` // key 例如 BASE/PRT1/...，value = 檔名
	} `json:"math_configs"`

	RTPControl struct {
		Mode           int        `json:"mode"`
		Zones          []ZoneSpec `json:"zones"`
		JPProtectionV3 V3Spec     `json:"jp_protection_v3"`
		RiskScoreV4    bool       `json:"risk_score_v4"` // 啟用 V4 風險分數位置權重（仍受 math config riskScore.enabled 約束）
	} `json:"rtp_control"`

	EgameData struct {
		InitialMainPool   float64 `json:"initial_main_pool"`
		InitialSubPool    float64 `json:"initial_sub_pool"`
		PoolPerCard       float64 `json:"pool_per_card"`
		FixPoolPerCard    float64 `json:"fix_pool_per_card"`
		EgamePoolAdvance  float64 `json:"egame_pool_advance"`
		InjectJPVal       float64 `json:"inject_jp_val"`
		InjectMax         float64 `json:"inject_max"`
		JackpotAutoInject bool    `json:"jackpot_auto_inject"`
		ForbidJackpot     bool    `json:"forbid_jackpot"`
	} `json:"egame_data"`

	BallDrop struct {
		GridWeights    []int `json:"grid_weights"`
		OutcomeWeights []int `json:"outcome_weights"` // [全不同, 二同, 三同]；nil=獨立模型
	} `json:"ball_drop"`

	Output struct {
		Dir                string `json:"dir"`
		SummaryJSON        string `json:"summary_json"`
		PerZoneCSV         string `json:"per_zone_csv"`
		PerPlayerCSV       string `json:"per_player_csv"`
		PerPlayerQuantiles bool   `json:"per_player_quantiles"`
	} `json:"output"`
}

/**
 * @brief 單一 RTP zone（rtp_min/rtp_max 用 string 接以支援 "inf" / "-inf"）
 *        trigger_rtp / exit_rtp 為 V2 階梯遲滯門檻（對齊 gms.xml <zone>）；
 *        lightning_trigger_probability / jp_trigger_probability 為已移除的 V1 欄位，讀到時忽略。
 */
type ZoneSpec struct {
	Code       int     `json:"code"`
	RTPMin     string  `json:"rtp_min"`
	RTPMax     string  `json:"rtp_max"`
	TriggerRTP float64 `json:"trigger_rtp"`
	ExitRTP    float64 `json:"exit_rtp"`
	MathConfig string  `json:"mathconfig"` // key in math_configs.files

	// deprecated：V1 已移除，僅為舊 config 相容而保留欄位（不使用）
	LightningTriggerProbability float64 `json:"lightning_trigger_probability"`
	JPTriggerProbability        float64 `json:"jp_trigger_probability"`
}

/**
 * @brief V3 JP 開獎強控配置（對齊 gms.xml <jp_protection_v3>）
 */
type V3Spec struct {
	Enabled      bool          `json:"enabled"`
	GGRThreshold float64       `json:"ggr_threshold"` // 預估 GGR 虧損超過此值 → 強制最嚴重階段；0=不啟用 GGR 捷徑
	Phases       []V3PhaseSpec `json:"phases"`
}

type V3PhaseSpec struct {
	Code         string     `json:"code"`          // U_PRT_L1..L4
	RTPThreshold float64    `json:"rtp_threshold"` // 預估派彩後 RTP ≥ 此值 → 命中
	Levels       [5]float64 `json:"levels"`        // BG Level 1~5 介入機率
}

// LoadConfig 讀檔 + 解析 + 套用預設值
func LoadConfig(path string) (*Config, error) {
	data, err := os.ReadFile(path)
	if err != nil {
		return nil, fmt.Errorf("讀取 %s 失敗: %w", path, err)
	}
	var cfg Config
	if err := json.Unmarshal(data, &cfg); err != nil {
		return nil, fmt.Errorf("解析 %s 失敗: %w", path, err)
	}
	applyDefaults(&cfg)
	if err := validateConfig(&cfg); err != nil {
		return nil, err
	}
	return &cfg, nil
}

// LoadConfigFromBytes 解析 JSON 設定（GUI / 內嵌預設）
func LoadConfigFromBytes(data []byte) (*Config, error) {
	var cfg Config
	if err := json.Unmarshal(data, &cfg); err != nil {
		return nil, fmt.Errorf("解析設定 JSON 失敗: %w", err)
	}
	applyDefaults(&cfg)
	if err := validateConfig(&cfg); err != nil {
		return nil, err
	}
	return &cfg, nil
}

func applyDefaults(c *Config) {
	if c.Simulation.Rounds <= 0 {
		c.Simulation.Rounds = 100_000_000
	}
	if c.Simulation.RTPWindowRounds <= 0 {
		c.Simulation.RTPWindowRounds = 48_000
	}
	if c.Simulation.InitialRTP == 0 {
		c.Simulation.InitialRTP = 95.0
	}
	if c.Simulation.RoundIntervalSeconds <= 0 {
		c.Simulation.RoundIntervalSeconds = 30
	}
	if c.Players.Count <= 0 {
		c.Players.Count = 1000
	}
	if c.Players.BetPerPosition <= 0 {
		c.Players.BetPerPosition = 1.0
	}
	if c.Players.BonusCashoutProbability == 0 {
		c.Players.BonusCashoutProbability = 0.5
	}
	if len(c.BallDrop.GridWeights) == 0 {
		c.BallDrop.GridWeights = []int{1, 1, 1, 1, 1, 1, 1, 1, 1}
	}
	if c.Output.Dir == "" {
		c.Output.Dir = "./rtpsim_out"
	}
	if c.Output.SummaryJSON == "" {
		c.Output.SummaryJSON = "summary.json"
	}
	if c.Output.PerZoneCSV == "" {
		c.Output.PerZoneCSV = "per_zone.csv"
	}
	if c.Output.PerPlayerCSV == "" {
		c.Output.PerPlayerCSV = "per_player.csv"
	}
}

func validateConfig(c *Config) error {
	if c.Players.PaidLightningPurchaseRate < 0 || c.Players.PaidLightningPurchaseRate > 1 {
		return fmt.Errorf("paid_lightning_purchase_rate 必須在 [0,1]")
	}
	if c.Players.BonusCashoutProbability < 0 || c.Players.BonusCashoutProbability > 1 {
		return fmt.Errorf("bonus_cashout_probability 必須在 [0,1]")
	}
	switch c.Players.BettingStrategy {
	case "", BettingStrategyRandom, BettingStrategyOptimal, BettingStrategyAll9:
	default:
		return fmt.Errorf("betting_strategy 必須為 %q、%q 或 %q", BettingStrategyOptimal, BettingStrategyRandom, BettingStrategyAll9)
	}
	if len(c.BallDrop.GridWeights) != 9 {
		return fmt.Errorf("ball_drop.grid_weights 必須有 9 個元素")
	}
	if ow := c.BallDrop.OutcomeWeights; len(ow) > 0 {
		if len(ow) != 3 {
			return fmt.Errorf("ball_drop.outcome_weights 必須有 3 個元素 [全不同, 二同, 三同]")
		}
		owSum := 0
		for _, w := range ow {
			if w < 0 {
				return fmt.Errorf("ball_drop.outcome_weights 不可為負")
			}
			owSum += w
		}
		if owSum == 0 {
			return fmt.Errorf("ball_drop.outcome_weights 總和不可為 0")
		}
	}
	for i, v := range c.Players.BonusCashoutPerLevel {
		if v < 0 || v > 1 {
			return fmt.Errorf("bonus_cashout_per_level[%d] 必須在 [0,1]", i)
		}
	}
	if len(c.RTPControl.Zones) == 0 {
		return fmt.Errorf("rtp_control.zones 不能為空")
	}
	seenCodes := map[int]bool{}
	for i, z := range c.RTPControl.Zones {
		if seenCodes[z.Code] {
			return fmt.Errorf("zone[%d] code=%d 重複", i, z.Code)
		}
		seenCodes[z.Code] = true
		if z.MathConfig == "" {
			return fmt.Errorf("zone[%d] mathconfig 為空", i)
		}
		if _, ok := c.MathConfigs.Files[z.MathConfig]; !ok {
			return fmt.Errorf("zone[%d] mathconfig=%s 未在 math_configs.files 中定義", i, z.MathConfig)
		}
		if z.Code != 0 && (z.LightningTriggerProbability != 0 || z.JPTriggerProbability != 0) {
			fmt.Printf("提示：zone[%d] 的 lightning/jp_trigger_probability 屬已移除的 V1 風控，將被忽略\n", i)
		}
	}
	for i, p := range c.RTPControl.JPProtectionV3.Phases {
		if p.RTPThreshold <= 0 {
			return fmt.Errorf("jp_protection_v3.phases[%d].rtp_threshold 必須 > 0", i)
		}
		for j, lv := range p.Levels {
			if lv < 0 || lv > 1 {
				return fmt.Errorf("jp_protection_v3.phases[%d].levels[%d] 必須在 [0,1]", i, j)
			}
		}
	}
	if c.EgameData.PoolPerCard < 0 || c.EgameData.PoolPerCard > 1 {
		return fmt.Errorf("egame_data.pool_per_card 必須在 [0,1]")
	}
	if c.EgameData.FixPoolPerCard < 0 || c.EgameData.FixPoolPerCard > 1 {
		return fmt.Errorf("egame_data.fix_pool_per_card 必須在 [0,1]")
	}
	return nil
}

// parseBound 解析 rtp_min/max，支援 "inf"/"-inf"
func parseBound(s string) (float64, error) {
	t := strings.TrimSpace(strings.ToLower(s))
	switch t {
	case "inf", "+inf", "infinity", "+infinity":
		return math.MaxFloat64, nil
	case "-inf", "-infinity":
		return -math.MaxFloat64, nil
	}
	v, err := strconv.ParseFloat(t, 64)
	if err != nil {
		return 0, fmt.Errorf("無法解析邊界 %q: %w", s, err)
	}
	return v, nil
}
