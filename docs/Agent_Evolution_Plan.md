# LiveMines Agent DNA Evolution Plan (進階 Agent 喚醒計畫)

## 總覽 (Overview)
目前 `AgentTraffic` 模式已經具備基礎的生命週期與平均值押注行為。為了解決「Agent 押注過於死板、如同機器人」以及「缺乏盤面互動」的問題，我們將解鎖目前 `agents.json` 中已存在但尚未啟用的高階 DNA 參數。

---

## 階段 1：資金動態管理與常態分佈隨機性 (打破死板平均值)
目前 Agent 的下注金額完全鎖死在 `Avg_Bet_Amount`，且缺乏歷史記憶。此階段將賦予 Agent 錢包概念與每次下注的手感波動，這是讓生態系活起來的最關鍵步驟。

### 1.1 常態分佈波動 (Gaussian Variance)
- **解鎖 DNA**: `Bet_Amount_Std` (下注額標準差), `Grid_Count_Std` (押注格數標準差)
- **實作細節**: 
  - 實作 Box-Muller 轉換演算法，產生常態分佈的隨機數。
  - 在決定本局基礎下注額與目標格數時，以 Average 為期望值，Std 為標準差進行隨機取樣。
  - **預期效果**：同一位 Agent 每局的下注行為會產生合理的自然浮動，不再是永遠丟出死板的固定金額。

### 1.2 個人錢包與短期記憶 (Agent Bankroll & Memory)
- **實作細節**: 
  - 當 Agent 上線 (Login) 時，賦予一個初始化的 `sessionNetProfit` (單次遊玩盈虧) 與上一局的結果記憶。
  - 每一局結算後，動態更新該 Agent 在這段時間內的實質輸贏。

### 1.3 贏縮輸衝策略 (Martingale & Retrench)
- **解鎖 DNA**: `Martingale_Multiplier` (追輸倍數), `Win_Retrench_Ratio` (贏錢縮注比例)
- **實作細節**: 
  - 在 `AgentDecisionEngine` 決定總下注額時，先取得 1.1 的「隨機基礎額」，接著根據 1.2 的「輸贏記憶」，動態乘上對應的加注/縮注倍數。

### 1.4 停損與停利離場 (Rage Quit & Take Profit)
- **解鎖 DNA**: `Session_Stop_Loss_Multi` (停損倍數), `Session_Take_Profit_Multi` (停利倍數)
- **實作細節**: 
  - 每局結算後檢查 `sessionNetProfit` 是否觸及門檻。若觸發，強制中斷其 `Micro_Session_Length` 使其提早登出 (Logout)。
  - **預期效果**：大盤的「在線人數曲線」將產生真實的非預期波動，不再完美貼合預定排程。

---

## 階段 2：群眾心理學與盤面互動 (羊群效應)
目前 Agent 的選格邏輯完全依賴個人的偏好，對上一局開出大獎的「熱門格」視而不見。此階段將導入趨勢跟風機制。

### 2.1 贏錢格子黏著度 (Win Grid Stickiness / Trend Following)
- **解鎖 DNA**: `Win_Grid_Stickiness`
- **實作細節**: 
  - 系統需記錄上一局的 `publicResult`。
  - 若上一局某格開出高倍率或觸發 Bonus，依據此 DNA 機率，部分 Agent 會被吸引，強制或提高他們押注該「熱門格」的權重。
  - **預期效果**：九宮格熱力圖將出現「資金群聚」的羊群遷徙現象。

### 2.2 籌碼面額偏好深度解析 (Chip Denomination Detail)
- **解鎖 DNA**: `Bet_Denomination_Mode` (single_chip / low_denom / exact_combo), `Preferred_Chip_Count`, `Available_Bet_Denominations`
- **實作細節**:
  - 重構 `legalizeChips` 邏輯，不僅依賴權重與行為模式，還會真正讀取每個 Agent 專屬的 `Available_Bet_Denominations` (可用籌碼面額)，限制某些小資族絕對拿不出大籌碼。
  - **預期效果**：偏好 `low_denom` 的 Agent 會把 500 元換成一堆 10 元籌碼灑出，增加 UI 籌碼牆的視覺豐富度。

---

## 階段 3：大盤情境控制與數據閉環 (PM 神之手)
給予 PM 更強大的巨觀控制力，並為 LLM 調校做準備。

### 3.1 大盤情境切換面板 (Traffic Scenarios UI)
- **解鎖機制**: `gameStore.trafficScenario` (包含 gridBehavior, bonusRisk, betAmountMultiplier)
- **實作細節**: 
  - 在左側邊欄新增「大盤情境」下拉選單 (例如: 平日保守期、假日派對期、過年促銷大撒幣)。一鍵對全服 Agent 套用 Buff/Nerf。

### 3.2 數據閉環匯出 (Data Export Pipeline)
- **實作細節**: 
  - 新增一鍵匯出按鈕，將模擬結束後的 `trafficHistory` (每局大盤走向) 與 Agent 盈虧排行榜匯出為 `.csv` 或 `.json`。
  - 讓您可以將報告直接交給 ChatGPT / Claude 進行數學期望值與賠率分析。
