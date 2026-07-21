package main

import (
	"testing"
)

func TestGenerateMultiplierSetInto_Weighted(t *testing.T) {
	d := &MultiplierSetDistribution{
		Values:  [][]float64{{1, 1}, {1, 1, 1}, {2, 2}},
		Weights: []int{56, 44, 0},
	}
	rng := NewFastRNG(1)
	var buf [9]float64
	count2 := 0
	const N = 20000
	for i := 0; i < N; i++ {
		n := GenerateMultiplierSetInto(d, &rng, buf[:])
		switch n {
		case 2:
			if buf[0] != 1 || buf[1] != 1 {
				t.Fatalf("2 長度組合應為 [1,1]（權重 0 的 [2,2] 不應出現），得 %v", buf[:n])
			}
			count2++
		case 3:
			// [1,1,1]
		default:
			t.Fatalf("非預期組合長度 %d", n)
		}
	}
	r2 := float64(count2) / N
	if r2 < 0.53 || r2 > 0.59 {
		t.Errorf("2 道組合比例 %f 預期約 0.56", r2)
	}

	// 期望道數 = 2×0.56 + 3×0.44 = 2.44
	if e := ExpectedComboLength(d); e < 2.43 || e > 2.45 {
		t.Errorf("ExpectedComboLength = %f, want 2.44", e)
	}
}

func TestShuffleFloat64s_CoversPermutations(t *testing.T) {
	rng := NewFastRNG(7)
	seen := map[[3]float64]int{}
	for i := 0; i < 6000; i++ {
		s := []float64{1, 2, 3}
		ShuffleFloat64s(s, &rng)
		seen[[3]float64{s[0], s[1], s[2]}]++
	}
	if len(seen) != 6 {
		t.Errorf("3 元素洗牌應出現 6 種排列，得 %d", len(seen))
	}
}

func TestGenerateRandomGridPositionsInto_Uniform_Exclude(t *testing.T) {
	rng := NewFastRNG(2)
	var exc [9]bool
	exc[4] = true // 排除位置 5
	var out [9]int32
	for i := 0; i < 100; i++ {
		n := GenerateRandomGridPositionsInto(nil, 3, exc, &rng, out[:])
		if n != 3 {
			t.Fatalf("應取 3 個，得 %d", n)
		}
		for k := 0; k < n; k++ {
			if out[k] == 5 {
				t.Errorf("排除位置 5 仍出現")
			}
		}
	}
}

// 加權位置：V4 五級權重（如 140 vs 60）應反映在閃電位置命中率
func TestGenerateRandomGridPositionsInto_Weighted(t *testing.T) {
	rng := NewFastRNG(11)
	weights := []int{140, 100, 100, 100, 100, 100, 100, 100, 60}
	var exc [9]bool
	var out [9]int32
	var hit [10]int
	const N = 50000
	for i := 0; i < N; i++ {
		if n := GenerateRandomGridPositionsInto(weights, 1, exc, &rng, out[:]); n != 1 {
			t.Fatalf("應取 1 個")
		}
		hit[out[0]]++
	}
	total := 140.0 + 100*7 + 60
	r1 := float64(hit[1]) / N
	r9 := float64(hit[9]) / N
	want1 := 140.0 / total
	want9 := 60.0 / total
	if r1 < want1*0.9 || r1 > want1*1.1 {
		t.Errorf("位置1 命中率 %f 預期約 %f", r1, want1)
	}
	if r9 < want9*0.9 || r9 > want9*1.1 {
		t.Errorf("位置9 命中率 %f 預期約 %f", r9, want9)
	}
}
