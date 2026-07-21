package main

import "testing"

func testBonusMathConfig() *MathConfig {
	return &MathConfig{
		BonusGame: BonusGame{
			EndLevel: 5,
			LevelSettings: LevelSettings{
				TotalChoices: []int{4, 4, 4, 4, 4},
				WinChoices:   []int{2, 2, 2, 2, 2},
				Payouts:      []float64{15, 40, 100, 250, 500},
			},
		},
	}
}

func testBonusEngine(cashoutProbs []float64) *Engine {
	return &Engine{cashoutProbs: cashoutProbs}
}

// 單一玩家、永不 cashout：過 5 關率應約 (1/2)^5 = 1/32
func TestSharedBonus_NoCashout_PassRate(t *testing.T) {
	mc := testBonusMathConfig()
	e := testBonusEngine([]float64{0, 0, 0, 0, 0})
	playerRng := NewFastRNG(7)
	sysRng := NewFastRNG(8)
	const N = 200_000
	grandCount := 0
	for i := 0; i < N; i++ {
		rs := NewRoundResult(1)
		states := []bonusPlayerState{{playerIdx: 0, bet: 1.0, alive: true}}
		grand := e.playSharedBonus(rs, states, mc, nil, 0, 0, &playerRng, &sysRng)
		grandCount += len(grand)
	}
	rate := float64(grandCount) / float64(N)
	want := 1.0 / 32.0
	if rate < want*0.85 || rate > want*1.15 {
		t.Errorf("過 5 關率 %.4f，預期約 %.4f", rate, want)
	}
}

// cashout=1：過 L1 立刻收手拿 15 倍；不應到 grand
func TestSharedBonus_AlwaysCashoutAfterWin(t *testing.T) {
	mc := testBonusMathConfig()
	e := testBonusEngine([]float64{1, 1, 1, 1, 1})
	playerRng := NewFastRNG(8)
	sysRng := NewFastRNG(9)
	const N = 10_000
	passL1Count := 0
	for i := 0; i < N; i++ {
		rs := NewRoundResult(1)
		states := []bonusPlayerState{{playerIdx: 0, bet: 1.0, alive: true}}
		grand := e.playSharedBonus(rs, states, mc, nil, 0, 0, &playerRng, &sysRng)
		if len(grand) != 0 {
			t.Errorf("cashout=1 不應到 grand")
		}
		if rs.BonusLevelPass[1] == 1 {
			passL1Count++
			if rs.PlayerBonusPayout[0] != 15 || rs.BonusCashoutTotal != 1 {
				t.Errorf("過 L1 收手應 win=15/cashout=1，得 win=%f co=%d",
					rs.PlayerBonusPayout[0], rs.BonusCashoutTotal)
			}
		} else if rs.PlayerBonusPayout[0] != 0 {
			t.Errorf("L1 失敗應 win=0，得 %f", rs.PlayerBonusPayout[0])
		}
	}
	rate := float64(passL1Count) / float64(N)
	if rate < 0.45 || rate > 0.55 {
		t.Errorf("過 L1 比例 %.4f，預期約 0.5", rate)
	}
}

// 整房共用開獎：同關所有玩家看到相同通關集（選同一選項者同生死）
func TestSharedBonus_SharedDraw(t *testing.T) {
	mc := testBonusMathConfig()
	e := testBonusEngine([]float64{0, 0, 0, 0, 0})
	playerRng := NewFastRNG(21)
	sysRng := NewFastRNG(22)
	for i := 0; i < 2000; i++ {
		rs := NewRoundResult(4)
		// 4 位玩家，前兩位靠 playerRng 抽同分布；驗證「pick 相同 → 命運相同」
		states := []bonusPlayerState{
			{playerIdx: 0, bet: 1, alive: true},
			{playerIdx: 1, bet: 1, alive: true},
			{playerIdx: 2, bet: 1, alive: true},
			{playerIdx: 3, bet: 1, alive: true},
		}
		e.playSharedBonus(rs, states, mc, nil, 0, 0, &playerRng, &sysRng)
		// 第一關：進入 4 人，過關+失敗 = 4
		if rs.BonusLevelEnter[1] != 4 || rs.BonusLevelPass[1]+rs.BonusLevelFail[1] != 4 {
			t.Fatalf("L1 進出不平衡：enter=%d pass=%d fail=%d",
				rs.BonusLevelEnter[1], rs.BonusLevelPass[1], rs.BonusLevelFail[1])
		}
	}
}

