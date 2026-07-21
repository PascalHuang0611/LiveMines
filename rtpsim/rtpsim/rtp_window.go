package main

/**
 * @brief Ring buffer 的 RTP sliding window
 *
 *   保留最近 N 局的 (bet, rtpPayout=main+bonus，**不含 grand prize**)，計算 RTP%
 *   N=0 → 累計型，無 window
 *   RTP 公式刻意排除 grand prize 對齊 LM01 統計口徑
 *
 *   冷啟動行為：
 *   - 第 1 局（push 之前）：sumBet=0 → CurrentRTP() 回 (0, false) → 風控降級 BASE
 *   - 第 2 局起：只要 sumBet > 0 → CurrentRTP() 回 (實際 RTP, true)
 *     不再有「窗口未滿就用 initialRTP」的緩衝期
 */
type RTPWindow struct {
	capacity    int
	bets        []float64
	payouts     []float64
	idx         int
	count       int
	sumBet      float64
	sumPayout   float64
	totalRounds int64
}

// NewRTPWindow 建立 sliding window
//
//	capacity = 0 → 累計型（永不淘汰舊資料）
//	capacity > 0 → 保留最近 capacity 局
//
// 第二個參數 initialRTP 已不使用（冷啟動回 valid=false 讓呼叫端走 BASE）
// 保留簽名相容性
func NewRTPWindow(capacity int, _initialRTPDeprecated float64) *RTPWindow {
	w := &RTPWindow{capacity: capacity}
	if capacity > 0 {
		w.bets = make([]float64, capacity)
		w.payouts = make([]float64, capacity)
	}
	return w
}

func (w *RTPWindow) Push(bet, payout float64) {
	w.totalRounds++
	if w.capacity == 0 {
		w.sumBet += bet
		w.sumPayout += payout
		return
	}
	if w.count == w.capacity {
		// 退出最老的
		w.sumBet -= w.bets[w.idx]
		w.sumPayout -= w.payouts[w.idx]
	} else {
		w.count++
	}
	w.bets[w.idx] = bet
	w.payouts[w.idx] = payout
	w.idx = (w.idx + 1) % w.capacity
	w.sumBet += bet
	w.sumPayout += payout
}

// CurrentRTP 只要 sumBet > 0（已有任何局資料）即回 valid=true
// 第 1 局 push 之前：sumBet=0 → (0, false) → 呼叫端 fallback BASE
func (w *RTPWindow) CurrentRTP() (rtp float64, valid bool) {
	if w.sumBet <= 0 {
		return 0, false
	}
	return w.sumPayout / w.sumBet * 100, true
}

// TotalRounds 已 Push 的局數（含本局）
func (w *RTPWindow) TotalRounds() int64 {
	return w.totalRounds
}

// Sums 窗口內原始 (bet, payout) 總和（V3 預估派彩後 RTP 用）
func (w *RTPWindow) Sums() (bet, payout float64) {
	return w.sumBet, w.sumPayout
}
