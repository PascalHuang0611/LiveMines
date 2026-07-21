# rtpsim — LM01 RTP 模擬驗證工具

純數學計算的離線模擬器，不接 DB / Redis / MQ / Nacos / Lark。
驗證現行三層風控（V2 機率表切換 + V3 JP 開獎強控 + V4 風險分數位置權重）疊加後的
RTP、JP 池流動、per-player 細項。閃電生成採用整組 payoutMultipliers combo 抽取（bd93621），
V4 直接複用生產端 `entity/riskscore` 計算邏輯。V1 位置干預已隨伺服器移除。

## 編譯與執行

```sh
# 在 gms 模組根目錄
cd gms
go build ./tools/rtpsim

# 直接執行
./rtpsim -config tools/rtpsim/sim_config.example.json -rounds 100000 -seed 42
```

或不編譯直接跑：
```sh
cd gms/tools/rtpsim
go run . -config sim_config.example.json -rounds 100000
```

## CLI flag

| flag | 預設 | 說明 |
|---|---|---|
| `-config` | `sim_config.json` | 設定檔路徑 |
| `-rounds` | 0 | 覆蓋 `simulation.rounds`；0=用 config 值 |
| `-workers` | 0 | 覆蓋 `simulation.workers`；0=用 config 值（並行版未實作） |
| `-seed` | -1 | 覆蓋 `simulation.rng_seed`；-1=用 config，0=time-based |
| `-out` | "" | 覆蓋 `output.dir` |
| `-triple` | false | 三跑對比模式（見下方） |

## 三跑對比模式 `-triple`

同一 `master_seed` 下跑三種風控設定，**玩家決策完全相同**（bet 位置 / paid 購買 / cashout / 4 選 1）。

| Run | 風控組合 | 說明 |
|---|---|---|
| `run1_no_control` | 無 | 完全無風控（永遠 BASE） |
| `run2_v2_only` | V2 | 僅機率表切換（階梯+遲滯） |
| `run3_v2_v3_v4` | V2+V3+V4 | 機率表 + JP 強控 + 風險分數位置權重（對齊伺服器現況） |

輸出位於 `output.dir/{run1_no_control,run2_v2_only,run3_v2_v3_v4}/`，
另外 `output.dir/triple_compare.json` 為彙總對比。

CLI 顯示對比表（不含 grand prize）：
```
=== 三跑 RTP 對比（不含 grand prize）===
run                            mode  TotalBet         Main RTP%  Bonus RTP%  Grand RTP%  ★RTP(不含 grand)
run1_no_control                  0   ...              88.5926    0.5537      9.6797      89.1463
run2_full_control                1   ...              89.9560    0.5516      9.4853      90.5076
run3_only_math_switch            1   ...              89.7702    0.5532      9.6519      90.3234
```

技術：使用 3 個獨立 RNG（playerRng / ballRng / sysRng）。playerRng 與 ballRng 同種子下三跑序列一致；
sysRng 自然發散（不同 mathConfig / 不同風控路徑）。

## 設定檔結構

見 [sim_config.example.json](sim_config.example.json)。

關鍵調整項目：
- `players.bet_per_position` — 每位置下注額
- `players.paid_lightning_purchase_rate` — 玩家買付費閃電比例（0..1）
- `players.bonus_cashout_probability` — 二級玩法每關 cashout 機率
- `rtp_control.mode` — 0=BASE / 1=自動 / 101-103/201-203=強制
- `rtp_control.zones[].trigger_rtp / exit_rtp` — V2 階梯遲滯門檻（對齊 gms.xml）
- `rtp_control.jp_protection_v3` — V3 階段門檻與各 BG 關卡介入機率表
- `rtp_control.risk_score_v4` — V4 開關（權重差異由 math config gridWeights 五級配置決定）
- `simulation.round_interval_seconds` — 虛擬時鐘（V4 的 30m/2h 時間窗語意），預設 30 秒/局
- `egame_data.pool_per_card` — JP 抽水率（如 0.005）
- `egame_data.fix_pool_per_card` — 抽水進主池比例（0.3 = 30% 主、70% 副）

## 輸出

預設輸出到 `./rtpsim_out/`：

| 檔案 | 內容 |
|---|---|
| `summary.json` | 全局統計 + per-zone + 分位數 + 池狀態 |
| `per_zone.csv` | 每 zone 命中次數 / 觸發數 / 子集 RTP |
| `per_player.csv` | 1000 玩家逐筆 RTP（依 RTP 升冪排序） |

### RTP 定義

**RTP = (main_game_payout + bonus_game_payout) / total_bet × 100**

