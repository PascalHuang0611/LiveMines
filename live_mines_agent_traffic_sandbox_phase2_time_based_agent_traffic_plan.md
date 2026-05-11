# LiveMines V3 Time-Based Agent Traffic Layer Integration Plan

> Revision: Latest Phase 2 plan with **time-based Agent Traffic**, manual QA execution mode, and plan-change protocol.
> Key changes: agent pool is not simultaneous online population; each round only activates agents whose planned sessions overlap current time.
> DNA version: `LiveMines_Agent_DNA_v2_5levels_lightning_chipprior` / frontend spec DNA.
> Execution model: AI Agent implements only the requested milestone; user performs manual QA.
> Phase 3 LLM interactive agents are explicitly out of scope for this document.



## 0.1 Execution Mode：AI Agent 實作，使用者手動驗證

本文件是逐 Milestone 實作指南，不是自動測試或自動驗證任務。

AI Agent 每次只實作使用者明確指定的 Milestone。完成該 Milestone 後必須停止並回報，不要自動進入下一個 Milestone。

AI Agent 完成回報只需包含：

```text
1. 本次完成了哪些功能
2. 修改了哪些檔案
3. 有哪些已知限制 / 風險
4. 建議使用者手動檢查哪些項目
```

AI Agent 不要主動做以下事情，除非使用者明確要求：

```text
不要自動執行完整 validation
不要自動新增或擴充自動化測試框架
不要主動實作 DNA vs Actual 驗證面板
不要主動執行下一個 Milestone
不要重構非本 Milestone 必須修改的程式
不要把 Manual QA Checklist 當成必須自動通過的測試任務
```

若 Milestone 完成後發現需要下一步修正，請列在「建議手動檢查 / 後續項目」中，等待使用者確認。

---

## 0.2 Plan Change Protocol：規格變更流程

本 plan 允許在開發過程中持續演進。

若使用者在開發中新增、修正或改變任何規則，AI Agent 必須視為 **plan change**。AI Agent 不得在未更新 plan 的情況下，默默把新規則直接寫進 code。

當新規則會影響目前或未來 Milestone 時，AI Agent 應該：

```text
1. 摘要使用者提出的變更。
2. 指出受影響的 sections / milestones。
3. 先更新 plan 文字。
4. 再依更新後的 plan，只實作目前被指定的 milestone。
5. 完成後停止，等待使用者手動驗證。
```

除非使用者明確要求，不要自動進入下一個 milestone。

若新規則與舊 plan 衝突，以最新使用者指令為準，但必須同步反映到 plan。

```text
Plan 是協作與規格來源。
V3 codebase 仍是遊戲規則真相來源。
最新使用者指令 > 本 plan 舊文字。
但任何新指令都應被寫回 plan，避免 code 與文件分裂。
```

建議使用者在追加規格時使用這種格式：

```text
規格變更：<一句話描述新規則>
請先更新 plan 中所有相關 section，然後只修改目前 milestone 的實作，不要進下一個 milestone。
```

範例：

```text
規格變更：Cashout_Stop_Level 只能是 1~5。
請更新 DNA spec、decision section、manual QA checklist，然後只修改目前 milestone 的實作。
```

---

## 0.3 Phase Scope：本文件只處理 Phase 2

本文件只處理 **Phase 2：Real Bet Slip → Time-Based Agent Traffic Layer**。

```text
Phase 1：V3 LiveMines 遊戲規則與既有模擬器（已存在）
Phase 2：真實注單 → Agent DNA → 時間型人流 → 多人同場模擬（本文件範圍）
Phase 3：LLM Interactive Agents，讓部分 Agent 會輸出決策理由並受使用者互動影響（不在本文件範圍）
```

AI Agent 不要在本文件的 Milestone 中主動實作 LLM、prompt、Agent 思考文字、對話記憶、或 PM 互動影響決策。

若使用者未來要求 Phase 3，請另開獨立 spec，不要混入目前 Phase 2 的里程碑。

---

## 0.4 核心人流原則：Agent Pool 不是同時在線人數

Agent 人流模式不是 3000 人同時在線模式。

```text
Agent Pool = 從真實注單萃取出的玩家 DNA 母體
Day Active Agents = 今天根據 Daily_Login_Probability / session plan 會出現的玩家
Current Active Agents = 當前 1~1.5 分鐘這一局真的在線、會下注的玩家
```

每局只能對 **Current Active Agents** 做下注決策與結算。

Inactive agents 不應該在每局產生下注、不應該進入 settlement，也不應該被當成本局同場玩家。

AI Agent 實作時請避免「每局讓全部 agentPool 都下注」的錯誤。agentPool 可包含數千位玩家，但每局 active 人數應由時間模型與 session 模型決定。

---

## 0. One-line Mission for AI Agent

在既有 LiveMines V3 專案上新增一個「基於真實注單時間分布的 Agent 人流模式 / Time-Based Agent Traffic Layer」。

不要重寫 LiveMines 遊戲規則，不要重構掉既有 V3 的核心邏輯，不要破壞手動模式、物理資料模式、理論隨機模式、歷史紀錄與既有統計。

本任務只新增一層：

```text
真實注單 DNA pool → day/session planning → current active agents → Agent 下注決策 → 多人同場套用同一局既有賽果 → Round / Day / Persona / Agent 統計
```

---

# 1. Highest Priority Rule：V3 是遊戲規則真相來源

AI Agent 已經擁有目前 V3 的完整程式碼，因此：

```text
V3 現有程式碼中的 LiveMines 規則視為正確。
本計劃只描述要新增的人流層。
若本計劃與 V3 現有遊戲規則衝突，以 V3 現有程式碼為準。
```

除非規則是 V3 尚未處理的人流新增需求，否則不要修改既有規則。

## 1.1 不可擅自改動的既有邏輯

以下邏輯若 V3 已存在，全部沿用：

```text
落球生成 / 物理資料讀取
免費閃電生成 / 物理資料讀取
購買閃電生成 / 物理資料讀取
基礎派彩公式
購買閃電成本公式
Bonus 觸發條件
Bonus 層級設定
Bonus payout
Bonus Cash Out / Risk 流程
JP pool 累積
現有 invalid round / skip / reroll 處理
理論隨機模式
真實物理資料模式
歷史紀錄原本格式
圖表與統計原本邏輯
```

## 1.2 Agent 人流模式只新增

```text
1. 根據第幾局換算當天時間
2. 根據真實注單萃取出的時間 / session DNA 生成 day plan
3. 根據 day plan 判斷本局 current active agents
4. 僅對 current active agents 產生下注決策
5. 將多個 active agents 套用到同一局既有 V3 賽果
6. 逐 Agent 結算
7. 聚合 Round / Day / Persona / Agent 統計
8. 在 UI 顯示人流模式結果
```

## 1.3 單人 → 多人同場的必要調整

出獎邏輯（落球 / 閃電 / Bonus 答案）的核心計算完全不動。

從「單人」改成「多人同場」時，只有以下地方需要調整：

```text
1. 下注輸入來源：由固定 UI grids 改為「所有 active agents 各自的 betMap 聚合 / 個別結算」
2. Bonus 選牌：由單一 UI bonusPositions 改為「每個 Agent 各自選牌」
3. 購買閃電：由單一 boolean 改為「每個 Agent 各自決定 buyLightning，但共用同一局 public purchased lightning result」
4. JP 結算：由單一玩家觸發改為「多人候選 + 份額預分配 + 未通關保留」（詳見 Section 19）
5. 統計聚合：由單局單人 netProfit 改為「Round Summary / Day Summary / Persona Summary」
```

所有派彩倍率、觸發條件、Bonus payout 表等遊戲規則數值，全部沿用 V3 appConfig，不另設。

---

# 2. V3 專案入口與實作基準

V3 正式入口：

