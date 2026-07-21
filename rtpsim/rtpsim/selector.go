package main

import (
	"fmt"
	"sort"
)

type Zone struct {
	Code          int
	Min           float64
	Max           float64
	TriggerRTP    float64 // V2 進場門檻（PRT: rtp≥Trigger 進；BST: rtp≤Trigger 進）
	ExitRTP       float64 // V2 退場門檻（PRT: rtp<Exit 退一級；BST: rtp>Exit 退一級）
	MathConfigKey string  // BASE/PRT1/...
}

type Selector struct {
	zones  []Zone
	byCode map[int]Zone
}

func NewSelector(specs []ZoneSpec) (*Selector, error) {
	zones := make([]Zone, 0, len(specs))
	for i, s := range specs {
		minV, err := parseBound(s.RTPMin)
		if err != nil {
			return nil, fmt.Errorf("zone[%d] rtp_min: %w", i, err)
		}
		maxV, err := parseBound(s.RTPMax)
		if err != nil {
			return nil, fmt.Errorf("zone[%d] rtp_max: %w", i, err)
		}
		if minV > maxV {
			return nil, fmt.Errorf("zone[%d] min=%g > max=%g", i, minV, maxV)
		}
		zones = append(zones, Zone{
			Code:          s.Code,
			Min:           minV,
			Max:           maxV,
			TriggerRTP:    s.TriggerRTP,
			ExitRTP:       s.ExitRTP,
			MathConfigKey: s.MathConfig,
		})
	}
	sort.Slice(zones, func(i, j int) bool { return zones[i].Min < zones[j].Min })
	// 檢查不重疊
	for i := 1; i < len(zones); i++ {
		if zones[i-1].Max > zones[i].Min {
			return nil, fmt.Errorf("zone 重疊：[%g,%g] vs [%g,%g]",
				zones[i-1].Min, zones[i-1].Max, zones[i].Min, zones[i].Max)
		}
	}
	byCode := make(map[int]Zone, len(zones))
	for _, z := range zones {
		byCode[z.Code] = z
	}
	return &Selector{zones: zones, byCode: byCode}, nil
}

// PickByCode 依 mode code 取 zone（強制模式 / 階梯結果用）
func (s *Selector) PickByCode(code int) (Zone, error) {
	if z, ok := s.byCode[code]; ok {
		return z, nil
	}
	return Zone{}, fmt.Errorf("code=%d 未在 zones 中配置", code)
}

// PickDefault 取 code=0 的 BASE zone
func (s *Selector) PickDefault() (Zone, error) {
	return s.PickByCode(0)
}

func (s *Selector) get(code int) (Zone, bool) {
	z, ok := s.byCode[code]
	return z, ok
}

/**
 * @brief 不參考上一局狀態，僅依各 zone 的 TriggerRTP 直接定位（對齊伺服器 DirectZoneByTrigger）
 * @details 首次決策 / 剛從 MODE=0 復原時使用；嚴重度高的優先。
 */
func (s *Selector) DirectZoneByTrigger(rtp float64) int {
	if z, ok := s.get(101); ok && rtp >= z.TriggerRTP {
		return 101
	}
	if z, ok := s.get(102); ok && rtp >= z.TriggerRTP {
		return 102
	}
	if z, ok := s.get(103); ok && rtp >= z.TriggerRTP {
		return 103
	}
	if z, ok := s.get(201); ok && rtp <= z.TriggerRTP {
		return 201
	}
	if z, ok := s.get(202); ok && rtp <= z.TriggerRTP {
		return 202
	}
	if z, ok := s.get(203); ok && rtp <= z.TriggerRTP {
		return 203
	}
	return 0
}

/**
 * @brief 階梯化 + 遲滯決定下一局 zone code（對齊伺服器 NextZoneByLadder）
 * @details 階梯鏈：201↔202↔203↔0↔103↔102↔101，每局最多 ±1 級。
 *          BST：rtp ≤ TriggerRTP 進入；rtp > ExitRTP 離開（往 BASE 退一級）
 *          PRT：rtp ≥ TriggerRTP 進入；rtp < ExitRTP 離開
 */
func (s *Selector) NextZoneByLadder(currentZone int, rtp float64) int {
	switch currentZone {
	case 0: // BASE
		if z, ok := s.get(203); ok && rtp <= z.TriggerRTP {
			return 203
		}
		if z, ok := s.get(103); ok && rtp >= z.TriggerRTP {
			return 103
		}
		return 0

	case 103: // PRT_L3
		if z, ok := s.get(103); ok && rtp < z.ExitRTP {
			return 0
		}
		if z, ok := s.get(102); ok && rtp >= z.TriggerRTP {
			return 102
		}
		return 103

	case 102: // PRT_L2
		if z, ok := s.get(102); ok && rtp < z.ExitRTP {
			return 103
		}
		if z, ok := s.get(101); ok && rtp >= z.TriggerRTP {
			return 101
		}
		return 102

	case 101: // PRT_L1
		if z, ok := s.get(101); ok && rtp < z.ExitRTP {
			return 102
		}
		return 101

	case 203: // BST_L3
		if z, ok := s.get(203); ok && rtp > z.ExitRTP {
			return 0
		}
		if z, ok := s.get(202); ok && rtp <= z.TriggerRTP {
			return 202
		}
		return 203

	case 202: // BST_L2
		if z, ok := s.get(202); ok && rtp > z.ExitRTP {
			return 203
		}
		if z, ok := s.get(201); ok && rtp <= z.TriggerRTP {
			return 201
		}
		return 202

	case 201: // BST_L1
		if z, ok := s.get(201); ok && rtp > z.ExitRTP {
			return 202
		}
		return 201

	default:
		// 未知 currentZone → 視為 BASE
		return s.NextZoneByLadder(0, rtp)
	}
}
