# LiveMines Simulator - 更新日誌 (Changelog)

## [v2.38] - 2026-07-16
### ✨ 新增與優化 (Features & Refactoring)
- **數學邏輯同步 C++ 模擬器 V14 新格式**:
  - SimulationEngine.js: 付費閃電改為「依權重抽一組倍率組合」(例如 [1,1,3] 代表打三道閃電、倍率各為 1/1/3，每組保證含 3)，不再先抽道數再逐道抽倍率。免費閃電規則不變，但 payoutMultipliers.values 改為單元素陣列格式 (如 [1])。
  - 移除 gridWeights 加權落點邏輯 (sampleWeightedWithoutReplacement)，免費/付費閃電落點一律均勻隨機。設定中的 gridWeights 已改為 SERVER 專用的新物件格式 (thresholds/weights/neutralBand)，引擎不讀取。
  - constants.js: DEFAULT_CONFIG 同步為 TG001_LM01_BASE_Config.json 現行內容 (含 SERVER 專用的 riskScore 區塊，引擎忽略)。
  - 新增 validateConfigFormat(): 與 C++ 模擬器一致的新格式驗證，舊格式 (付費閃電含 strikes 區塊、平面倍率值) 一律拒絕。
- **localStorage 自動遷移**:
  - gameStore.js initializeStore(): 啟動時檢查本地儲存的參數，不符合新格式即自動重設為新版預設值並寫回 localStorage。
  - saveConfig(): 改用 validateConfigFormat() 統一驗證，貼上舊格式 JSON 會被擋下並顯示具體錯誤原因。
- **參數設定視窗排版優化**:
  - 新增 formatConfigJson()：Config Modal 開啟時，數值陣列 (含倍率組合) 保持單行顯示，與設定檔原始排版一致，不再每個元素各佔一行。
  - Config Modal 視窗加寬 (max-w-2xl → max-w-4xl，672px → 896px，約 1.33 倍)，最長的參數行不再折行。

### 🐛 錯誤修正 (Bug Fixes)
- **清除資料 (clearData) 殘留問題修復**:
  - 修復批次執行中按下「清除資料」或切換模式時，批次結束會把清除前暫存的紀錄倒回 history 的 Bug。新增 batchRunId 執行代號機制，clearData 會使進行中的批次迴圈自動中止並丟棄暫存資料。
  - 修復手動模式的押注金額在切換到人流模式後殘留在盤面上的問題 (setSimulationMode 現在會一併歸零 grids.betAmount)。
  - 修復清除資料後 currentTotalAgentCost / currentAgentDecisions 殘留，導致成本顯示與「格子詳情」彈窗仍是上一輪 Agent 資料的問題。
  - 移除與 getter 同名的 trafficCurrentDay / trafficCurrentRoundInDay 死 state 欄位，消除啟動時的 Pinia 同名衝突警告與 reset 時的靜默賦值失敗。

## [v2.35] - 2026-05-13
### ✨ 新增功能 (Features)
- **歷史紀錄與 Agent 詳情 UI 升級**:
  - AgentInfoModal.vue: 在玩家 DNA 詳情視窗中，新增「🧾 本局下注明細」區塊，清晰展示該局各格的投注與中獎明細（基礎派彩、閃電加倍、Bonus 通關、JP 分紅）。
  - HistoryModal.vue: 在「🌐 BONUS 世界線」中，新增「💎 JP 派發資訊」面板，詳細顯示該局的「可分配 JP 總額」、「實際派發金額」與「結算後剩餘池」。
  - 全面清理介面上的「浮點數地獄」，將所有金額欄位（含排行榜、歷史列表、投入與派彩統計）統一加上 .toFixed(2) 進行格式化。

### 🐛 錯誤修正 (Bug Fixes)
- **Agent JP 分配邏輯修復**:
  - 將 Bonus 的 JP 分配從「人頭均分」修正為「依據初始押注額佔比分配」，完全對齊企劃中的按比例分潤設計 (AgentSettlementEngine.js)。
  - 修復了 SimulationEngine.js 舊版單人模式遺留的「JP 中獎後強制清空大盤水池」的 Bug。現在人流模式下未被領走的 JP 份額會正確保留並滾入下一局的大水池中。
## [v2.34] - 2026-05-13
### 🐛 錯誤修正 (Bug Fixes)
- **Agent Bonus 目標強迫症修復**:
  - 修復了 AgentDecisionEngine.js 中 decideCashoutStrategy 錯誤使用 Cashout_Propensity 作為判斷是否收手的機率，導致未通過機率檢定的 Agent 會回傳 
ull，進而被結算引擎防呆機制強制判定為「想衝到最後一關 (L5)」的 Bug。
  - 現在 Agent 在進入 Bonus 遊戲時，會**嚴格且精準地**遵守其 DNA 裡的 Cashout_Stop_Level，說在第 1 關收手就在第 1 關收手，絕不再有隨機暴走至最後一關的現象發生。
## [v2.33] - 2026-05-13
### ✨ 新增與優化 (Features & Refactoring)
- **左側控制面板優化**:
  - 將「模擬天數」從手動輸入框改為「唯讀自動計算」。現在會自動抓取畫面上方的「總模擬次數 (simRounds)」除以「一天局數 (roundsPerDay)」，並標示「自動計算」，避免參數輸入發生邏輯衝突。