```text
TG001_FinalCheck_V3.html
```

此檔案只負責掛載 Vue app：

```html
<div id="app"></div>
<script type="module" src="/src/main.js"></script>
```

AI Agent 應以 `src/` 內的 Vue / Pinia / Engine 架構為主要修改目標。

不要以 V2 單頁 HTML 作為開發基準。

---

# 3. 功能定位

新增模式名稱：

```text
Agent 人流模式
Agent Traffic Mode
Agent Traffic Layer
```

UI 文案請使用：

```text
行為參考模擬
多人場沙盤
上線前情境比較
Agent DNA 人流模式
```

不要使用：

```text
精準預測
真實人流預測
準確營收預測
```

---

# 4. 模式設計

V3 需要保留原模式，並新增 Agent 人流模式。

## 4.1 原模式

保留既有：

```text
手動選格
手動下注金額
手動是否購買閃電
手動 Bonus 策略
單局模擬
批次模擬
理論隨機賽果
真實物理資料賽果
```

## 4.2 Agent 人流模式

新增的是 **時間型人流模式**，不是全 agent 同時在線模式。

```text
一個切片代表一天
預設 roundsPerDay = 1200
每局換算成當天時間
agentPool 代表真實玩家 DNA 母體
day planning 決定今天哪些 agents 會出現、各自 session 起訖時間
每局只取出 current active agents
每個 active agent 自動下注
所有 active agents 共用同一局 public result
逐 active agent 結算
聚合 Round / Day / Persona / Agent 統計
```

重要限制：

```text
不要讓 agentPool 全員每局下注。
不要把 agent count 當成本局在線人數。
本局在線人數只能來自 planned sessions 與 current round time 的交集。
```

---

# 5. 多人場 Public Result 原則

LiveMines 是多人同賽果遊戲。

在 Agent 人流模式下，每一局只能有一組 Public Round Result。

## 5.1 Public，全場共用

```text
三顆球落點
免費閃電結果
購買閃電結果
Bonus 每層勝利牌 / 安全牌
JP pool 狀態
```

## 5.2 Per-Agent，個別決策

```text
是否在線
押幾格
押哪些格
每格押多少
是否購買閃電
Bonus 每層選哪張牌
Bonus 挑戰到第幾層
是否 Cash Out / Risk
停損停利
輸後加注
贏後縮注
```

## 5.3 購買閃電在人流模式下的理解

購買閃電的結果是 public。

```text
每局只產生一次 purchased lightning result。
Agent 只決定 buyLightning true / false。
若 buyLightning = true，該 Agent 套用該局 public purchased lightning。
若 buyLightning = false，該 Agent 不套用 purchased lightning。
```

不要為每個 Agent 各自重新抽 purchased lightning。

---

# 6. 理論模式與物理資料模式

Agent 人流模式必須尊重 V3 目前的賽果來源。

## 6.1 理論隨機模式

若目前 V3 設定為理論隨機，則 public result 由既有 V3 理論邏輯產生。

Agent 人流層不得另寫一套不同的落球 / 閃電規則。

## 6.2 真實物理資料模式

若目前 V3 設定為真實物理資料，則 public result 優先由 V3 既有物理資料邏輯提供。

```text
Agent 只決定下注。
Agent 不得改變物理落球。
Agent 不得重新生成物理資料已提供的閃電。
```

若物理資料只包含部分內容，例如只包含落球，不包含閃電，則缺失部分沿用 V3 目前物理資料模式的既有處理方式。

不要因 Agent Mode 另開新規則。

---

# 7. Agent DNA 資料規格

Agent 檔案以新版 frontend spec JSON 為準，建議檔名類似：

```text
LiveMines_Agent_DNA_v2_5levels_lightning_chipprior_spec_*.json
```

第一版優先支援 JSON。CSV 可作為後續支援，但 parser 必須處理字串型 array 欄位，且不可造成大檔效能問題。

## 7.1 前端 spec 必要欄位

```text
Account
Player_Persona
Persona_Name_ZH
Persona_Name_EN
Persona_Description
Primary_Play_Hour
Hourly_Activity_Vector
Daily_Login_Probability
Sessions_Per_Active_Day
Wakeup_Minute
Daily_Session_Length
Micro_Session_Length
Break_Duration_Minutes
Avg_Bet_Amount
Bet_Amount_Std
LiveMines_Target_Grids
Grid_Count_Std
Bet_Distribution_Type
Anchor_Bet_Ratio
Win_Grid_Stickiness
Buy_Lightning_Prob
Cashout_Propensity
Cashout_Stop_Level
Session_Stop_Loss_Multi
Session_Take_Profit_Multi
LiveMines_Bonus_Risk_Prob
Martingale_Multiplier
Win_Retrench_Ratio
Grid_Preferences
Available_Bet_Denominations
Bet_Denomination_Mode
Preferred_Chip_Count
Chip_Denomination_Weights
Prior_Bet_Denomination_Mode
Prior_Preferred_Chip_Count
Prior_Chip_Denomination_Weights
Chip_DNA_Source
```

## 7.2 欄位值域

```text
Primary_Play_Hour: 0 ~ 23
Wakeup_Minute: 0 ~ 59
Hourly_Activity_Vector: 長度 24, 每格 0~1, normalize 後總和 = 1
Daily_Login_Probability: 0 ~ 1
Sessions_Per_Active_Day: >= 1
Daily_Session_Length: >= 1
Micro_Session_Length: >= 1
Break_Duration_Minutes: >= 0
Avg_Bet_Amount: >= 0
Bet_Amount_Std: >= 0
LiveMines_Target_Grids: 1 ~ 9
Grid_Count_Std: >= 0
Bet_Distribution_Type: anchor | equal
Anchor_Bet_Ratio: 0.5 ~ 0.95
Win_Grid_Stickiness: 0 ~ 1
Buy_Lightning_Prob: 0.05 ~ 0.8
Cashout_Propensity: 0.1 ~ 0.9
Cashout_Stop_Level: 1 ~ 5
Session_Stop_Loss_Multi: >= 5
Session_Take_Profit_Multi: >= 5
LiveMines_Bonus_Risk_Prob: 0.1 | 0.5 | 0.9
Martingale_Multiplier: 1.0 ~ 10.0
Win_Retrench_Ratio: >= 0
Grid_Preferences: 長度 9, 每格 0~1, normalize 後總和 = 1
Available_Bet_Denominations: 固定 [1,5,10,50,100,500,1000]
Preferred_Chip_Count: >= 1
Chip_Denomination_Weights: 長度 7, 每格 0~1, normalize 後總和 = 1
Chip_DNA_Source: synthetic_prior_from_amount_only 或未來 observed_chip_clickstream
```

## 7.3 字串 array parsing

以下欄位在 JSON / CSV 中可能是字串形式，載入後必須 parse 成 number array：

```text
Hourly_Activity_Vector
Grid_Preferences
Available_Bet_Denominations
Chip_Denomination_Weights
Prior_Chip_Denomination_Weights
```

範例：

```text
"[0.0877, 0.307, 0.1096, 0.0439, 0.0877, 0.0877, 0.0746, 0.1009, 0.1009]"
```

Parsing 後必須：

```text
1. 轉為 number[]
2. 檢查長度
3. 負值或 NaN 轉為 0
4. 若總和 > 0 則 normalize
5. 若總和 = 0 則使用均勻分佈 fallback
```

## 7.4 Persona 分組

`Player_Persona` 直接 passthrough，作為統計 key。

不要硬編碼 persona 名稱。新版可能是：

```text
Adaptive_Martingaler
ProfitTaker_Cautious
Marathoner_Greedy
```

UI 顯示時可使用：

```text
Persona_Name_ZH
Persona_Name_EN
Persona_Description
```

但聚合 key 一律使用原始 `Player_Persona`。

