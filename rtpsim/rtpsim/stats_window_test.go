package main

import "testing"

func TestObserveWindowRTPAfterPush_RangeOnlyFirst2400(t *testing.T) {
	var s Stats
	s.MinWindowRTP = 1e9

	s.ObserveWindowRTPAfterPush(1, 115, true)
	if s.windowRTPSamples != 1 || s.windowRTPExtremeFirst2400 != 1 {
		t.Fatalf("samples=%d extremeFirst=%d", s.windowRTPSamples, s.windowRTPExtremeFirst2400)
	}

	for round := int64(2); round <= 201; round++ {
		s.ObserveWindowRTPAfterPush(round, 105, true)
	}
	s.ObserveWindowRTPAfterPush(202, 75, true)
	if s.windowRTPBelow80Count != 1 || s.windowRTPExtremeFirst2400 != 2 {
		t.Fatalf("extremeFirst=%d below80=%d", s.windowRTPExtremeFirst2400, s.windowRTPBelow80Count)
	}

	before := s.windowRTPSamples
	s.ObserveWindowRTPAfterPush(2401, 115, true)
	if s.windowRTPSamples != before {
		t.Fatal("round 2401 should not add range sample")
	}
	if s.windowRTPExtremeAfter2400 != 1 || s.windowRTPExtremeTotal() != 3 {
		t.Fatalf("after2400=%d total=%d want 1 and 3",
			s.windowRTPExtremeAfter2400, s.windowRTPExtremeTotal())
	}
}

func TestObserveWindowExtreme_NormalNotCounted(t *testing.T) {
	var s Stats
	s.MinWindowRTP = 1e9
	s.ObserveWindowRTPAfterPush(1, 95, true)
	if s.windowRTPExtremeTotal() != 0 || s.windowRTPSamples != 1 {
		t.Fatalf("extreme=%d samples=%d", s.windowRTPExtremeTotal(), s.windowRTPSamples)
	}
}
