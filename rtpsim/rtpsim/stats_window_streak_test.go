package main

import "testing"

func TestObserveWindowExtremeEarly_StreakOver200(t *testing.T) {
	var s Stats
	s.MinWindowRTP = 1e9
	for round := int64(1); round <= 201; round++ {
		s.ObserveWindowRTPAfterPush(round, 111, true)
	}
	if s.windowRTPAbove110Streak != 201 {
		t.Fatalf("streak=%d want 201", s.windowRTPAbove110Streak)
	}
	if s.windowRTPAbove110Over200 != 1 {
		t.Fatalf("over200=%d want 1", s.windowRTPAbove110Over200)
	}
	if s.windowRTPExtremeFirst2400 != 201 {
		t.Fatalf("extremeFirst=%d want 201", s.windowRTPExtremeFirst2400)
	}
}