## 7.5 欄位可信度與 UI 文案

`Buy_Lightning_Prob` 是舊遊戲 EXBET 或下注行為 proxy 推估而來，代表「加購 Lightning 偏好」，不是 Cashout 行為。

`Cashout_Propensity` 與 `Cashout_Stop_Level` 是新二級玩法的 prior。新遊戲只有 1~5 關，因此 `Cashout_Stop_Level` 必須 clamp 到 1~5。

`LiveMines_Bonus_Risk_Prob` 是情境型 / 行為推導欄位，不是真實 LiveMines 歷史學習結果。

`Chip_DNA_Source = synthetic_prior_from_amount_only` 時，代表目前只有舊注單金額，沒有真實面額點擊紀錄。此時 chip 欄位只能作為模擬器 prior，不可寫成真實籌碼偏好。

UI 文案請避免：

```text
真實購買率
真實 Cashout 率
真實籌碼點擊偏好
```

建議使用：

```text
行為先驗
舊遊戲行為遷移
上線前模擬假設
```
# 8. 新增檔案建議

優先新增模組，不要把所有邏輯塞進 store 或現有 SimulationEngine。

建議新增：

```text
src/engine/AgentDataLoader.js
src/engine/AgentBehaviorEngine.js
src/engine/TrafficSimulationEngine.js
```

如果 V3 現有架構已有更適合位置，依現有架構調整，但需保持職責分離。

---

# 9. Store 修改建議

修改 `src/store/gameStore.js` 或現有 Pinia store。

新增 state：

```text
simulationMode: 'manual' | 'agentTraffic'
agentTrafficEnabled
trafficScenario
trafficCurrentDay
trafficCurrentRoundInDay
trafficHistory
trafficDaySummaries
trafficPersonaStats
trafficAgentStats
trafficDayPlanSummary
currentActiveAgentCount
```

> **效能原則：`agentPool` 與 `agentRuntimeMap` 不可進入 Vue reactive 系統。**
>
> agentPool 可能有數千位 Agent，但每局只應對 current active agents 執行 decision / settlement。3000 個 Agent 若以 `ref()` / `reactive()` 儲存，每局更新都會觸發 Vue 的深層 diff，嚴重影響 UI 效能。
>
> 建議使用 `markRaw()` 包裝，或存放在 store 外的 module-level 變數（例如 `AgentTrafficEngine.js` 的模組作用域），只把 summary 數字（如 `trafficCurrentDay`、`trafficDaySummaries` 等）放入 reactive state。
>
> 實作者可依實際情況選擇最合適的隔離方式，原則是：**Agent 狀態計算在純 JS 層跑，Vue 只 observe 結果摘要。**

新增 actions：

```text
loadAgentPool()
setSimulationMode()
setTrafficScenario()
initializeAgentTrafficDay()
planAgentTrafficDay()
simulateTrafficRound()
startTrafficSimulation()
resetTrafficSimulation()
updateTrafficSummaries()
```

---

# 10. 時間模型

## 10.1 roundsPerDay

預設：

```text
roundsPerDay = 1200
```

代表一天 1200 局。

```text
1440 分鐘 / 1200 局 = 每局 1.2 分鐘
```

## 10.2 Round 轉時間

```javascript
function getTimeOfDay(roundIndexInDay, roundsPerDay) {
  const minutesPerRound = 1440 / roundsPerDay;
  const minuteOfDay = roundIndexInDay * minutesPerRound;
  const hour = Math.floor(minuteOfDay / 60);
  const minute = Math.floor(minuteOfDay % 60);

  return {
    minuteOfDay,
    hour,
    minute,
    display: `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`
  };
}
```

---

# 11. Day Planning 與 Session 模型

新版 DNA 已提供更完整的時間欄位：

```text
Primary_Play_Hour
Wakeup_Minute
Hourly_Activity_Vector
Daily_Login_Probability
Sessions_Per_Active_Day
Micro_Session_Length
Daily_Session_Length
Break_Duration_Minutes
```

本階段的目標是把真實注單的上下線節奏轉成新遊戲的人流，而不是讓全部 Agent 同時在線。

## 11.1 名詞定義

```text
agentPool：所有載入的 DNA 玩家母體。
dayPlan：某一天每個 Agent 是否出現、何時上線、何時下線的計畫。
currentActiveAgents：當前 roundIndexInDay 落在 session 起訖範圍內的 agents。
```

## 11.2 Milestone 3：Day Planning MVP

Milestone 3 先使用最穩定且最容易驗證的欄位：

```text
Primary_Play_Hour
Wakeup_Minute
Micro_Session_Length
```

MVP 行為：

```text
每位 Agent 每天預設會出現一次。
Agent 從 Primary_Play_Hour + Wakeup_Minute 對應的 round 開始上線。
連續玩 Micro_Session_Length 局。
然後離線。
```

MVP 的輸出不應該直接是 active agents，而應該是 dayPlan，例如：

```javascript
const plannedSession = {
  agentId: agentDNA.Account,
  persona: agentDNA.Player_Persona,
  startRound,
  endRound: startRound + agentDNA.Micro_Session_Length,
  plannedRounds: agentDNA.Micro_Session_Length
};
```

## 11.3 Milestone 4：Active Agents Runtime

Milestone 4 根據 dayPlan 判斷每一局的 current active agents。

```text
若 roundIndexInDay >= session.startRound
且 roundIndexInDay < session.endRound
且 agent 尚未因停損 / 停利 / session end 離線
則該 agent 本局 active。
```

每局只對 current active agents 產生下注決策與結算。

## 11.4 Milestone 4.5：時間分布升級（可選）

若 MVP 完成且使用者要求升級，才加入新版 DNA 的時間分佈：

```text
1. 每天先用 Daily_Login_Probability 判斷 Agent 今天是否出現。
2. 若出現，使用 Hourly_Activity_Vector 抽樣第一段 session 的起始 hour。
3. 再用 Wakeup_Minute 作為該小時內的 minute jitter。
4. 使用 Micro_Session_Length 決定該段 session 長度。
```

這樣可避免所有 Agent 都集中在 `Primary_Play_Hour` 的同一個尖峰。

## 11.5 多段 Session 第二版

第二版使用：

```text
Sessions_Per_Active_Day
Daily_Session_Length
Break_Duration_Minutes
```

實作：

```text
一天可有多段 micro session。
每段玩 Micro_Session_Length 局。
段與段之間休息 Break_Duration_Minutes。
直到累積局數接近 Daily_Session_Length，或達到 Sessions_Per_Active_Day。
```

## 11.6 公共賽果一致性補充

不論賽果來源是理論隨機還是物理 CSV，該局產生的所有內容（球位、免費閃電、購買閃電結果、Bonus 答案）在該局內必須是**唯一且全場 Agent 共用**。

若物理資料（如 CSV）缺失部分資訊（例如只有球位沒有閃電），系統自動補生的閃電結果也必須全場共用。

---

# 12. Agent Runtime State

```javascript
function createAgentRuntime(agentDNA, dayIndex, roundsPerDay) {
  const startRound = getAgentStartRound(agentDNA, roundsPerDay);

  return {
    agentId: agentDNA.Account,
    persona: agentDNA.Player_Persona,
    personaNameZH: agentDNA.Persona_Name_ZH,
    personaNameEN: agentDNA.Persona_Name_EN,
    personaDescription: agentDNA.Persona_Description,
    dna: agentDNA,

    dayIndex,
    startRound,
    plannedEndRound: startRound + agentDNA.Micro_Session_Length,
    plannedSessionsToday: 1,

    isActive: false,
    sessionPnL: 0,
    lifetimePnL: 0,

    currentBetAmount: agentDNA.Avg_Bet_Amount,
    lastRoundNetProfit: 0,

    lossStreak: 0,
    winStreak: 0,
    roundsPlayedInSession: 0,

    totalRounds: 0,
    totalBet: 0,
    totalCost: 0,
    totalWin: 0,
    totalGGR: 0,

    buyLightningCount: 0,
    bonusTriggerCount: 0,
    bonusSuccessCount: 0,
    cashoutCount: 0,
    riskContinueCount: 0,
    jpWinCount: 0,

    actualTargetGridSum: 0,
    actualBonusTargetLevelSum: 0,
    actualChipCountSum: 0,
    chipPriorSource: agentDNA.Chip_DNA_Source || 'unknown'
  };
}
```
# 13. Active Agent 判斷

