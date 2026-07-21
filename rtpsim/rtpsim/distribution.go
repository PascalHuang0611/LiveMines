package main

/**
 * @brief 加權抽取一組倍數 combo 寫入 buf（無 alloc），回傳組合長度
 *        對齊生產端 GenerateMultiplierSet（mathconfig.go）：
 *        combo 長度 = 本次閃電數量
 */
func GenerateMultiplierSetInto(d *MultiplierSetDistribution, rng *FastRNG, buf []float64) int {
	if len(d.Values) == 0 || len(d.Values) != len(d.Weights) {
		buf[0] = 1
		return 1
	}
	total := 0
	for _, w := range d.Weights {
		total += w
	}
	idx := 0
	if total > 0 {
		r := rng.Intn(total)
		cum := 0
		for i, w := range d.Weights {
			cum += w
			if r < cum {
				idx = i
				break
			}
		}
	}
	combo := d.Values[idx]
	n := len(combo)
	if n > len(buf) {
		n = len(buf)
	}
	copy(buf[:n], combo[:n])
	return n
}

/**
 * @brief Fisher-Yates 洗牌（對齊生產端 ShuffleFloat32s）
 */
func ShuffleFloat64s(s []float64, rng *FastRNG) {
	for i := len(s) - 1; i > 0; i-- {
		j := rng.Intn(i + 1)
		s[i], s[j] = s[j], s[i]
	}
}

/**
 * @brief 加權位置選擇（無 alloc — 寫入 out[0..count]）
 * @param gridWeights 9 元素；nil/空 → 均勻
 * @param count       要選位置數
 * @param exclude     要排除的位置（mask）；最多 2 個典型 → 用陣列
 * @param out         寫入位置（caller 持有；至少 count 長度）
 * @return 實際填入個數
 */
func GenerateRandomGridPositionsInto(gridWeights []int, count int, exclude [9]bool, rng *FastRNG, out []int32) int {
	const minPos = 1
	if count > 9 {
		count = 9
	}

	if len(gridWeights) == 0 {
		// 均勻：建立可用列表 + Fisher-Yates partial
		var avail [9]int32
		n := 0
		for i := int32(minPos); i <= 9; i++ {
			if !exclude[i-1] {
				avail[n] = i
				n++
			}
		}
		if count > n {
			count = n
		}
		// partial shuffle: pick count from n
		for i := 0; i < count; i++ {
			j := i + rng.Intn(n-i)
			avail[i], avail[j] = avail[j], avail[i]
			out[i] = avail[i]
		}
		return count
	}

	// 加權選擇（無放回）
	var localExc [9]bool = exclude
	filled := 0
	for filled < count {
		total := 0
		for i, w := range gridWeights {
			if !localExc[i] {
				total += w
			}
		}
		if total == 0 {
			// 全 0 → 均勻挑一個未排除
			var avail [9]int32
			n := 0
			for i := int32(minPos); i <= 9; i++ {
				if !localExc[i-1] {
					avail[n] = i
					n++
				}
			}
			if n == 0 {
				return filled
			}
			pick := avail[rng.Intn(n)]
			out[filled] = pick
			localExc[pick-minPos] = true
			filled++
			continue
		}
		r := rng.Intn(total)
		cum := 0
		var chosen int32 = -1
		for i, w := range gridWeights {
			if localExc[i] {
				continue
			}
			cum += w
			if r < cum {
				chosen = int32(i + minPos)
				break
			}
		}
		if chosen < 1 {
			return filled
		}
		out[filled] = chosen
		localExc[chosen-minPos] = true
		filled++
	}
	return filled
}

/**
 * @brief 依 gridWeights 抽一顆球
 */
func DropBall(gridWeights []int, rng *FastRNG) int32 {
	const minPos = 1
	if len(gridWeights) == 0 {
		return int32(rng.Intn(9) + minPos)
	}
	total := 0
	for _, w := range gridWeights {
		total += w
	}
	if total == 0 {
		return int32(rng.Intn(9) + minPos)
	}
	r := rng.Intn(total)
	cum := 0
	for i, w := range gridWeights {
		cum += w
		if r < cum {
			return int32(i + minPos)
		}
	}
	return int32(minPos)
}

/**
 * @brief 依 outcomeWeights 決定結果類型（全不同/二同/三同），再用 gridWeights 選位置
 *        outcomeWeights: [0]=全不同, [1]=二同, [2]=三同
 */
func DropBallsWithOutcome(gridWeights []int, outcomeWeights []int, rng *FastRNG) (int32, int32, int32) {
	totalOW := outcomeWeights[0] + outcomeWeights[1] + outcomeWeights[2]
	r := rng.Intn(totalOW)

	if r < outcomeWeights[0] {
		var exc [9]bool
		var out [3]int32
		GenerateRandomGridPositionsInto(gridWeights, 3, exc, rng, out[:])
		return out[0], out[1], out[2]
	}
	if r < outcomeWeights[0]+outcomeWeights[1] {
		pos := DropBall(gridWeights, rng)
		var exc [9]bool
		exc[pos-1] = true
		var out [1]int32
		GenerateRandomGridPositionsInto(gridWeights, 1, exc, rng, out[:])
		return pos, pos, out[0]
	}
	pos := DropBall(gridWeights, rng)
	return pos, pos, pos
}
