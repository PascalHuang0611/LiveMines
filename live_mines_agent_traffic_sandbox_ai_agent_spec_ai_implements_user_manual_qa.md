# LiveMines V3 Agent Traffic Layer Integration Plan

> Revision: Updated after Milestone 2 to align with `LiveMines_Agent_DNA_v2_5levels_lightning_chipprior` / frontend spec DNA.
> Key changes: semantic persona fields, hourly activity vector, daily login probability, EXBET -> Lightning, Cashout 1~5, and chip denomination prior fields.
> Execution model: AI Agent implements only the requested milestone; user performs manual QA.



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

## 0. One-line Mission for AI Agent

在既有 LiveMines V3 專案上新增一個「Agent 人流模式 / Agent Traffic Layer」。

不要重寫 LiveMines 遊戲規則，不要重構掉既有 V3 的核心邏輯，不要破壞手動模式、物理資料模式、理論隨機模式、歷史紀錄與既有統計。

本任務只新增一層：

```text
時間軸 → active agents → Agent 下注決策 → 多人同場套用同一局既有賽果 → Round / Day / Persona / Agent 統計
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
2. 根據 Agent DNA 判斷哪些 Agent 在線
3. 根據 Agent DNA 產生下注決策
4. 將多個 Agent 套用到同一局既有 V3 賽果
5. 逐 Agent 結算
6. 聚合 Round / Day / Persona / Agent 統計
7. 在 UI 顯示人流模式結果
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

新增：

```text
一個切片代表一天
預設 roundsPerDay = 1200
每局換算成當天時間
根據 Agent DNA 判斷 active agents
每個 active agent 自動下注
所有 active agents 共用同一局 public result
逐 Agent 結算
聚合人流統計
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
```

> **效能原則：`agentPool` 與 `agentRuntimeMap` 不可進入 Vue reactive 系統。**
>
> 3000 個 Agent 若以 `ref()` / `reactive()` 儲存，每局更新都會觸發 Vue 的深層 diff，嚴重影響 UI 效能。
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

# 11. Session 模型 MVP

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

## 11.1 Milestone 3 MVP 行為

Milestone 3 先使用最穩定且最容易驗證的欄位：

```text
Primary_Play_Hour
Wakeup_Minute
Micro_Session_Length
```

```text
Agent 從 Primary_Play_Hour + Wakeup_Minute 對應的 round 開始上線。
連續玩 Micro_Session_Length 局。
然後離線。
```

## 11.2 Milestone 3.5 / 4 建議升級：Hourly_Activity_Vector + Daily_Login_Probability

若 Milestone 3 MVP 完成且效能可接受，建議下一步改用新版 DNA 的時間分佈：

```text
1. 每天先用 Daily_Login_Probability 判斷 Agent 今天是否出現。
2. 若出現，使用 Hourly_Activity_Vector 抽樣第一段 session 的起始 hour。
3. 再用 Wakeup_Minute 作為該小時內的 minute jitter。
4. 使用 Micro_Session_Length 決定該段 session 長度。
```

這樣可避免所有 Agent 都集中在 `Primary_Play_Hour` 的同一個尖峰。

## 11.3 多段 Session 第二版

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

## 11.4 公共賽果一致性補充

不論賽果來源是理論隨機還是物理 CSV，該局產生的所有內容（球位、免費閃電、購買閃電結果、Bonus 答案）在該局內必須是**唯一且全場 Agent 共用**。

若物理資料（如 CSV）缺失部分資訊（例如只有球位沒有閃電），系統自動補生的閃電結果也必須全場共用。
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

```javascript
function getAgentStartRound(agentDNA, roundsPerDay) {
  const startMinute = agentDNA.Primary_Play_Hour * 60 + agentDNA.Wakeup_Minute;
  const minutesPerRound = 1440 / roundsPerDay;
  return Math.round(startMinute / minutesPerRound);
}
```

```javascript
function isAgentActiveAtRound(agentState, roundIndexInDay) {
  if (roundIndexInDay < agentState.startRound) return false;
  if (roundIndexInDay >= agentState.plannedEndRound) return false;
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
    }
  }

  return activeAgents;
}
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
Agent 數量
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
本局下注人數
今日下注人次
平均每局人數
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

AI Agent 每次只執行使用者明確指定的 Milestone。

完成後停止並回報，不要自動進入下一個 Milestone，不要自動跑完整驗證，不要主動建立測試框架。

每個 Milestone 的回報格式：

```text
完成項目
修改檔案
已知限制 / 風險
建議手動檢查項目
```

## Milestone 1：保護 V3 原功能 / Agent Mode 開關

範圍：只建立 Agent Mode 的開關與模式隔離。

- 新增 Agent Mode 開關。
- Agent Mode 關閉時，不得影響手動模式、單局、批次、歷史紀錄、圖表。
- 不要實作 Agent 行為。
- 不要修改遊戲規則。

完成後停止，等待使用者手動驗證。

## Milestone 2：AgentDataLoader 基礎版（目前已做到）

範圍：載入 Agent JSON 並顯示基本資訊。