MVP 先用 Primary_Play_Hour + Wakeup_Minute 產生 session start round。

```javascript
function getAgentStartRound(agentDNA, roundsPerDay) {
  const startMinute = agentDNA.Primary_Play_Hour * 60 + agentDNA.Wakeup_Minute;
  const minutesPerRound = 1440 / roundsPerDay;
  return Math.round(startMinute / minutesPerRound);
}
```

Day planning 階段應先產生 planned sessions：

```javascript
function createAgentPlannedSession(agentDNA, roundsPerDay) {
  const startRound = getAgentStartRound(agentDNA, roundsPerDay);
  const plannedRounds = Math.max(1, Number(agentDNA.Micro_Session_Length) || 1);

  return {
    agentId: agentDNA.Account,
    startRound,
    endRound: startRound + plannedRounds,
    plannedRounds
  };
}
```

Active 判斷只讀取 planned session，不要讓 inactive agents 產生下注決策。

```javascript
function isAgentActiveAtRound(agentState, roundIndexInDay) {
  const session = agentState.currentPlannedSession;
  if (!session) return false;
  if (roundIndexInDay < session.startRound) return false;
  if (roundIndexInDay >= session.endRound) return false;
  if (shouldEndSession(agentState)) return false;
  return true;
}
```

```javascript
function getActiveAgentsForRound(agentRuntimeMap, roundIndexInDay) {
  const activeAgents = [];

  for (const agentState of agentRuntimeMap.values()) {
    if (isAgentActiveAtRound(agentState, roundIndexInDay)) {
      agentState.isActive = true;
      activeAgents.push(agentState);
    } else {
      agentState.isActive = false;
    }
  }

  return activeAgents;
}
```

效能提醒：

```text
MVP 可以每局掃過 agentRuntimeMap 判斷 active。
若 agentPool 變大或 UI 卡頓，後續可改成 session index / round bucket，讓每局只查詢該時間段附近的 agents。
但無論採用哪種資料結構，每局都只能讓 current active agents 下注。
```

---

# 14. 停損停利 MVP

```javascript
function shouldEndSession(agentState) {
  const avgBet = Number(agentState.dna.Avg_Bet_Amount) || 1;
  const stopLoss = -Math.abs((Number(agentState.dna.Session_Stop_Loss_Multi) || 5) * avgBet);
  const takeProfit = (Number(agentState.dna.Session_Take_Profit_Multi) || 5) * avgBet;

  if (agentState.sessionPnL <= stopLoss) return true;
  if (agentState.sessionPnL >= takeProfit) return true;
  if (agentState.roundsPlayedInSession >= agentState.dna.Micro_Session_Length) return true;

  return false;
}
```

## 14.1 離線判斷時機

Agent 在每一局結算後進行 `shouldEndSession` 判斷。若符合條件，該 Agent **下一局起**不再進入 `activeAgents` 名單。當局的所有行為與派彩仍需完整執行。
# 15. Agent 下注決策

## 15.1 押幾格

```javascript
function decideTargetGridCount(agentState, scenario) {
  let count = Number(agentState.dna.LiveMines_Target_Grids) || 1;

  if (scenario.gridBehavior === 'conservative') count *= 0.8;
  if (scenario.gridBehavior === 'aggressive') count *= 1.15;

  return Math.max(1, Math.min(9, Math.round(count)));
}
```

## 15.2 押哪些格

優先使用 V3 既有 weighted sample function。若沒有可 import，再新增同等功能。

```javascript
function decideBetGrids(agentState, targetCount, sampleWeightedWithoutReplacement) {
  const gridIds = [1,2,3,4,5,6,7,8,9];
  const weights = agentState.dna.Grid_Preferences;
  return sampleWeightedWithoutReplacement(gridIds, weights, targetCount);
}
```

## 15.3 本局總下注額

本局總下注額仍由 DNA 的金額習慣決定，面額合法化放在 15.4 / 15.4.1。

```javascript
function decideTotalBetAmount(agentState, scenario) {
  let amount = agentState.currentBetAmount || agentState.dna.Avg_Bet_Amount;

  if (agentState.lastRoundNetProfit < 0) {
    amount *= agentState.dna.Martingale_Multiplier;
  }

  if (agentState.lastRoundNetProfit > agentState.dna.Avg_Bet_Amount * 2) {
    amount *= agentState.dna.Win_Retrench_Ratio;
  }

  amount *= scenario.betAmountMultiplier || 1;

  const maxBet = scenario.maxAgentBetAmount || Infinity;
  return Math.max(1, Math.min(amount, maxBet));
}
```

## 15.4 單格下注分配

```javascript
function distributeBetAmountRaw(agentState, selectedGrids, totalBetAmount) {
  const result = {};
  if (selectedGrids.length === 0) return result;

  if (agentState.dna.Bet_Distribution_Type === 'anchor' && selectedGrids.length > 1) {
    const anchorGrid = selectedGrids[0];
    const anchorAmount = totalBetAmount * agentState.dna.Anchor_Bet_Ratio;
    const restAmount = totalBetAmount - anchorAmount;
    const eachRest = restAmount / (selectedGrids.length - 1);

    selectedGrids.forEach(grid => {
      result[grid] = grid === anchorGrid ? anchorAmount : eachRest;
    });
  } else {
    const each = totalBetAmount / selectedGrids.length;
    selectedGrids.forEach(grid => {
      result[grid] = each;
    });
  }

  return result;
}
```

## 15.4.1 面額合法化：Simulation 負責，不視為 observed DNA

新遊戲可用面額固定為：

```text
[1, 5, 10, 50, 100, 500, 1000]
```

舊注單只有 `Bet Amount`，沒有真實籌碼點擊序列。因此以下欄位只作為 prior：

```text
Bet_Denomination_Mode
Preferred_Chip_Count
Chip_Denomination_Weights
Chip_DNA_Source
```

模擬器必須把每格 raw amount 轉成合法面額組合，再回寫實際下注額。由於面額包含 1，理論上可以精準湊出任意正整數；若 raw amount 有小數，先 round 到整數。

```javascript
const DEFAULT_DENOMS = [1, 5, 10, 50, 100, 500, 1000];

function resolveChipCombo(rawAmount, agentDNA, scenario) {
  const denominations = agentDNA.Available_Bet_Denominations || DEFAULT_DENOMS;
  const amount = Math.max(1, Math.round(Number(rawAmount) || 1));
  const mode = agentDNA.Bet_Denomination_Mode || agentDNA.Prior_Bet_Denomination_Mode || 'balanced';

  // MVP: use greedy exact combo. Later versions may use mode / weights to vary chip count.
  const sorted = [...denominations].sort((a, b) => b - a);
  let remain = amount;
  const chips = [];

  for (const d of sorted) {
    while (remain >= d) {
      chips.push(d);
      remain -= d;
    }
  }

  return {
    requestedAmount: rawAmount,
    finalAmount: chips.reduce((s, x) => s + x, 0),
    chips,
    mode,
    chipDnaSource: agentDNA.Chip_DNA_Source || 'synthetic_prior_from_amount_only'
  };
}

function legalizeBetMapWithChips(rawBetMap, agentDNA, scenario) {
  const betMap = {};
  const chipMap = {};

  for (const [grid, rawAmount] of Object.entries(rawBetMap)) {
    const resolved = resolveChipCombo(rawAmount, agentDNA, scenario);
    betMap[grid] = resolved.finalAmount;
    chipMap[grid] = resolved.chips;
  }

  return { betMap, chipMap };
}
```

