package main

import "sort"

/**
 * @brief 二級玩法（整房共用開獎，對齊伺服器行為）
 *
 * 規則：
 *   - 共 5 關（endLevel=5），每關整房共用一次 4 選 2 開獎
 *   - 各合格玩家每關獨立選 1 個選項；選中通關選項 → 過關，否則死亡拿 0
 *   - 過第 1/2/3/4 關後可選擇 cashout，分別領 15/40/100/250 倍下注
 *   - 過第 5 關 → 自動領 500 倍下注 + JP 主池分潤
 *   - V3 JP 開獎強控：每關原生 4選2 後，依「預估派彩後 RTP」分階段骰介入，
 *     介入時通關強改為下注最低的 2 個選項（同額洗牌破平）
 */

// bonusPlayerState 單一玩家在共用二級中的狀態
type bonusPlayerState struct {
	playerIdx int     // players 索引
	bet       float64 // 二級下注基準
	alive     bool
	pick      int32 // 本關所選選項
}

/**
 * @brief V3 JP 開獎強控（對齊伺服器 applyV3JPProtection）
 */
type V3Controller struct {
	spec *V3Spec

	// 統計
	Checks        int64      // 進入檢查次數（關數）
	Interventions [][5]int64 // [phaseIdx][bgLevel-1] 介入次數
	SavedPayout   float64    // 預估省下派彩（原通關預測派彩 − 強改後預測派彩）
}

func NewV3Controller(spec *V3Spec) *V3Controller {
	if spec == nil || !spec.Enabled || len(spec.Phases) == 0 {
		return nil
	}
	// phases 依 RTPThreshold 由高到低排序（嚴重優先）
	sorted := *spec
	sorted.Phases = append([]V3PhaseSpec(nil), spec.Phases...)
	sort.SliceStable(sorted.Phases, func(i, j int) bool {
		return sorted.Phases[i].RTPThreshold > sorted.Phases[j].RTPThreshold
	})
	return &V3Controller{
		spec:          &sorted,
		Interventions: make([][5]int64, len(sorted.Phases)),
	}
}

/**
 * @brief 檢查並可能介入本關通關結果
 * @param level          內部關卡索引 0~4（BG Level = level+1）
 * @param survivors      原生 4選2 的 2 個通關選項
 * @param optionBets     各選項（1~4）累計下注
 * @param payoutMult     本關派彩倍數
 * @param windowBet/windowPayout 滑動窗口原始和（不含本局）
 * @param roundBet/roundMainPayout/bonusPaidSoFar 本局下注 / 主遊戲派彩 / 已派二級派彩
 * @return 最終通關選項與是否介入
 */
func (v *V3Controller) MaybeIntervene(level int, survivors [2]int32, optionBets *[5]float64,
	payoutMult float64, windowBet, windowPayout, roundBet, roundMainPayout, bonusPaidSoFar float64,
	rng *FastRNG) ([2]int32, bool) {

	if v == nil || payoutMult <= 0 {
		return survivors, false
	}
	v.Checks++

	predicted := (optionBets[survivors[0]] + optionBets[survivors[1]]) * payoutMult
	if predicted <= 0 {
		return survivors, false
	}
	totalBet := windowBet + roundBet
	if totalBet <= 0 {
		return survivors, false
	}
	totalPayout := windowPayout + roundMainPayout + bonusPaidSoFar + predicted
	newRTP := totalPayout / totalBet * 100

	// GGR 捷徑：預估虧損超門檻 → 強制最嚴重階段
	phaseIdx := -1
	if v.spec.GGRThreshold > 0 && totalPayout-totalBet > v.spec.GGRThreshold {
		phaseIdx = 0
	} else {
		for i, p := range v.spec.Phases {
			if newRTP >= p.RTPThreshold {
				phaseIdx = i
				break
			}
		}
	}
	if phaseIdx < 0 {
		return survivors, false
	}
	prob := v.spec.Phases[phaseIdx].Levels[level]
	if prob <= 0 || rng.Float64() >= prob {
		return survivors, false
	}

	// 強改為下注最低 2 選項（先洗牌破平，再穩定排序）
	opts := [4]int32{1, 2, 3, 4}
	for i := len(opts) - 1; i > 0; i-- {
		j := rng.Intn(i + 1)
		opts[i], opts[j] = opts[j], opts[i]
	}
	sort.SliceStable(opts[:], func(i, j int) bool {
		return optionBets[opts[i]] < optionBets[opts[j]]
	})
	forced := [2]int32{opts[0], opts[1]}
	if forced[0] > forced[1] {
		forced[0], forced[1] = forced[1], forced[0]
	}

	forcedPredicted := (optionBets[forced[0]] + optionBets[forced[1]]) * payoutMult
	v.Interventions[phaseIdx][level]++
	v.SavedPayout += predicted - forcedPredicted
	return forced, true
}

