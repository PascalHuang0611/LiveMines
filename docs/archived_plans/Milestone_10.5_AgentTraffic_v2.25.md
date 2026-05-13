# Milestone 10.5: Agent Traffic 觀測擴充與除錯 (v2.25)

## 1. 每小時流量與押注趨勢圖 (Hourly Trend Charts)
為了解決沙盒模式下無法直觀感受大盤時間變化的問題，已於主控台底部加入兩個近 24 小時的動態走勢圖。

#### [MODIFY] `GameBoard.vue`
- 新增了 **每小時總押注額走勢圖** (`#hourlyBetChart`)。
- 新增了 **每小時登入人數走勢圖** (`#hourlyUserChart`)。
- 圖表僅在 `simulationMode === 'agentTraffic'` 時顯示。

#### [MODIFY] `gameStore.js`
- 實作了 `hourlyStats` 狀態來儲存近 24 個小時的統計切片 (每個切片包含 `totalBet` 以及一個存放獨立玩家帳號的 `Set`)。
- 於 `simulateSingleRound` 的執行迴圈內，依據 `trafficScenario.roundsPerDay` 換算目前虛擬時間，自動將當局成本與參與人數歸戶至對應的小時切片中。
- 初始化與更新邏輯 (`initHourlyCharts`, `updateHourlyCharts`) 緊密綁定 Vue 渲染週期。

## 2. 系統狀態連動 (Clear Data)
確保 PM 在切換場景或重新測試時不會被舊數據干擾。

#### [MODIFY] `gameStore.js`
- 修正 `clearData()` 方法，確保點擊清除紀錄時，`hourlyStats` 也會被清空，並且圖表會重新繪製成空白狀態。

## 3. PM 介面除錯 (UI Debugging)
修復了顯示上與邏輯上的幾處錯誤，讓顯示數據與沙盒行為完全契合。

#### [MODIFY] `AgentInfoModal.vue` & `ActiveAgentsModal.vue`
- **問題**：原先因為寫錯 JSON 鍵名（誤植為 `Base_bet_Amount`），導致所有 Agent 點開的注碼都顯示成預設的 10 元。
- **修正**：已將其全部修正為正確的 `Avg_Bet_Amount`，現在可以正確觀測每個 Agent 的真實注單金額了。

#### [MODIFY] `RightSidebar.vue` & `gameStore.js` (歷史紀錄篩選機制)
- **問題**：在單人手動模式下，「有贏分」是以 `totalWin > 0` 判定。但在 Agent 模式中，全場總獎金幾乎不可能為 0，導致這個過濾器形同虛設。
- **修正**：在 `filteredHistory` 中動態判斷，若是人流模式，改為透過 `netProfit > 0` (即玩家總淨利大於 0、莊家賠錢) 進行篩選。
- **UI 調整**：將側邊欄的篩選按鈕文字，在人流模式下動態改為 **「玩家有淨利」**，以符合直覺。

## 4. 歷史紀錄效能與觀測強化 (History Panel Enhancements)
針對長時間模擬的極端需求進行介面與底層擴充。

#### [MODIFY] `gameStore.js`
- **極限擴充**：將記憶體保留的歷史紀錄上限從 10 萬筆大幅提升至 **1,000,000 筆**，以應付動輒數千天以上的巨量人流模擬測試。
- **動態排序**：新增 `$game.historySortMethod` 狀態。在 `filteredHistory` 內動態攔截並重新排序陣列。針對不同模式切換基準值 (Agent 模式看 `netProfit`、單人看 `totalWin`)。
- **自訂顯示筆數**：新增 `$game.historyDisplayLimit`，將原本寫死的 200 筆改為可讓使用者彈性輸入的變數。

#### [MODIFY] `RightSidebar.vue`
- **排序選單**：在篩選器下方新增了「最新紀錄優先」、「大到小」、「小到大」的下拉式選單。文字也會根據模式動態切換為「玩家淨利」或「贏分」。
- **動態筆數控制**：在歷史紀錄列表的最底端新增了可調整數字的輸入框 (`<input type="number">`)，預設帶入 200，讓您可以針對特定的極端值直接一口氣展開 1,000 筆紀錄來慢慢分析，隨時可調回 200 避免卡頓。