## 15.5 是否購買閃電

`Buy_Lightning_Prob` 對應舊遊戲 EXBET → 新遊戲 Lightning 的加購偏好。它不是 Cashout。

```javascript
function decideBuyLightning(agentState, scenario, appConfig) {
  const baseProb = Number(agentState.dna.Buy_Lightning_Prob) || 0;

  const oldCost = scenario.baseExtraCost ?? 0.5;
  const newCost = appConfig?.mainGame?.extraPurchaseCostPercent ?? scenario.extraCostPercent ?? 0.5;
  const sensitivity = scenario.lightningPriceSensitivity ?? 0;

  const discountRatio = oldCost > 0 ? Math.max(0, (oldCost - newCost) / oldCost) : 0;
  const adjustedProb = baseProb * (1 + sensitivity * discountRatio);

  return Math.random() < Math.max(0, Math.min(1, adjustedProb));
}
```

## 15.6 Cashout / Bonus 目標層數

新版 DNA 已提供：

```text
Cashout_Propensity: 0.1 ~ 0.9
Cashout_Stop_Level: 1 ~ 5
```

`Cashout_Stop_Level` 是 Agent 預期最多挑戰到第幾關，必須 clamp 到 1~5。

```javascript
function decideBonusTargetLevel(agentState, scenario) {
  let target = Number(agentState.dna.Cashout_Stop_Level) || 3;
  let cashoutPropensity = Number(agentState.dna.Cashout_Propensity) || 0.5;

  if (scenario.cashoutBehavior === 'conservative') {
    target -= 1;
    cashoutPropensity = Math.min(1, cashoutPropensity * 1.2);
  }

  if (scenario.cashoutBehavior === 'aggressive') {
    target += 1;
    cashoutPropensity = Math.max(0, cashoutPropensity * 0.8);
  }

  // Backward compatibility: bonusRisk can still nudge risk-taking.
  if (scenario.bonusRisk === 'conservative') target -= 1;
  if (scenario.bonusRisk === 'aggressive') target += 1;

  return Math.max(1, Math.min(5, Math.round(target)));
}
```

## 15.7 Bonus 選牌

MVP 沒有 Bonus 牌位偏好資料，所以每層均等隨機選牌。

```javascript
function decideBonusCardPick(agentState, level, availableCards, scenario) {
  if (!availableCards || availableCards.length === 0) return null;
  const idx = Math.floor(Math.random() * availableCards.length);
  return availableCards[idx];
}
```

**重要：Bonus 選牌是 Per-Agent，Bonus 答案是 Public。**

```text
bonusWinningCardsByLevel（每層哪些牌是勝利牌）→ public，全場一組，每局只產生一次
每個 Agent 的選牌 → per-agent，各自獨立呼叫 decideBonusCardPick()
每個 Agent 的通關結果 → per-agent，用自己的選牌對比 public 答案
```

結算時不可用同一個 bonusPositions 陣列套用到所有 Agent。每個 Agent 必須有自己的選牌序列。
# 16. Agent Decision Object

```javascript
function buildAgentRoundDecision(agentState, scenario, appConfig, sampleWeightedWithoutReplacement) {
  const targetCount = decideTargetGridCount(agentState, scenario);
  const selectedGrids = decideBetGrids(agentState, targetCount, sampleWeightedWithoutReplacement);
  const totalBetAmountRaw = decideTotalBetAmount(agentState, scenario);
  const rawBetMap = distributeBetAmountRaw(agentState, selectedGrids, totalBetAmountRaw);
  const { betMap, chipMap } = legalizeBetMapWithChips(rawBetMap, agentState.dna, scenario);
  const totalBetAmount = Object.values(betMap).reduce((sum, x) => sum + x, 0);
  const buyLightning = decideBuyLightning(agentState, scenario, appConfig);
  const bonusTargetLevel = decideBonusTargetLevel(agentState, scenario);

  return {
    agentId: agentState.agentId,
    persona: agentState.persona,
    selectedGrids,
    rawBetMap,
    betMap,
    chipMap,
    totalBetAmountRaw,
    totalBetAmount,
    buyLightning,
    bonusTargetLevel,
    cashoutPropensity: agentState.dna.Cashout_Propensity,
    chipDnaSource: agentState.dna.Chip_DNA_Source
  };
}
```
# 17. 結算策略

AI Agent 應盡量重用 V3 現有 `SimulationEngine` 的結算邏輯。

不要重新寫一套 LiveMines 派彩。

理想拆法：

```text
generatePublicRoundResultFromExistingV3Logic()
settleAgentAgainstPublicResultUsingExistingV3Logic()
```

若 V3 目前尚未拆成 public result + settlement，請用最小改動方式抽出，不要改變結果。

## 17.1 結算時的核心差異點

多人同場與單人模式的結算邏輯相同，只有以下輸入方式不同：

| 項目 | 原 V3 單人模式 | Agent 人流模式 |
|---|---|---|
| 下注格位 | UI `grids[]` | 各 Agent 的 `betMap` |
| 購買閃電 | UI boolean | 各 Agent 的 `buyLightning`，但套用同一 public purchased lightning |
| Bonus 選牌 | UI `bonusPositions[]` | 各 Agent 各自的 `decideBonusCardPick()` 結果 |
| JP 結算 | 單人全拿或不拿 | 多候選人份額預分配，未通關保留（詳見 Section 19）|

派彩倍率、Bonus payout 表、JP 累積率等所有數值，一律沿用 V3 `appConfig`，不另設。

---

# 18. Settlement Object

每位 Agent 每局產生 settlement：

```javascript
const settlement = {
  agentId: 'BOT_Cluster0_0001',
  persona: 'Adaptive_Martingaler',

  selectedGrids: [1, 5, 7],
  rawBetMap: { 1: 100.2, 5: 250.4, 7: 149.4 },
  betMap: { 1: 100, 5: 250, 7: 149 },
  chipMap: { 1: [100], 5: [100,100,50], 7: [100,10,10,10,10,5,1,1,1,1] },
  totalBet: 499,

  buyLightning: true,
  extraLightningCost: 249.5,
  totalCost: 748.5,

  baseWin: 0,
  lightningWin: 1200,
  bonusWin: 0,
  jpWin: 0,
  totalWin: 1200,

  netProfit: 451.5,

  bonusTriggered: false,
  cashoutPropensity: 0.5142,
  bonusTargetLevel: 3,
  cashoutLevel: null,
  bonusSuccess: false,

  jpCandidateShare: 0,
  jpFinalCleared: false,
  jpTriggered: false,
  jpWeightBetAmount: 0,

  chipDnaSource: 'synthetic_prior_from_amount_only'
};
```
# 19. JP 新規則：候選池預分配 + 未通關保留

這是 Agent 人流模式必須新增 / 修正理解的 JP 規則。

## 19.1 JP Candidates 與唯一觸發格

因為 LiveMines 每局球數固定（預設 3 顆），因此：
*   **唯一性**：同一局內只可能有一個格子出現 3 顆球，即 **JP 觸發格是唯一的**。
*   **JP_CANDIDATES**：所有押中該唯一觸發格，並因此進入二級玩法的 Agent。

## 19.2 進入二級玩法時先固定 JP 份額

在進入二級玩法時，先根據所有 candidates 在觸發格上的下注額計算份額。

```text
candidate_jp_share = JP_POOL * candidate_trigger_grid_bet / sum_all_candidate_trigger_grid_bet
```