- **文件新增**:
  - 建立 Agent_Evolution_Plan.md，統整下一階段要喚醒的所有高階 DNA 藍圖（包含常態分佈浮動、個人錢包、追注縮注與跟風效應）。
## [v2.32] - 2026-05-13
### ✨ 新增與優化 (Features & Refactoring)
- **Active Agents 面板 UI 微調**:
  - 移除了標題列的 (PM 專用) 字樣，使介面更加通用。
  - 將 DNA 參數面板中所有可能的浮點數值（如下注額、倍數等）統一使用 .toFixed(2) 四捨五入至小數點後第二位，提升數值顯示的整齊度與專業感。
## [v2.31] - 2026-05-13
### 🐛 錯誤修正與優化 (Bug Fixes & Refactoring)
- **Agent Cashout 目標顯示修正**:
  - 修復 HistoryModal.vue 中，只有「成功通關 BONUS」的 Agent 才會顯示 🎯 目標 的 Bug。現在只要該格子觸發了 BONUS，所有押注該格的 Agent（不論成功或途中陣亡）都會正確顯示其預計的闖關目標。
  - 修復 AgentSettlementEngine.js 結算引擎中，若 Agent 沒有明確的提早 Cashout 傾向（即 plannedCashoutLevel 為 
ull，代表打算拼到最後），會錯誤地將其預設為 L1 的防呆 Bug。現在會正確將其目標預設為 L5（拼到最後一層）。
## [v2.30] - 2026-05-13
### ✨ 新增與優化 (Features & Refactoring)
- **Agent Traffic 模式 Bonus 世界線邏輯修正**:
  - 重構 SimulationEngine.js，使「人流模式」中的大盤世界線固定開出 1~5 層的安全號碼，不再因為「觸雷」而中斷。
  - 重構 AgentSettlementEngine.js，讓每個 Agent 進入 Bonus 後，會自己獨立隨機挑選號碼並與世界線比對，實現真正的多人獨立生死判定。
- **UI 顯示優化**:
  - LeftSidebar.vue 與 HistoryModal.vue 內的 Bonus 世界線面版，不再顯示「世界線過關/觸雷」，改為清楚列出該層的「安全號碼」以及底下 Agent 的「Cashout / 續闖 / 陣亡」人數。
  - HistoryModal.vue 中的 Agent 押注細節，將原本合併計算的稅金拆分顯示（例如 5 + 2.5），讓本金與付費閃電加收的稅金更一目了然。
  - RightSidebar.vue 的歷史篩選按鈕，在人流模式下會自動隱藏多餘的「BONUS 且有通關」按鈕，並動態改為更簡潔的 2x2 四方格排版。
  - **九宮格熱力圖上色 (GameBoard.vue, HistoryModal.vue)**: 人流模式的九宮格，會依據總押注額自動上色。最高金額顯示深紅色，第二高顯示淺紅色，其餘為藍色。

### 🐛 錯誤修正 (Bug Fixes)
- 修復從「人流模式」切換到「單機模式」再切回時，因 -if 銷毀畫布導致「每小時總押注額走勢圖」與「每小時登入人數走勢圖」白屏無法顯示的 Vue 生命週期 Bug。
# LiveMines Simulator - ?湔?亥? (Changelog)

## [v2.29] - 2026-05-13
### ???啣????(Features & Refactoring)
- **Agent Traffic 璅∪? UI 蝎曄?**:
  - 撠?`GameBoard` 銝??撅蝮賣??研矽?渡?撅憭抒蝮賣瘜具?銝衣宏?方????湔??憿嚗誑蝚血?憭抒?湧?璁艙??  - ?梯?鈭箸?璅∪?銝?敹?????雿身摰??身?格?????9 ?潦頃鞎琿???checkbox?ONUS ??閮剖?嚗?- **撌血?????唬?撅?敦???*:
  - 撠??砍璈?閫?蝞??敦嚗?瑽憭抒閬???  - ??Bonus 蝯???憿舐內 **???BONUS 銝?蝺?(Public Result)??* ?Ｘ嚗??怠?璅惜?犖瘚粥??Cashout/蝥?/??滿嚗?  - ??Base Game ?敦銝哨????箸??賜??◤???颯??航撠?銝??Agent ?潭釣?摮?銝行?璆＊蝷箄府?潛?**蝮賣瘜?*??*蝮賣晷敶?*??- **甇瑕蝝??(HistoryModal) ?詨潔耨甇?*:
  - 靽桀儔?喳暺??澆?憿舐內?????Agent ?瘜券?憿????鞎駁???50% 蝔???憿舐內??嚗Ⅱ靽?撌血憭抒??摰?撠???
### ?? ?航炊靽格迤 (Bug Fixes)
- 靽桀儔??璅∪???Persona ???皜征甇瑕?脣漲????憭梁?????- 靽桀儔???亦雯??嚗?閮凋犖瘚芋撘???隞嗅?琿隤方?質??fetch `agents.json` ??憿?- 蝣箔?瘥活?具??芋撘??犖瘚芋撘?????嚗?????鋡怨??蝛綽?銝阡??啁?府?亦? Day Plan嚗????頛舐??豢?瘛琿???