刻意**排除大獎主池派彩**（grand prize），對齊 LM01 風控統計口徑。
若要看含大獎的 RTP，summary 中另有 `rtp_percent_incl_grand` 欄位作參考。

`payout` 分為 3 桶：`main_game_payout` / `bonus_game_payout` / `grand_prize_payout`，
分別有獨立 RTP（`main_rtp_percent` / `bonus_rtp_percent` / `grand_rtp_percent`）。

### summary.json 主要欄位

```jsonc
{
  "rounds_simulated": 100000000,
  "overall":             { "rtp_percent": ..., "main_game_payout": ..., "bonus_game_payout": ..., "grand_prize_payout": ... },
  "rtp_split_by_paid_lightning": {
    "buyer_subset":   { "rounds": ..., "rtp_percent": ... },   // 有買付費閃電
    "nonbuyer_subset":{ "rounds": ..., "rtp_percent": ... }    // 沒買
  },
  "jp_pool":             { "main_pool_end": ..., "sub_pool_end": ..., "auto_inject_events": N, ... },
  "per_zone":            [ {"code": 0, "rtp_percent": ..., "v3_interventions": N}, ... ],
  "control_stats":       { "v2": {"zone_switches": N}, "v3": {"total_interventions": N, "saved_payout": X, "per_phase": [...]}, "v4": {"non_neutral_percent": X, "avg_smoothed_trs": [...], ...} },
  "three_same_balls":    { "occurrences": N, "rate_percent": X },
  "per_player_quantiles":{ "min_rtp": X, "p5": X, "p50": X, "p95": X, "max_rtp": X }
}
```

### per_player.csv

依 RTP 升冪排序，可直接看最低 / 最高 N 名：
```csv
player_id, total_bet, total_payout, rtp_percent,
buyer_rounds, buyer_bet, buyer_payout, buyer_rtp,
nonbuyer_rounds, nonbuyer_bet, nonbuyer_payout, nonbuyer_rtp,
jp_qualified_count, jp_grand_prize_count
```

## 模擬流程（一局）

1. V2 決策本局 math config — 首次/剛復原用 DirectZoneByTrigger，否則 NextZoneByLadder（±1 級 + 遲滯）
2. 1000 玩家選位下注；每人骰是否買付費閃電（影響 bet 含 `extraPurchaseCostPercent`）
3. 取 V4 權重（上一局重算結果；冷啟動/停用=中性）
4. 免費/付費閃電：抽整組 combo → 洗牌 → 依 V4 權重不放回抽位置 → 1:1 綁定倍數
5. 3 顆球依 `ball_drop.grid_weights` 落格；餵入 V4 球窗口
6. 主遊戲派彩：每位置 `hits × SingleAreaBasePayouts[hits-1] × (1 + freeMul + (買? paidMul : 0))`；同步收集每格風險統計
7. 三同球 → 二級玩法（整房每關共用一次 4選2；玩家各選 1 選項）
8. 每關開獎後 V3 檢查：預估派彩後 RTP → 階段 → 依 BG 關卡機率骰 → 中則通關強改下注最低 2 選項
9. 過 5 關大獎：按下注比例分主池
10. JP 抽水 + 自動注資
11. V4 局尾重算（TRS/LRS → EWMA → 五級分權，供下一局使用）；更新 RTP sliding window

## 風控摘要

| 層 | 時機 | 行為 |
|---|---|---|
| V2 | 每局開始 | 依 48h（rounds proxy）窗口 RTP 走階梯+遲滯換機率表 |
| V3 | JP 每關開獎後 | 預估派彩後 RTP ≥103/105/107/110 分階段骰，介入時通關改最低下注 2 選項 |
| V4 | 每局結束計算、下局套用 | TRS/LRS 風險分數 → 五級權重調整閃電落點（gridWeights 全 100 時=shadow） |

註：與伺服器的差異——窗口為局數制（`rtp_window_rounds` 預設 48000 局 proxy 48h）；
V4 時間窗使用虛擬時鐘；二級玩法自本版起為整房共用開獎（舊版為每玩家獨立，Bonus RTP 特性略有變化）。

## 已知限制 / TODO

- 目前序列執行（單 goroutine），1 億局約需 1-2 小時；並行版本 commit K 待擴充
- `simulation.workers` flag 已留接口但未啟用
- per-player CSV 1000 行 OK；如果未來擴到 10k+ 玩家需考慮串流寫入

## 單元測試

```sh
cd gms
go test ./tools/rtpsim/...
```

涵蓋：combo 加權抽取與洗牌、加權位置分布、V2 階梯+遲滯規則表、共用二級通過率（理論 1/32）、
V3 強改最低兩選項/GGR 捷徑/門檻判定、池抽水/注資/大獎分配。