## 19.3 只有通關五層者能領取自己的份額

```text
若 candidate 成功通關五層：領取自己的 candidate_jp_share
若 candidate 中途陣亡：自己的 candidate_jp_share 留在 JP pool
未通關者份額不會轉移給其他通關者
```

## 19.4 範例

```text
JP pool = 1,000,000
四位 candidates 的觸發格下注額：100 / 200 / 300 / 400
分母 = 1,000

A share = 100,000
B share = 200,000
C share = 300,000
D share = 400,000

若只有 B 通關五層：
B 實拿 200,000
剩餘 800,000 留在 JP pool
```

## 19.5 實作建議

```javascript
function assignJPSharesAtBonusEntry(jpPoolAmount, candidateSettlements) {
  const totalCandidateWeight = candidateSettlements.reduce((sum, s) => {
    return sum + Math.max(0, Number(s.jpWeightBetAmount) || 0);
  }, 0);

  if (jpPoolAmount <= 0 || totalCandidateWeight <= 0) {
    for (const s of candidateSettlements) s.jpCandidateShare = 0;
    return;
  }

  for (const s of candidateSettlements) {
    const weight = Math.max(0, Number(s.jpWeightBetAmount) || 0);
    s.jpCandidateShare = jpPoolAmount * (weight / totalCandidateWeight);
  }
}
```

```javascript
function settleJPAfterBonus(candidateSettlements) {
  let paidJPAmount = 0;
  let retainedJPAmount = 0;

  for (const s of candidateSettlements) {
    const share = Math.max(0, Number(s.jpCandidateShare) || 0);

    if (s.jpFinalCleared === true) {
      s.jpWin = share;
      s.totalWin += share;
      s.netProfit = s.totalWin - s.totalCost;
      s.jpTriggered = share > 0;
      paidJPAmount += share;
    } else {
      s.jpWin = 0;
      s.jpTriggered = false;
      retainedJPAmount += share;
    }
  }

  return { paidJPAmount, retainedJPAmount };
}
```

---

# 20. Round Summary

```javascript
const roundSummary = {
  dayIndex: 1,
  roundIndexGlobal: 1075,
  roundIndexInDay: 1075,
  timeOfDay: '21:30',

  activeAgentCount: 43,
  totalBet: 18500,
  totalCost: 22400,
  totalWin: 16320,
  ggr: 6080,
  rtp: 72.86,

  buyLightningCount: 17,
  buyLightningRate: 17 / 43,
  avgTargetGrids: 4.2,
  avgCashoutStopLevel: 3.1,
  avgCashoutPropensity: 0.52,

  bonusTriggerCount: 2,
  bonusSuccessCount: 1,
  cashoutCount: 1,
  riskContinueCount: 1,
  jpCandidateCount: 4,
  jpFinalWinnerCount: 1,
  jpPaidAmount: 200000,
  jpRetainedAmount: 800000,

  avgChipCountPerBetGrid: 1.8,
  chipPriorSourceCounts: {
    synthetic_prior_from_amount_only: 43
  },

  balls: [5, 5, 5],
  agentResults: []
};
```

History 顯示範例：

```text
#1075 | Day 1 | 21:30 | 下注人數 43 | 總投注 18,500 | 總派彩 16,320 | GGR +6,080 | Lightning 17 | Cashout均值 3.1 | JP候選 4 | JP得獎 1
```
# 21. Day Summary

每 `roundsPerDay` 局彙總一天。

```javascript
const daySummary = {
  dayIndex: 1,
  roundsPerDay: 1200,

  uniqueActiveAgents: 0,
  totalBetEvents: 0,
  avgActiveAgentsPerRound: 0,
  peakActiveAgents: 0,

  totalBet: 0,
  totalCost: 0,
  totalWin: 0,
  ggr: 0,
  rtp: 0,

  buyLightningCount: 0,
  buyLightningRate: 0,

  avgCashoutStopLevel: 0,
  avgCashoutPropensity: 0,
  cashoutCount: 0,
  riskContinueCount: 0,

  bonusTriggerCount: 0,
  bonusSuccessCount: 0,

  jpCandidateCount: 0,
  jpFinalWinnerCount: 0,
  jpPaidAmount: 0,
  jpRetainedAmount: 0,

  avgChipCountPerBetGrid: 0
};
```
# 22. Persona Summary

依 `Player_Persona` 聚合。名稱顯示可使用 `Persona_Name_ZH / Persona_Name_EN`，但 key 必須使用原始 `Player_Persona`。

```javascript
const personaStats = {
  'Adaptive_Martingaler': {
    personaNameZH: '靈活凹單型',
    personaNameEN: 'AdaptiveMartingaler',
    agentCount: 0,
    activeAgentCount: 0,
    totalRounds: 0,
    totalBet: 0,
    totalCost: 0,
    totalWin: 0,
    ggr: 0,
    rtp: 0,
    buyLightningCount: 0,
    buyLightningRate: 0,
    avgTargetGrids: 0,
    avgCashoutStopLevel: 0,
    avgCashoutPropensity: 0,
    bonusTriggerCount: 0,
    bonusSuccessCount: 0,
    jpCandidateCount: 0,
    jpFinalWinnerCount: 0,
    jpPaidAmount: 0,
    avgChipCountPerBetGrid: 0
  }
};
```
# 23. Scenario Controller

新增 scenario，但只影響 Agent 行為，不影響 V3 既有遊戲規則。

```javascript
const DEFAULT_TRAFFIC_SCENARIO = {
  name: 'Base Scenario',
  roundsPerDay: 1200,
  daysToSimulate: 1,

  extraCostPercent: 0.5,
  baseExtraCost: 0.5,

  lightningPriceSensitivity: 0,
  gridBehavior: 'base',
  cashoutBehavior: 'base', // conservative | base | aggressive
  bonusRisk: 'base',       // backward-compatible alias, only nudges target level
  betAmountMultiplier: 1.0,
  maxAgentBetAmount: 100000,

  chipModeOverride: null,  // null | exact_combo | single_chip | high_denom | low_denom | balanced
  maxChipCountPerGrid: 50
};
```

注意：

```text
extraCostPercent 若 V3 config 已有，應以 V3 config 為準。
Scenario 中的 extraCostPercent 只在 UI 情境比較時修改 config 或覆蓋 appConfig，不得另寫一套成本公式。
chipModeOverride 僅影響下注金額如何轉成合法面額組合，不得改變遊戲派彩規則。
```
# 24. UI 修改

## 24.1 LeftSidebar

新增 Agent 人流控制區：

```text
🧬 Agent 人流模式
[ ] 啟用 Agent 人流模式

一天局數 roundsPerDay
模擬天數
載入 Agent JSON
Agent Pool 數量
Day Active Agents 數量
Current Active Agents 數量
Persona 分佈

押格行為：保守 / 基準 / 積極
購買閃電價格反應：固定 / 輕微 / 中度 / 強烈
Cashout 行為：保守 / 基準 / 積極
面額組合模式：使用 DNA prior / 精準湊數 / 單一籌碼 / 大面額 / 小面額
```

## 24.2 RightSidebar

新增人流摘要卡：

```text
當前 Day
當前時間
Agent Pool 數量
今日預計出現人數
本局 Current Active Agents / 下注人數
今日下注人次
平均每局 active 人數
總投注
總派彩
GGR
RTP
購買閃電率
平均 Cashout Stop Level
Bonus 觸發
JP 候選
JP 得獎
JP 已派發
JP 保留
平均每格籌碼數
```

## 24.3 HistoryModal

支援兩種歷史紀錄：

```text
manual mode：原本單局紀錄
agent traffic mode：round summary + agent detail
```

## 24.4 效能最佳化：非響應式明細