// PhaseCode 統計輸出用
func (v *V3Controller) PhaseCode(idx int) string {
	if v == nil || idx < 0 || idx >= len(v.spec.Phases) {
		return "?"
	}
	return v.spec.Phases[idx].Code
}

// PhaseCount 統計輸出用
func (v *V3Controller) PhaseCount() int {
	if v == nil {
		return 0
	}
	return len(v.spec.Phases)
}

/**
 * @brief 整房共用二級玩法（含 V3）
 * @param rs        本局結果（累計 Bonus 統計與各玩家派彩）
 * @param states    合格玩家狀態（呼叫前已填 playerIdx/bet/alive=true）
 * @param mc        本局 math config
 * @param v3        V3 控制器（nil = 不啟用）
 * @param windowBet/windowPayout 滑動窗口原始和（V3 用）
 * @return grand 名單索引（states 內索引）
 */
func (e *Engine) playSharedBonus(rs *RoundResult, states []bonusPlayerState, mc *MathConfig,
	v3 *V3Controller, windowBet, windowPayout float64,
	playerRng, sysRng *FastRNG) (grandStates []int) {

	endLevel := mc.BonusGame.EndLevel
	payouts := mc.BonusGame.LevelSettings.Payouts
	totalChoices := mc.BonusGame.LevelSettings.TotalChoices
	winChoices := mc.BonusGame.LevelSettings.WinChoices

	for level := 0; level < endLevel; level++ {
		nTotal := totalChoices[level]
		nWin := winChoices[level]
		if nTotal <= 0 || nWin <= 0 {
			break
		}
		aliveCount := 0
		var optionBets [5]float64
		for i := range states {
			if !states[i].alive {
				continue
			}
			aliveCount++
			states[i].pick = int32(playerRng.Intn(nTotal) + 1)
			optionBets[states[i].pick] += states[i].bet
			rs.BonusLevelEnter[level+1]++
		}
		if aliveCount == 0 {
			break
		}

		// 原生 4選2（洗牌取前 nWin）
		var opts [4]int32
		for i := 0; i < nTotal && i < 4; i++ {
			opts[i] = int32(i + 1)
		}
		for i := nTotal - 1; i > 0; i-- {
			j := sysRng.Intn(i + 1)
			opts[i], opts[j] = opts[j], opts[i]
		}
		survivors := [2]int32{opts[0], opts[1]}

		// V3 JP 開獎強控（本關派彩倍數 = payouts[level]）
		payoutMult := 0.0
		if level < len(payouts) {
			payoutMult = payouts[level]
		}
		var intervened bool
		survivors, intervened = v3.MaybeIntervene(level, survivors, &optionBets, payoutMult,
			windowBet, windowPayout, rs.TotalBet, rs.MainGamePayout, rs.BonusGamePayout, sysRng)
		if intervened {
			rs.V3InterventionCount++
		}

		// 各玩家判定 + cashout
		for i := range states {
			st := &states[i]
			if !st.alive {
				continue
			}
			hit := st.pick == survivors[0] || st.pick == survivors[1]
			if !hit {
				st.alive = false
				rs.BonusLevelFail[level+1]++
				continue
			}
			rs.BonusLevelPass[level+1]++
			passLevel := level + 1

			if passLevel == endLevel {
				// 過最終關 → grand
				win := st.bet * payouts[endLevel-1]
				rs.PlayerBonusPayout[st.playerIdx] += win
				rs.BonusGamePayout += win
				rs.BonusGrandTotal++
				st.alive = false
				grandStates = append(grandStates, i)
				continue
			}
			// 過關後骰 cashout
			coProb := 0.0
			if passLevel-1 < len(e.cashoutProbs) {
				coProb = e.cashoutProbs[passLevel-1]
			}
			if playerRng.Float64() < coProb {
				win := st.bet * payouts[passLevel-1]
				rs.PlayerBonusPayout[st.playerIdx] += win
				rs.BonusGamePayout += win
				rs.BonusCashoutTotal++
				st.alive = false
			}
		}
	}
	return grandStates
}
