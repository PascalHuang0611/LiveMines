package main

/**
 * @brief SplitMix64：值類型 RNG，per-round 建立完全 stack-allocated 無 alloc
 *        統計品質足以做 RTP 模擬（非 cryptographic）
 *        所有 rng 方法都用 pointer receiver 才能 mutate state
 */
type FastRNG struct {
	state uint64
}

func NewFastRNG(seed uint64) FastRNG {
	return FastRNG{state: seed}
}

func (r *FastRNG) Uint64() uint64 {
	r.state += 0x9E3779B97F4A7C15
	z := r.state
	z = (z ^ (z >> 30)) * 0xBF58476D1CE4E5B9
	z = (z ^ (z >> 27)) * 0x94D049BB133111EB
	return z ^ (z >> 31)
}

func (r *FastRNG) Intn(n int) int {
	if n <= 0 {
		return 0
	}
	return int(r.Uint64() % uint64(n))
}

func (r *FastRNG) Float64() float64 {
	return float64(r.Uint64()>>11) / float64(1<<53)
}