為了避免 3000 個 Agent 的狀態導致 UI 卡頓，實作需遵守：
1. `trafficHistory` 列表只存放「Round Summary」等統計數據。
2. Agent 下注與結算的「每局明細」存放在非 Vue 追蹤的純 JS 變數中。
3. 當使用者在 History 點擊某一局時，才根據該局 ID 從非響應式資料中讀取 Agent 名單並顯示在 Modal 內。

Agent traffic detail 顯示：

```text
Public Result
Agent ID
Persona
押格
下注額
每格籌碼組合 chipMap
是否購買閃電
Cashout Propensity
Cashout Stop Level
Bonus 目標層
Bonus 結果
JP candidate share
JP final cleared
JP win
總派彩
淨利
Chip DNA Source
```

## 24.5 欄位可信度提示

當 `Chip_DNA_Source = synthetic_prior_from_amount_only` 時，UI 應顯示提示：

```text
面額組合為模擬先驗，非真實籌碼點擊紀錄。
```
# 25. DNA vs Actual 驗證面板（Optional / Future Milestone）

本章是未來可選功能，不屬於 Milestone 1~10 的預設交付範圍。

AI Agent 不要主動實作此驗證面板，除非使用者明確指定：

```text
請實作 Milestone 11：DNA vs Actual 驗證面板
```

此面板的用途是輔助使用者手動判斷 Agent 行為是否大致符合 DNA，而不是要求 AI Agent 自動證明每個 Milestone 都正確。

可顯示項目：

```text
平均押格數：DNA vs Actual
購買閃電率：DNA vs Actual
平均下注額：DNA vs Actual
Cashout Stop Level：DNA vs Actual
Cashout Propensity：DNA vs Actual
Persona 分佈：DNA vs Actual
Hourly Activity：DNA vs Actual active distribution
Daily Login Probability：DNA vs Actual active day ratio
停損觸發次數
停利觸發次數
Martingale 觸發後平均加注倍率
Win Retrench 觸發後平均縮注倍率
面額組合模式分佈
平均每格籌碼數
Chip DNA Source 分佈
```

注意：chip 欄位若來源為 `synthetic_prior_from_amount_only`，驗證面板只能顯示「模擬器是否按照 prior 執行」，不能寫成「是否符合真實玩家籌碼行為」。

# 26. 匯出功能（Optional / Future Milestone）

本章是未來可選功能，不屬於前段 Milestone 的預設交付範圍。

AI Agent 不要主動實作 CSV / JSONL 匯出，除非使用者明確指定：

```text
請實作 Milestone 12：匯出功能
```

可選匯出項目：

```text
Round Summary CSV
Day Summary CSV
Persona Summary CSV
Agent Summary CSV
Agent Detail JSONL（可選，非 Vue reactive，供 debug）
DNA vs Actual Validation CSV（只有 Milestone 11 完成後才需要）
```

匯出欄位可包含：

```text
buyLightningRate
avgCashoutStopLevel
avgCashoutPropensity
avgChipCountPerBetGrid
chipPriorSourceCounts
```

# 27. MVP 實作順序（AI Agent 只做指定 Milestone）

## 27.0 Milestone 執行規則

AI Agent 每次只做使用者指定的 Milestone。完成後停止，不要自動進入下一個 Milestone。

完成回報格式：

```text
完成項目
修改檔案
已知限制 / 風險
建議使用者手動 QA 的項目
```

不要因看到後續 Milestone 就提前實作。

## Milestone 1：保護 V3 原功能 / Agent Mode 開關

- 先保留 V3 原有模式。
- 新增 Agent Mode 開關。
- Agent Mode 關閉時不得影響任何原功能。
- 不實作人流、不實作下注、不實作 settlement。

## Milestone 2：AgentDataLoader 基礎版（目前已做到）

- 載入 Agent JSON。
- normalize 基礎欄位。
- parse `Grid_Preferences`。
- 顯示 agent count / persona count。

## Milestone 2.5：新版 DNA Parser 補強（目前已做到）

- 支援新版 frontend spec 欄位。
- parse `Hourly_Activity_Vector`。
- parse `Grid_Preferences`。
- parse `Chip_Denomination_Weights`。
- clamp `Cashout_Stop_Level` 到 `1~5`。
- 保留 `Buy_Lightning_Prob` 與 `Cashout_Propensity`，不得混用。
- 保留 `Chip_DNA_Source`。
- **[新增] 捨棄靜態 `PERSONA_METADATA`，改由載入之 DNA 動態計算 Persona 行為特徵 (AvgBet, Martingale, Retrench, SessionLen, StopLoss, TakeProfit) 並顯示於 UI Tooltip。**

## Milestone 3：Day Planning MVP（目前已做到）

目標：把 agentPool 轉成某一天的 planned sessions。

- `roundsPerDay = 1200`。
- roundIndex 轉時間。
- 先用 `Primary_Play_Hour + Wakeup_Minute + Micro_Session_Length`。
- 每位 Agent 產生一段 planned session。
- 只建立 dayPlan，不做下注、不做 settlement。
- UI 顯示：agentPool count、planned day active count、預估尖峰 active count。

## Milestone 4：Active Agents Runtime MVP（目前已做到）

目標：根據 dayPlan，在每一局找出 current active agents。

- 讀取 Milestone 3 的 planned sessions。
- 每局計算 current active agents。
- inactive agents 不下注、不結算。
- UI 顯示當前時間與本局 active agent count。
- 不做 Agent decision、不做 settlement。

## Milestone 4.5：時間分布升級（可選）

只有使用者要求時才做。

- 用 `Daily_Login_Probability` 決定今天是否出現。
- 用 `Hourly_Activity_Vector` 抽樣 session 起始 hour。
- 用 `Sessions_Per_Active_Day / Daily_Session_Length / Break_Duration_Minutes` 支援多段 session。
- 不影響已完成的 MVP dayPlan 介面。

## Milestone 5：Agent Decision - 格子與 raw bet

- 只對 current active agents 產生 decision。
- 押幾格。
- 押哪些格。
- raw total bet amount。
- raw betMap。
- 不做面額合法化。
- 不做 Lightning / Cashout。
- 不做 settlement。

## Milestone 6：Agent Decision - Lightning / Cashout / Chip Legalize

- `Buy_Lightning_Prob` 決定是否購買 Lightning。
- `Cashout_Propensity` / `Cashout_Stop_Level` 決定二級玩法 Cashout 策略。
- `Cashout_Stop_Level` 必須限制在 `1~5`。
- raw betMap 轉成合法面額組合 `[1,5,10,50,100,500,1000]`。
- 產生 `chipMap`。
- 保留 `Chip_DNA_Source`，標示 chip 行為為 prior / synthetic。
- 不做 settlement。

## Milestone 7：Public Result 共用

- 使用 V3 既有邏輯取得同一局 public result。
- 多個 current active agents 共用該 public result。
- 不為每位 Agent 重抽球、閃電或 Bonus 答案。
- 可先只確認 public result 被正確傳入 Agent Traffic Layer。

## Milestone 8：多人 Settlement + Round Summary

- 每個 current active agent 對同一 public result 結算。
- 聚合 Round Summary。
- 產生本局 totalBet / totalCost / totalWin / ggr / rtp。
- 更新 agent runtime PnL、lossStreak、winStreak。
- 本 Milestone 可先不做 JP candidate share，除非 V3 settlement 已自然支援。

## Milestone 9：JP Candidate Share

- 進入 Bonus 時先分配 JP candidate share。
- 通關五層才領取自己的 share。
- 未通關 share 保留在 JP pool。
- 不改寫 V3 既有非 Agent 模式 JP 規則。

## Milestone 10：History / Day / Persona UI

- 人流 Round History。
- Day Summary。
- Persona Summary。
- 顯示 agentPool count、day active count、current active count。
- Agent detail 使用非響應式資料，點開某局才讀取。