- 載入 Agent JSON。
- normalize 基本欄位。
- parse `Grid_Preferences`。
- 顯示 agent count / persona count。

完成後停止，等待使用者手動驗證。

## Milestone 2.5：新版 DNA Parser 補強

範圍：只補強新版 DNA 欄位，不做 active / decision。

- parse `Hourly_Activity_Vector`，長度 24，normalize sum ~= 1。
- parse `Available_Bet_Denominations`，預設 `[1,5,10,50,100,500,1000]`。
- parse `Chip_Denomination_Weights` / `Prior_Chip_Denomination_Weights`，長度 7，normalize sum ~= 1。
- validate `Cashout_Stop_Level` 一律 clamp 到 `1~5`。
- validate `Buy_Lightning_Prob` 與 `Cashout_Propensity` 是不同欄位，不可互相覆蓋。
- 保留 `Chip_DNA_Source`，供 UI 顯示可信度。
- 保留 persona semantic 欄位：`Persona_Name_ZH` / `Persona_Name_EN` / `Persona_Description`。

完成後停止，等待使用者手動驗證。

## Milestone 3：時間軸基礎版

範圍：建立 roundIndex <-> timeOfDay，不判斷 active agents。

- `roundsPerDay = 1200`。
- `roundIndexInDay` 轉換為 `hour/minute/display`。
- 顯示當前 Day / Round / TimeOfDay。

完成後停止，等待使用者手動驗證。

## Milestone 4：Active Agents MVP

範圍：只做最簡單可驗證的 active 判斷。

- 根據 `Primary_Play_Hour + Wakeup_Minute` 計算 startRound。
- 根據 `Micro_Session_Length` 計算 plannedEndRound。
- 產生 activeAgents count。
- 暫時不要使用 `Daily_Login_Probability` / `Hourly_Activity_Vector` 參與 active 判斷。

完成後停止，等待使用者手動驗證。

## Milestone 4.5：Active Agents 升級版（可選）

範圍：使用新版時間 DNA 讓人流更自然。

- 使用 `Daily_Login_Probability` 決定某 Agent 今日是否出現。
- 使用 `Hourly_Activity_Vector` 分散上線時段。
- 保留 fallback：若欄位缺失，回到 Milestone 4 MVP 行為。

此 Milestone 可選。若使用者未指定，AI Agent 不要主動實作。

完成後停止，等待使用者手動驗證。

## Milestone 5：Agent Decision - 格子與 raw bet

範圍：只產生 Agent 的基本下注決策，不接 V3 settlement。

- 押幾格：`LiveMines_Target_Grids`。
- 押哪些格：`Grid_Preferences` weighted sample。
- 本局總下注額：`Avg_Bet_Amount` / `Bet_Amount_Std` / scenario multiplier。
- rawBetMap：依 `Bet_Distribution_Type` / `Anchor_Bet_Ratio` 分配到每格。
- 暫時不要做 Lightning / Cashout / chip legalize。

完成後停止，等待使用者手動驗證。

## Milestone 6：Agent Decision - Lightning / Cashout / Chip Legalize

範圍：補齊新版 DNA 決策欄位。

- `buyLightning` 使用 `Buy_Lightning_Prob`。
- `cashoutPropensity` 使用 `Cashout_Propensity`。
- `bonusTargetLevel` / `cashoutStopLevel` 使用 `Cashout_Stop_Level`，範圍 `1~5`。
- 將 rawBetMap 轉成合法面額組合：`[1,5,10,50,100,500,1000]`。
- 產生 `chipMap`。
- settlement / detail 保留 `Chip_DNA_Source`。

完成後停止，等待使用者手動驗證。

## Milestone 7：Public Result 共用

範圍：只把 V3 既有 public result 取出並給多 Agent 共用。

- 使用 V3 既有邏輯取得同一局 public result。
- 多 Agent 共用同一組 balls / lightning / bonus public answer。
- 不改寫 V3 遊戲規則。
- 不做多人 settlement 聚合，除非已經是既有接口自然支援。

完成後停止，等待使用者手動驗證。

## Milestone 8：多人 Settlement + Round Summary

範圍：每個 Agent 對同一 public result 結算，並聚合單局 summary。

- 每個 Agent 對同一 public result 結算。
- settlement 保留：`rawBetMap`、`betMap`、`chipMap`、`buyLightning`、`cashoutPropensity`、`cashoutStopLevel`、`chipDnaSource`。
- 聚合 Round Summary。
- Agent 明細放非 reactive 純 JS 儲存，不塞入 Vue reactive state。

完成後停止，等待使用者手動驗證。

## Milestone 9：JP Candidate Share

範圍：只做 JP 候選份額預分配與保留規則。

- 進入 Bonus / JP candidate 時先分配 `jpCandidateShare`。
- 只有通關五層者領取自己的 share。
- 未通關 share 保留在 JP pool。
- 不把未通關者份額轉給其他通關者。

完成後停止，等待使用者手動驗證。

## Milestone 10：History / Day / Persona UI

範圍：把已經算好的 summary 顯示出來。