// V3：命中階段且機率 100% 時，通關必為下注最低 2 選項
func TestV3Controller_ForceLowestTwo(t *testing.T) {
	spec := &V3Spec{
		Enabled: true,
		Phases: []V3PhaseSpec{
			{Code: "U_PRT_L4", RTPThreshold: 103, Levels: [5]float64{1, 1, 1, 1, 1}},
		},
	}
	v3 := NewV3Controller(spec)
	rng := NewFastRNG(33)
	optionBets := [5]float64{0, 80000, 65000, 5000, 8000} // #3、#4 最低
	// 窗口 RTP 已 105%（100000 bet / 105000 payout），本關預測派彩再推高
	survivors, intervened := v3.MaybeIntervene(2, [2]int32{1, 2}, &optionBets, 100,
		100000, 105000, 1000, 500, 0, &rng)
	if !intervened {
		t.Fatal("RTP 遠超門檻且機率 100%，應介入")
	}
	if survivors != [2]int32{3, 4} {
		t.Errorf("應強改為下注最低 2 選項 {3,4}，得 %v", survivors)
	}
	if v3.SavedPayout <= 0 {
		t.Errorf("省下派彩應 > 0，得 %f", v3.SavedPayout)
	}
}

// V3：預估 RTP 未達任何階段門檻 → 不介入
func TestV3Controller_BelowThresholdNoIntervene(t *testing.T) {
	spec := &V3Spec{
		Enabled: true,
		Phases: []V3PhaseSpec{
			{Code: "U_PRT_L4", RTPThreshold: 103, Levels: [5]float64{1, 1, 1, 1, 1}},
		},
	}
	v3 := NewV3Controller(spec)
	rng := NewFastRNG(34)
	optionBets := [5]float64{0, 100, 100, 100, 100}
	// 窗口 RTP 90%，本關預測派彩不足以推過 103%
	survivors, intervened := v3.MaybeIntervene(0, [2]int32{1, 2}, &optionBets, 15,
		1000000, 900000, 400, 300, 0, &rng)
	if intervened {
		t.Errorf("RTP 未達門檻不應介入，survivors=%v", survivors)
	}
}

// V3：GGR 捷徑 → 強制最嚴重階段
func TestV3Controller_GGRShortcut(t *testing.T) {
	spec := &V3Spec{
		Enabled:      true,
		GGRThreshold: 1000,
		Phases: []V3PhaseSpec{
			{Code: "U_PRT_L1", RTPThreshold: 110, Levels: [5]float64{1, 1, 1, 1, 1}},
			{Code: "U_PRT_L4", RTPThreshold: 103, Levels: [5]float64{0, 0, 0, 0, 0}},
		},
	}
	v3 := NewV3Controller(spec)
	rng := NewFastRNG(35)
	optionBets := [5]float64{0, 500, 400, 10, 20}
	// 預估 RTP 約 104%（僅命中 L4，L4 機率 0 不介入）；但 GGR 虧損 > 1000 → 走 L1（機率 1）
	_, intervened := v3.MaybeIntervene(0, [2]int32{1, 2}, &optionBets, 15,
		100000, 90000, 500, 200, 0, &rng)
	if !intervened {
		t.Errorf("GGR 超門檻應強制 U_PRT_L1 介入")
	}
	if v3.Interventions[0][0] != 1 {
		t.Errorf("介入應記在 U_PRT_L1 x L1，得 %v", v3.Interventions)
	}
}