## Milestone 11：DNA vs Actual 驗證面板（可選）

只有使用者明確要求時才做。

- 平均押格數：DNA vs Actual。
- 購買閃電率：DNA vs Actual。
- 平均下注額：DNA vs Actual。
- Cashout stop level：DNA vs Actual。
- Persona 分佈：DNA vs Actual。
- 不作為前面 Milestone 的自動驗證條件。

## Milestone 12：Export（可選）

只有使用者明確要求時才做。

- Round Summary CSV。
- Day Summary CSV。
- Persona Summary CSV。
- Agent Summary CSV。

---

# 28. Manual QA Checklist（使用者手動驗證）

以下是使用者手動驗證清單。AI Agent 不要自動建立測試框架，也不要把本清單當成必須自動跑完的 validation。

## QA 1：Agent Mode 關閉時完全不影響 V3

Given Agent Mode = false  
When 執行原本單局與批次  
Then 結果與修改前一致

## QA 2：新版 DNA Parser

Given frontend spec JSON  
Then `Grid_Preferences` / `Hourly_Activity_Vector` / `Chip_Denomination_Weights` 都被 parse 成 number array  
And `Cashout_Stop_Level` 被限制在 `1~5`  
And `Buy_Lightning_Prob` 與 `Cashout_Propensity` 同時存在且沒有互相覆蓋

## QA 3：Agent Pool 不是同時在線人數

Given agentPool 有 3000 位 Agent  
When 模擬某一局  
Then 本局下注人數應等於 current active agents  
And 不應等於 3000，除非 dayPlan 剛好讓 3000 人同時 active

## QA 4：Day Planning MVP

Given Agent Primary_Play_Hour = 22, Wakeup_Minute = 11, Micro_Session_Length = 17  
When 建立 dayPlan  
Then 該 Agent 應有一段 22:11 附近開始、長度約 17 局的 planned session

## QA 5：Active Agents Runtime

Given 某 Agent 的 planned session 是 startRound = 100, endRound = 117  
When roundIndexInDay = 99  
Then 該 Agent inactive  
When roundIndexInDay = 100  
Then 該 Agent active  
When roundIndexInDay = 117  
Then 該 Agent inactive

## QA 6：時間換算

Given roundsPerDay = 1200  
When roundIndexInDay = 600  
Then timeOfDay 約 12:00

## QA 7：Agent Decision 只對 active agents 執行

Given 本局 current active agents = 43  
When 產生 Agent decisions  
Then decisions length 應為 43  
And inactive agents 不應產生 betMap

## QA 8：Public Result 共用

Given 某局有 50 current active agents  
Then 50 位 Agent 使用同一組 balls / lightning / bonus public result

## QA 9：購買閃電

Given public purchased lightning exists  
And Agent A buyLightning = true  
Then Agent A 套用 purchased lightning  
And Agent B buyLightning = false  
Then Agent B 不套用 purchased lightning

## QA 10：Buy Lightning 與 Cashout 不可混用

Given `Buy_Lightning_Prob = 0.9`  
And `Cashout_Propensity = 0.1`  
Then Lightning 決策應高機率 true  
And Cashout 傾向仍應低  
And 不得用 Cashout_Propensity 覆蓋 Buy_Lightning_Prob

## QA 11：下注面額合法化

Given raw amount = 106  
And denominations = `[1,5,10,50,100,500,1000]`  
Then chip combo 可以為 `[100,5,1]`  
And final amount = 106

## QA 12：Chip DNA Source

Given `Chip_DNA_Source = synthetic_prior_from_amount_only`  
Then UI / detail 應提示面額組合是 simulation prior，不是真實籌碼點擊紀錄

## QA 13：Cashout_Stop_Level 範圍

Given Agent DNA 的 Cashout_Stop_Level 超出範圍  
Then loader / decision 需 clamp 到 1~5

## QA 14：JP 候選份額

Given JP pool = 1,000,000  
And candidates trigger-grid bets = 100, 200, 300, 400  
Then candidate shares = 100,000 / 200,000 / 300,000 / 400,000

## QA 15：JP 未通關保留

Given 只有下注 200 的 candidate 通關五層  
Then 該 Agent jpWin = 200,000  
And jpRetainedAmount = 800,000

## QA 16：物理資料模式

Given V3 使用物理資料模式  
When Agent Mode 啟用  
Then Agent 只控制下注  
And 不重新生成物理資料已提供的 public result

---

# 29. Final Reminder for AI Agent

這不是 LiveMines 規則重寫任務。

這是 V3 的 **Phase 2 Time-Based Agent Traffic Layer** 新增任務。

請把 V3 現有程式碼視為遊戲規則真相來源。Agent 人流模式只在外層新增：真實注單時間分布、day/session planning、current active agents、Agent 下注、多玩家結算聚合與統計展示。

若不確定某個遊戲規則，請沿用 V3 既有實作，不要自行根據本計劃重寫。

執行方式再次提醒：

```text
AI Agent 只實作使用者指定的 Milestone。
完成後停止並回報。
驗證由使用者手動執行。
不要自動跑完整 validation。
不要自動建立測試框架。
不要自動進入下一個 Milestone。
若使用者追加規則，先更新 plan，再實作 code。
```


---

# 30. Phase 3 Reminder（不屬於本文件）

未來 Phase 3 可以新增 LLM Interactive Agents：

```text
少數 featured active agents 使用 LLM 產生 structured decision + decision rationale。
大多數 agents 仍使用 Phase 2 behavior engine。
LLM 不直接改寫遊戲規則，所有 LLM decision 都必須通過 engine clamp / validation。
```

但 Phase 3 不屬於本文件。AI Agent 不要在 Phase 2 Milestone 中主動實作 LLM、prompt、思考輸出或互動記憶。


---

# 31. Change Log

## v2.1
- Clarified that Agent Traffic Mode is time-based, not 3000 agents online simultaneously.
- Added Agent Pool vs Day Active Agents vs Current Active Agents distinction.

## v2.2
- Updated DNA spec to frontend spec format from `LiveMines_Agent_DNA_v2_5levels_lightning_chipprior`.
- Added `Hourly_Activity_Vector`, `Daily_Login_Probability`, `Sessions_Per_Active_Day`, persona display fields, and chip prior fields.

## v2.3
- Separated EXBET → Lightning purchase behavior from secondary-game Cashout behavior.
- Added `Buy_Lightning_Prob` alongside `Cashout_Propensity` and `Cashout_Stop_Level`.

## v2.4
- Changed `Cashout_Stop_Level` range to `1~5` to match current new-game design.

## v2.5
- Marked chip denomination behavior as simulation prior, not observed chip-click behavior.
- Added `Chip_DNA_Source = synthetic_prior_from_amount_only`.

## v2.6
- Added execution rule: AI Agent implements, user performs manual QA.
- Reframed validation cases as Manual QA Checklist, not automated tests.

## v2.7
- Added Plan Change Protocol.
- New or corrected rules must be written back into this plan before implementation.

## v2.8
- Updated Milestone 2.5: Replaced hardcoded `PERSONA_METADATA` with dynamic calculation of persona stats based on K-Means clustering traits (Martingale, Win Retrench, etc.) directly from loaded DNA JSON.

## v2.9
- Implemented Milestone 3 (Day Planning MVP). Added time mapping engine to convert `Primary_Play_Hour`, `Wakeup_Minute`, and `Micro_Session_Length` into explicit simulation start/end rounds. Added dynamic planned active user and peak active user UI displays.

## v2.10
- Implemented Milestone 4 (Active Agents Runtime MVP). Added real-time Vue Getters (`trafficTimeOfDay`, `currentActiveAgents`) to track active agents synchronizing with game round progression. Added real-time runtime status panel to RightSidebar. Fixed a UX issue preventing clock advancement in agentTraffic mode when totalCost is 0.