- 人流歷史紀錄。
- Day summary。
- Persona summary。
- 顯示 Cashout / Lightning / chip prior 指標。
- 當 `Chip_DNA_Source = synthetic_prior_from_amount_only` 時，UI 顯示「面額組合為模擬先驗」提示。

完成後停止，等待使用者手動驗證。

## Milestone 11：DNA vs Actual 驗證面板（可選）

範圍：可選，不預設執行。

- DNA vs Actual。
- chip prior source 分佈。
- Cashout 1~5 實際分佈。
- Lightning rate 實際分佈。

只有使用者明確指定此 Milestone 時才實作。

## Milestone 12：Export（可選）

範圍：可選，不預設執行。

- Round Summary CSV。
- Day Summary CSV。
- Persona Summary CSV。
- Agent Summary CSV。
- Agent Detail JSONL（可選）。

只有使用者明確指定此 Milestone 時才實作。

# 28. Manual QA Checklist（使用者手動驗證）

以下清單是給使用者手動驗證用，不是要求 AI Agent 自動執行的測試任務。

AI Agent 完成 Milestone 後，只需在回報中列出相關手動檢查項目。不要主動建立測試框架，不要自動跑完整 validation。

## QA 1：Agent Mode 關閉時完全不影響 V3

Given Agent Mode = false  
When 使用者手動執行原本單局與批次  
Then 結果應與修改前一致

## QA 2：Grid_Preferences 字串解析

Given `Grid_Preferences` 是字串 array  
Then normalize 後應為長度 9、sum ~= 1 的 number array

## QA 3：Hourly_Activity_Vector 字串解析

Given `Hourly_Activity_Vector` 是字串 array  
Then normalize 後應為長度 24、sum ~= 1 的 number array

## QA 4：Chip_Denomination_Weights 字串解析

Given `Chip_Denomination_Weights` 是字串 array  
Then normalize 後應為長度 7、sum ~= 1 的 number array  
And `Available_Bet_Denominations = [1,5,10,50,100,500,1000]`

## QA 5：Cashout_Stop_Level 範圍

Given Agent DNA `Cashout_Stop_Level = 8`  
When AgentDataLoader normalize  
Then `Cashout_Stop_Level = 5`

Given Agent DNA `Cashout_Stop_Level = 0`  
When AgentDataLoader normalize  
Then `Cashout_Stop_Level = 1`

## QA 6：時間換算

Given `roundsPerDay = 1200`  
When `roundIndexInDay = 600`  
Then `timeOfDay` 約為 `12:00`

## QA 7：Active Agent MVP

Given Agent `Primary_Play_Hour = 22`, `Wakeup_Minute = 11`, `Micro_Session_Length = 17`  
Then 該 Agent 應在 22:11 附近 active，持續約 17 局

## QA 8：Public Result 共用

Given 某局有 50 active agents  
Then 50 位 Agent 應使用同一組 balls / lightning / bonus public result

## QA 9：購買閃電

Given public purchased lightning exists  
And Agent A `buyLightning = true`  
Then Agent A 套用 purchased lightning  
And Agent B `buyLightning = false`  
Then Agent B 不套用 purchased lightning

## QA 10：Buy_Lightning 與 Cashout 不可混用

Given `Buy_Lightning_Prob = 0.1`  
And `Cashout_Propensity = 0.8`  
When buildAgentRoundDecision  
Then `buyLightning` 使用 `Buy_Lightning_Prob`  
And cashout / bonus behavior 使用 `Cashout_Stop_Level` / `Cashout_Propensity`

## QA 11：下注面額合法化

Given raw grid amount = 106  
And denominations = `[1,5,10,50,100,500,1000]`  
Then chip combo 可以為 `[100,5,1]`  
And finalAmount = 106

## QA 12：Chip DNA Source

Given `Chip_DNA_Source = synthetic_prior_from_amount_only`  
When settlement generated  
Then settlement / detail 應保留同一來源  
And UI 顯示「面額組合為模擬先驗」提示

## QA 13：JP 候選份額

Given JP pool = 1,000,000  
And candidates trigger-grid bets = 100, 200, 300, 400  
Then candidate shares = 100,000 / 200,000 / 300,000 / 400,000

## QA 14：JP 未通關保留

Given 只有下注 200 的 candidate 通關五層  
Then 該 Agent `jpWin = 200,000`  
And `jpRetainedAmount = 800,000`

## QA 15：物理資料模式

Given V3 使用物理資料模式  
When Agent Mode 啟用  
Then Agent 只控制下注  
And 不重新生成物理資料已提供的 public result

# 29. Final Reminder for AI Agent

這不是 LiveMines 規則重寫任務。

這是 V3 的 Agent Traffic Layer 新增任務。

請把 V3 現有程式碼視為遊戲規則真相來源。Agent 人流模式只在外層新增：時間、人流、Agent 下注、多玩家結算聚合與統計展示。

若不確定某個遊戲規則，請沿用 V3 既有實作，不要自行根據本計劃重寫。

執行方式再次提醒：

```text
AI Agent 只實作使用者指定的 Milestone。
完成後停止並回報。
驗證由使用者手動執行。
不要自動跑完整 validation。
不要自動建立測試框架。
不要自動進入下一個 Milestone。
```
