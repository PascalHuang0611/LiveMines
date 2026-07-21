package main

import "testing"

func TestPickOptimalBetPositions(t *testing.T) {
	w := []int{4649, 4462, 4440, 4480, 4602, 4661, 4384, 4353, 4310}
	var p Player
	pickOptimalBetPositions(&p, w)
	want := map[int32]bool{1: true, 5: true, 6: true}
	for _, pos := range p.BetPos[:p.NumBetPos] {
		if !want[pos] {
			t.Fatalf("期望位置 1,5,6，得 %v", p.BetPos[:p.NumBetPos])
		}
	}
}

// V2 階梯+遲滯：對照伺服器 selector 規則（門檻取現行 gms.xml 預設值）
func TestSelectorLadderHysteresis(t *testing.T) {
	zones := []ZoneSpec{
		{Code: 0, RTPMin: "94.01", RTPMax: "97.99", MathConfig: "BASE"},
		{Code: 101, RTPMin: "101.50", RTPMax: "inf", TriggerRTP: 101.5, ExitRTP: 100.5, MathConfig: "PRT1"},
		{Code: 102, RTPMin: "99.50", RTPMax: "101.49", TriggerRTP: 99.5, ExitRTP: 98.8, MathConfig: "PRT2"},
		{Code: 103, RTPMin: "98.00", RTPMax: "99.49", TriggerRTP: 98.0, ExitRTP: 97.0, MathConfig: "PRT3"},
		{Code: 201, RTPMin: "-inf", RTPMax: "88.00", TriggerRTP: 88.0, ExitRTP: 90.0, MathConfig: "BST1"},
		{Code: 202, RTPMin: "88.01", RTPMax: "92.00", TriggerRTP: 92.0, ExitRTP: 93.0, MathConfig: "BST2"},
		{Code: 203, RTPMin: "92.01", RTPMax: "94.00", TriggerRTP: 94.0, ExitRTP: 95.0, MathConfig: "BST3"},
	}
	sel, err := NewSelector(zones)
	if err != nil {
		t.Fatalf("NewSelector: %v", err)
	}

	cases := []struct {
		cur  int
		rtp  float64
		want int
		desc string
	}{
		{0, 96.0, 0, "BASE 正常區間停留"},
		{0, 98.5, 103, "BASE→PRT3 進場"},
		{0, 93.5, 203, "BASE→BST3 進場"},
		{103, 97.5, 103, "PRT3 遲滯帶內停留（未低於 exit 97.0）"},
		{103, 96.5, 0, "PRT3→BASE 退場"},
		{103, 99.8, 102, "PRT3→PRT2 升級"},
		{102, 101.6, 101, "PRT2→PRT1 升級"},
		{101, 100.4, 102, "PRT1→PRT2 降級"},
		{101, 102.0, 101, "PRT1 停留"},
		{203, 94.5, 203, "BST3 遲滯帶內停留（未高於 exit 95.0）"},
		{203, 95.5, 0, "BST3→BASE 退場"},
		{203, 91.5, 202, "BST3→BST2 加深"},
		{202, 87.5, 201, "BST2→BST1 加深"},
		{201, 90.5, 202, "BST1→BST2 回退"},
		{0, 102.5, 103, "BASE 一次只能跳一級（不能直達 PRT1）"},
	}
	for _, c := range cases {
		if got := sel.NextZoneByLadder(c.cur, c.rtp); got != c.want {
			t.Errorf("%s：cur=%d rtp=%.1f → %d, want %d", c.desc, c.cur, c.rtp, got, c.want)
		}
	}

	// DirectZoneByTrigger：嚴重度優先
	direct := []struct {
		rtp  float64
		want int
	}{
		{102.0, 101}, {100.0, 102}, {98.5, 103}, {96.0, 0}, {93.0, 203}, {91.0, 202}, {87.0, 201},
	}
	for _, c := range direct {
		if got := sel.DirectZoneByTrigger(c.rtp); got != c.want {
			t.Errorf("DirectZoneByTrigger(%.1f) = %d, want %d", c.rtp, got, c.want)
		}
	}
}
