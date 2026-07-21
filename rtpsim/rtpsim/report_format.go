package main

import (
	"fmt"
	"strings"
)

// comma 整數千分位格式化
func comma(n int64) string {
	s := fmt.Sprintf("%d", n)
	neg := false
	if strings.HasPrefix(s, "-") {
		neg = true
		s = s[1:]
	}
	var b strings.Builder
	pre := len(s) % 3
	if pre > 0 {
		b.WriteString(s[:pre])
		if len(s) > pre {
			b.WriteByte(',')
		}
	}
	for i := pre; i < len(s); i += 3 {
		b.WriteString(s[i : i+3])
		if i+3 < len(s) {
			b.WriteByte(',')
		}
	}
	if neg {
		return "-" + b.String()
	}
	return b.String()
}

// commaF 金額千分位格式化（保留 2 位小數）
func commaF(x float64) string {
	neg := x < 0
	if neg {
		x = -x
	}
	whole := int64(x)
	frac := x - float64(whole)
	out := fmt.Sprintf("%s.%02d", comma(whole), int(frac*100+0.5))
	if neg {
		return "-" + out
	}
	return out
}

// FormatTripleCompareTables 產出可複製到 Excel 的 TSV 文字
func FormatTripleCompareTables(title string, runs map[string]Summary) string {
	var b strings.Builder
	if title != "" {
		b.WriteString(title)
		b.WriteByte('\n')
	}
	writeTripleCompareRTPTable(&b, runs)
	writeTripleCompareZoneTSV(&b, runs, "各層級（Zone / 機率表）使用局數")
	if hasBuyerRuns(runs) {
		b.WriteString("\n購買 EXTRA 子集 RTP（含 JP，分母含 EXTRA 加價）\n")
		writeBuyerExtraRTPTable(&b, runs)
		writeTripleCompareZoneTSV(&b, runs, "購買 EXTRA 子集 — 各層級（Zone / 機率表）使用局數")
	}
	return b.String()
}

func writeTripleCompareRTPTable(b *strings.Builder, runs map[string]Summary) {
	b.WriteString("三跑 RTP 對比（含 grand，不含 EXTRA）\n")
	b.WriteString("run\tmode\tMainBetOnly\tMain RTP%\tBonus RTP%\tGrand RTP%\t★RTP(含grand,不含EXTRA)\tV2切換\tV3介入\tV3省下派彩\tV4非中性%\n")
	for _, lbl := range tripleCompareRunLabels {
		s, ok := runs[lbl]
		if !ok {
			continue
		}
		x := s.ExclExtra
		v2Switches, v3Count, v3Saved, v4Pct := "-", "-", "-", "-"
		if v2 := s.ControlStats.V2; v2 != nil {
			v2Switches = fmt.Sprintf("%d", v2.ZoneSwitches)
		}
		if v3 := s.ControlStats.V3; v3 != nil {
			v3Count = fmt.Sprintf("%d", v3.TotalInterventions)
			v3Saved = fmt.Sprintf("%.2f", v3.SavedPayout)
		}
		if v4 := s.ControlStats.V4; v4 != nil {
			v4Pct = fmt.Sprintf("%.2f", v4.NonNeutralPercent)
		}
		fmt.Fprintf(b, "%s\t%d\t%.2f\t%.4f\t%.4f\t%.4f\t%.4f\t%s\t%s\t%s\t%s\n",
			lbl, s.Mode, x.MainBetOnly,
			x.MainRTPPercent, x.BonusRTPPercent, x.GrandRTPPercent,
			x.IncludingGrandRTP,
			v2Switches, v3Count, v3Saved, v4Pct)
	}
}

func writeBuyerExtraRTPTable(b *strings.Builder, runs map[string]Summary) {
	b.WriteString("run\tBuyerBet\tMain RTP%\tBonus RTP%\tGrand RTP%\t★RTP(含 grand)\n")
	for _, lbl := range tripleCompareRunLabels {
		s, ok := runs[lbl]
		if !ok {
			continue
		}
		br := s.RTPSplitByPaidLightning.Buyer
		if br.TotalBet <= 0 {
			continue
		}
		fmt.Fprintf(b, "%s\t%.2f\t%.4f\t%.4f\t%.4f\t%.4f\n",
			lbl, br.TotalBet,
			br.MainRTPPercent, br.BonusRTPPercent, br.GrandRTPPercent,
			br.IncludingGrandRTP)
	}
}

func writeTripleCompareZoneTSV(b *strings.Builder, runs map[string]Summary, title string) {
	codes := collectZoneCodesFromRuns(runs)
	if len(codes) == 0 {
		return
	}
	b.WriteByte('\n')
	b.WriteString(title)
	b.WriteByte('\n')
	b.WriteString("zone\tmath")
	for _, lbl := range tripleCompareRunLabels {
		if _, ok := runs[lbl]; ok {
			fmt.Fprintf(b, "\t%s_hits\t%s_%%", lbl, lbl)
		}
	}
	b.WriteByte('\n')
	for _, code := range codes {
		mathKey := zoneMathConfigFromRuns(runs, code)
		fmt.Fprintf(b, "%d\t%s", code, mathKey)
		for _, lbl := range tripleCompareRunLabels {
			s, ok := runs[lbl]
			if !ok {
				continue
			}
			hits, rate := zoneHitsAndRate(s, code)
			fmt.Fprintf(b, "\t%d\t%.2f", hits, rate)
		}
		b.WriteByte('\n')
	}
}

func hasBuyerRuns(runs map[string]Summary) bool {
	for _, lbl := range tripleCompareRunLabels {
		if s, ok := runs[lbl]; ok && s.RTPSplitByPaidLightning.Buyer.TotalBet > 0 {
			return true
		}
	}
	return false
}
