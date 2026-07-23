<template>
<!-- ================= 左側欄：結算與統計 ================= -->
            <div class="w-full xl:w-[350px] flex flex-col gap-6 shrink-0 order-2 xl:order-1">
                
                <!-- 帳戶 GGR 面板 -->
                <div class="bg-gray-800 rounded-xl p-6 border border-gray-700 shadow-lg flex justify-between items-center">
                    <span class="text-lg font-bold text-gray-300">💰 目前 GGR</span>
                    <span :class="$game.currentGGR > 0 ? 'text-blue-400' : ($game.currentGGR < 0 ? 'text-purple-400' : 'text-gray-300')" class="text-2xl font-bold font-mono">
                        {{ $game.currentGGR > 0 ? '+' : '' }}{{ $game.currentGGR % 1 !== 0 ? $game.currentGGR.toFixed(2) : $game.currentGGR }}
                    </span>
                </div>

                <!-- 🛡️ SERVER 風控模擬 -->
                <div class="bg-gray-800 rounded-xl p-4 border border-gray-700 shadow-lg" :class="$game.riskControlEnabled ? 'border-l-4 border-l-red-500' : ''">
                    <label class="flex items-center justify-between cursor-pointer select-none">
                        <span class="text-lg font-bold text-gray-300">🛡️ SERVER 風控模擬</span>
                        <input type="checkbox"
                               :checked="$game.riskControlEnabled"
                               :disabled="!$game.riskControlConfig"
                               @change="$game.setRiskControlEnabled($event.target.checked)"
                               class="w-5 h-5 accent-red-500 cursor-pointer">
                    </label>
                    <p v-if="!$game.riskControlConfig" class="text-xs text-gray-500 mt-2">risk_control.json 載入失敗，功能不可用</p>
                    <div v-else-if="$game.riskControlEnabled" class="mt-3 space-y-1.5 text-sm font-mono animate-fade-in">
                        <!-- 三層獨立開關 -->
                        <div class="flex gap-2 pb-2 border-b border-gray-700 text-xs">
                            <label class="flex items-center gap-1 cursor-pointer select-none" title="依窗口 RTP 自動切換數值表 (階梯+遲滯)">
                                <input type="checkbox" :checked="$game.riskToggles.v2" @change="$game.setRiskToggle('v2', $event.target.checked)" class="w-3.5 h-3.5 accent-blue-500">
                                <span class="text-gray-300 font-bold">V2 切表</span>
                            </label>
                            <label class="flex items-center gap-1 cursor-pointer select-none" title="Bonus 每關依預估派彩後 RTP 強改通關為押注最低 2 選項">
                                <input type="checkbox" :checked="$game.riskToggles.v3" @change="$game.setRiskToggle('v3', $event.target.checked)" class="w-3.5 h-3.5 accent-yellow-500">
                                <span class="text-gray-300 font-bold">V3 強控</span>
                            </label>
                            <label class="flex items-center gap-1 cursor-pointer select-none" title="TRS/LRS 風險分數 → 閃電落點五級權重 (局尾重算、下局生效)">
                                <input type="checkbox" :checked="$game.riskToggles.v4" @change="$game.setRiskToggle('v4', $event.target.checked)" class="w-3.5 h-3.5 accent-purple-500">
                                <span class="text-gray-300 font-bold">V4 權重</span>
                            </label>
                        </div>
                        <div class="flex justify-between cursor-help" title="V2 依窗口 RTP 自動選定的數值表。BASE=正常；PRT1~3(紅)=RTP 偏高、殺數學護盤，數字越小力道越強；BST1~3(綠)=RTP 偏低、放水回補，數字越小力道越強。每局最多升降一級。">
                            <span class="text-gray-400 border-b border-dotted border-gray-600">當前 Zone</span>
                            <span :class="$game.riskZoneCode === 0 ? 'text-gray-200' : ($game.riskZoneCode >= 200 ? 'text-green-400' : 'text-red-400')" class="font-bold">
                                {{ $game.riskZoneProfile }}<span class="text-gray-500 text-xs"> ({{ $game.riskZoneCode }})</span>
                            </span>
                        </div>
                        <div class="flex justify-between cursor-help" title="滑動窗口內的 派彩÷投注 (最近 48,000 局，不含 JP 大獎)。V2 據此走階梯換表、V3 據此預估是否要保護 JP。「冷啟動」= 窗口還沒有任何樣本，此時強制使用 BASE。">
                            <span class="text-gray-400 border-b border-dotted border-gray-600">窗口 RTP</span>
                            <span class="text-yellow-300">{{ $game.riskWindowRtp === null ? '冷啟動' : $game.riskWindowRtp.toFixed(2) + '%' }}</span>
                        </div>
                        <div class="flex justify-between cursor-help" title="V2 換表的累計次數。前期窗口樣本少、RTP 噪音大時切換頻繁是正常的；樣本足夠後應趨於穩定。若長期高頻切換，代表門檻與遲滯 (trigger/exit) 可能設太近。">
                            <span class="text-gray-400 border-b border-dotted border-gray-600">Zone 切換次數</span>
                            <span class="text-gray-200">{{ $game.riskZoneSwitches }}</span>
                        </div>

                        <!-- 數值表使用比例 -->
                        <div v-if="$game.zoneUsageList.length > 0" class="pt-1.5 border-t border-gray-700">
                            <div class="text-gray-400 text-[10px] uppercase tracking-wider font-bold mb-1 cursor-help border-b border-dotted border-gray-600 inline-block"
                                 title="風控啟用期間，各數值表實際被使用的局數比例 (V2 自動切換的停留分佈)。滑鼠移到色塊或列上可見實際局數。清除資料或重置風控時歸零。">
                                📊 數值表使用比例
                            </div>
                            <div class="flex w-full h-2 rounded overflow-hidden mb-1.5">
                                <div v-for="z in $game.zoneUsageList" :key="'bar-' + z.key"
                                     :class="zoneColor(z.key)" :style="{ width: z.pct + '%' }"
                                     :title="z.key + ': ' + z.count.toLocaleString() + ' 局 (' + z.pct.toFixed(1) + '%)'"></div>
                            </div>
                            <div class="grid grid-cols-2 gap-x-3 gap-y-0.5">
                                <div v-for="z in $game.zoneUsageList" :key="'row-' + z.key"
                                     class="flex justify-between items-center cursor-help"
                                     :title="z.key + ' 實際使用 ' + z.count.toLocaleString() + ' 局'">
                                    <span class="flex items-center gap-1">
                                        <span class="w-2 h-2 rounded-sm inline-block" :class="zoneColor(z.key)"></span>
                                        <span class="text-gray-300 text-[11px]">{{ z.key }}</span>
                                    </span>
                                    <span class="text-gray-200 text-[11px] font-mono">{{ z.pct.toFixed(1) }}%</span>
                                </div>
                            </div>
                        </div>
                        <div class="flex justify-between cursor-help" title="檢查 = Bonus 每走一關且有人在場，V3 就評估一次「若讓原生開獎成立，派彩後 RTP 會是多少」。介入 = 評估後超過階段門檻且骰中機率，實際把通關格強改為押注最低 2 格的次數。介入/檢查比例低是健康狀態 (保險絲平常不該跳)。">
                            <span class="text-gray-400 border-b border-dotted border-gray-600">V3 介入/檢查</span>
                            <span :class="$game.riskV3Interventions > 0 ? 'text-red-400 font-bold' : 'text-gray-200'">{{ $game.riskV3Interventions }} / {{ $game.riskV3Checks }}</span>
                        </div>
                        <div class="flex justify-between cursor-help" title="每次 V3 介入時「原生開獎的預測派彩 − 強改後的預測派彩」之累計，即這層風控估計為莊家省下的 Bonus 派彩總額。">
                            <span class="text-gray-400 border-b border-dotted border-gray-600">V3 省下派彩</span>
                            <span class="text-gray-200">{{ $game.riskV3Saved.toFixed(2) }}</span>
                        </div>
                        <div class="flex justify-between cursor-help" title="V4 實際輸出「非等權位置權重」的局數，即閃電落點真的被偏移的局數。注意：BASE 表的五級權重全是 100，就算分數偏離也不會偏移 (shadow mode)——只有 V2 切到 PRT/BST 表且分數離開中性帶 45~55 時才會累積。">
                            <span class="text-gray-400 border-b border-dotted border-gray-600">V4 非中性局數</span>
                            <span :class="$game.riskV4NonNeutral > 0 ? 'text-purple-400 font-bold' : 'text-gray-200'">{{ $game.riskV4NonNeutral }}</span>
                        </div>
                        <div class="flex justify-between cursor-help" title="9 格 Treasure 風險分數 (EWMA 平滑後) 目前的最小~最大值。50=中性；越高代表該格越「熱」(押注集中/落球偏多/派彩超付/Bonus 曝險大)。分數決定免費閃電的落點權重：PRT 表下高分格閃電變少、BST 表下高分格閃電變多。範圍越寬代表格與格之間的風險差異越大。">
                            <span class="text-gray-400 border-b border-dotted border-gray-600">V4 TRS 範圍</span>
                            <span class="text-gray-200 text-xs">{{ $game.riskV4TrsRange }}</span>
                        </div>
                        <div class="flex justify-between cursor-help" title="9 格 Lightning 風險分數 (EWMA 平滑後) 的最小~最大值，控制付費閃電落點權重，邏輯同 TRS 但以 Extra 買家的押注為主。長期停在 50.0~50.0 通常是因為 Extra 投注量未達門檻 (局數≥100 且金額≥中位數×100)，依規格失效規則回歸中性——樣本夠了會自然開始波動。">
                            <span class="text-gray-400 border-b border-dotted border-gray-600">V4 LRS 範圍</span>
                            <span class="text-gray-200 text-xs">{{ $game.riskV4LrsRange }}</span>
                        </div>

                        <!-- V4 樣本門檻即時狀態 (獨立區塊) -->
                        <div v-if="$game.riskV4Gate" class="mt-2 p-2 rounded border border-gray-700 bg-gray-900/60 text-xs space-y-1">
                            <div class="text-gray-400 font-bold text-[10px] uppercase tracking-wider cursor-help border-b border-dotted border-gray-600 inline-block"
                                 title="V4 的樣本門檻 (規格失效規則)。任一模組門檻沒過 → 該模組分數鎖 50、權重中性。中位數 = 長期窗口內每局全場總投注的中間值，代表一局正常盤量。">
                                📏 V4 樣本門檻
                            </div>
                            <div class="flex justify-between">
                                <span class="text-gray-500">每局盤量中位數</span>
                                <span class="text-gray-300 font-mono">{{ $game.riskV4Gate.median.toFixed(2) }}</span>
                            </div>
                            <div class="flex justify-between" title="TRS 門檻: 長窗口內累積局數 ≥ 50">
                                <span class="text-gray-500">窗口局數 (TRS)</span>
                                <span class="font-mono" :class="$game.riskV4Gate.roundsOk ? 'text-green-400' : 'text-orange-400'">
                                    {{ $game.riskV4Gate.windowRounds }} / 50 {{ $game.riskV4Gate.roundsOk ? '✓' : '✗' }}
                                </span>
                            </div>
                            <div class="flex justify-between" title="LRS 門檻 1: 長窗口內「有 Extra 買家的局數」須達標">
                                <span class="text-gray-500">Extra 局數 (LRS)</span>
                                <span class="font-mono" :class="$game.riskV4Gate.extraRoundsOk ? 'text-green-400' : 'text-orange-400'">
                                    {{ $game.riskV4Gate.extraRounds }} / {{ $game.riskV4Gate.extraRoundsNeed }} {{ $game.riskV4Gate.extraRoundsOk ? '✓' : '✗' }}
                                </span>
                            </div>
                            <div class="flex justify-between" title="LRS 門檻 2: 長窗口內 Extra 買家本金總和 ≥ 中位數 × extraVolumeMultiplier。此為滑動窗口內的總和，跑更多局不會累積突破，只由 Extra 佔比決定。">
                                <span class="text-gray-500">Extra 金額 (LRS)</span>
                                <span class="font-mono" :class="$game.riskV4Gate.extraVolumeOk ? 'text-green-400' : 'text-orange-400'">
                                    {{ Math.round($game.riskV4Gate.extraVolume).toLocaleString() }} / {{ Math.round($game.riskV4Gate.extraVolumeNeed).toLocaleString() }} {{ $game.riskV4Gate.extraVolumeOk ? '✓' : '✗' }}
                                </span>
                            </div>
                            <div v-if="$game.riskV4TrsNote || $game.riskV4LrsNote" class="pt-1 border-t border-gray-700 space-y-0.5">
                                <div v-if="$game.riskV4TrsNote" class="text-orange-400">⚠ TRS 鎖中性：{{ $game.riskV4TrsNote }}</div>
                                <div v-if="$game.riskV4LrsNote" class="text-orange-400">⚠ LRS 鎖中性：{{ $game.riskV4LrsNote }}</div>
                            </div>
                        </div>
                    </div>
                    <p v-else class="text-xs text-gray-500 mt-2">勾選後每局依窗口 RTP 自動切換數值表 (V2 階梯+遲滯)</p>
                </div>

                <!-- 🧬 Agent 人流模式控制區 (Milestone 1) -->
                <div class="bg-gray-800 rounded-xl p-6 border border-gray-700 shadow-lg border-l-4 border-l-blue-500 mb-6">
                    <h3 class="text-xl font-bold text-white mb-4 flex justify-between items-center">
                        <span>🧬 模擬模式</span>
                        <div class="flex bg-gray-900 p-1 rounded-lg border border-gray-700">
                            <button @click="$game.setSimulationMode('manual')" 
                                    :class="$game.simulationMode === 'manual' ? 'bg-blue-600 text-white shadow-lg' : 'text-gray-500 hover:text-gray-300'"
                                    class="px-3 py-1 rounded-md text-xs font-bold transition-all duration-200">
                                手動
                            </button>
                            <button @click="$game.setSimulationMode('agentTraffic')" 
                                    :class="$game.simulationMode === 'agentTraffic' ? 'bg-blue-600 text-white shadow-lg' : 'text-gray-500 hover:text-gray-300'"
                                    class="px-3 py-1 rounded-md text-xs font-bold transition-all duration-200">
                                人流
                            </button>
                        </div>
                    </h3>

                    <div v-if="$game.simulationMode === 'agentTraffic'" class="space-y-4 animate-fade-in">
                        <div class="grid grid-cols-2 gap-3">
                            <div class="space-y-1">
                                <label class="text-[10px] text-gray-400 uppercase tracking-wider font-bold">一天局數</label>
                                <input type="number" v-model.number="$game.trafficScenario.roundsPerDay" @change="$game.onRoundsPerDayChanged()" class="w-full bg-gray-900 border border-gray-700 rounded px-2 py-1.5 text-white text-sm outline-none focus:border-blue-500">
                            </div>
                            <div class="space-y-1">
                                <label class="text-[10px] text-gray-400 uppercase tracking-wider font-bold" title="由畫面上方的總模擬次數 ÷ 一天局數 計算得出">模擬天數</label>
                                <div class="w-full bg-gray-900/50 border border-gray-800 rounded px-2 py-1.5 text-gray-400 text-sm flex items-center justify-between cursor-not-allowed">
                                    <span>{{ Math.max(0.1, Math.round(($game.simRounds / $game.trafficScenario.roundsPerDay) * 10) / 10) }} 天</span>
                                    <span class="text-[10px] bg-gray-800 px-1.5 py-0.5 rounded text-gray-500">自動計算</span>
                                </div>
                            </div>
                        </div>

                        <!-- DNA 載入按鈕 -->
                        <div class="pt-2">
                            <label class="block w-full bg-blue-600 hover:bg-blue-500 text-white text-center py-2 rounded-lg cursor-pointer transition-colors shadow-lg font-bold text-sm">
                                📂 載入 Agent DNA (JSON)
                                <input type="file" accept=".json" class="hidden" @change="$game.loadAgentPool">
                            </label>
                        </div>

                        <!-- 載入後的數據摘要 -->
                        <div v-if="$game.agentPool && $game.agentPool.length > 0" class="mt-4 p-3 bg-gray-900/50 rounded-lg border border-gray-700 animate-fade-in">
                            <div class="flex flex-col gap-1 mb-3">
                                <div class="flex justify-between items-center bg-black/20 p-1.5 rounded">
                                    <span class="text-[11px] text-gray-400 flex items-center gap-1">已載入 Agent 總數
                                        <span v-if="$game.agentPoolIsTest"
                                              class="text-[9px] bg-amber-900/40 text-amber-300/80 px-1.5 py-0.5 rounded border border-amber-800/40 cursor-help"
                                              title="此 DNA 帶有 Test_Bias_Group 標記，為測試用資料 (熱區押注偏好實驗：60% 追熱 / 20% 押冷 / 20% 隨機)，非真實玩家行為。還原正式資料請重新載入原版 agents.json。">🧪 測試 DNA</span>
                                    </span>
                                    <span class="text-xs font-bold text-blue-400">{{ $game.agentPool.length }}</span>
                                </div>
                                <div class="flex justify-between items-center bg-black/20 p-1.5 rounded" title="今日排程將會上線的 Agent 數量">
                                    <span class="text-[11px] text-gray-400">今日預估活躍人數</span>
                                    <span class="text-xs font-bold text-green-400">{{ $game.plannedDayActiveCount }}</span>
                                </div>
                                <div class="flex justify-between items-center bg-black/20 p-1.5 rounded" title="根據排程估算，同時在線人數的最高峰">
                                    <span class="text-[11px] text-gray-400">預估尖峰在線人數</span>
                                    <span class="text-xs font-bold text-yellow-400">{{ $game.estimatedPeakActiveCount }}</span>
                                </div>
                            </div>
                            
                            <div class="space-y-1.5">
                                <div class="text-[10px] text-gray-500 uppercase font-bold border-b border-gray-800 pb-1 mb-1 flex justify-between">
                                    <span>Persona 分佈</span>
                                    <span class="text-[9px] text-blue-500 animate-pulse">💡 移入看詳情</span>
                                </div>
                                
                                <div v-for="(data, personaKey) in $game.trafficPersonaStats" :key="personaKey" 
                                     class="group relative flex justify-between text-xs py-1.5 hover:bg-gray-700/50 rounded px-2 transition-all cursor-help border border-transparent hover:border-gray-600">
                                    
                                    <span class="text-gray-400 font-bold flex items-center gap-2">
                                        <div class="w-1.5 h-1.5 rounded-full" :style="{ backgroundColor: data.color }"></div>
                                        {{ data.personaNameZH }}
                                    </span>
                                    <span class="text-gray-300 font-mono">{{ data.count }}</span>

                                    <!-- 🏮 浮動詳情面板 (Tooltip) 🏮 -->
                                    <div class="absolute left-full ml-4 top-0 w-[22rem] bg-gray-900/95 backdrop-blur-xl border border-gray-600 p-4 rounded-xl shadow-[0_20px_50px_rgba(0,0,0,0.5)] z-[100] invisible group-hover:visible opacity-0 group-hover:opacity-100 transition-all duration-200 pointer-events-none translate-x-2 group-hover:translate-x-0">
                                        <div class="flex items-center gap-2 mb-2 border-b border-gray-700 pb-2">
                                            <div class="w-2.5 h-2.5 rounded-full shadow-[0_0_8px]" :style="{ backgroundColor: data.color, boxShadow: `0 0 10px ${data.color}` }"></div>
                                            <div class="font-bold text-sm text-white">{{ data.personaNameZH }} <span class="text-xs text-gray-500 ml-1 font-normal">{{ data.personaNameEN }}</span></div>
                                        </div>
                                        
                                        <div class="text-[11px] text-gray-300 mb-4 leading-relaxed italic">
                                            "{{ data.desc }}"
                                        </div>

                                        <div class="space-y-2">
                                            <div class="flex justify-between items-center bg-black/30 p-2 rounded">
                                                <span class="text-[9px] text-gray-500 uppercase font-bold">平均投注規模</span>
                                                <span class="text-[11px] text-blue-400 font-mono font-bold">{{ data.avgBet }}</span>
                                            </div>
                                            <div class="flex justify-between items-center bg-black/30 p-2 rounded">
                                                <span class="text-[9px] text-gray-500 uppercase font-bold">追輸翻倍意願</span>
                                                <span class="text-[11px] text-yellow-400 font-mono font-bold">{{ data.avgMartingale }}x</span>
                                            </div>
                                            <div class="flex justify-between items-center bg-black/30 p-2 rounded">
                                                <span class="text-[9px] text-gray-500 uppercase font-bold">贏後加減注 (<1為收, >1為衝)</span>
                                                <span class="text-[11px] text-green-400 font-mono font-bold">{{ data.avgRetrench }}x</span>
                                            </div>
                                            <div class="flex justify-between items-center bg-black/30 p-2 rounded">
                                                <span class="text-[9px] text-gray-500 uppercase font-bold">單次遊玩長度</span>
                                                <span class="text-[11px] text-purple-400 font-mono font-bold">{{ data.avgSessionLen }} 局</span>
                                            </div>
                                            <div class="flex justify-between items-center bg-black/30 p-2 rounded">
                                                <span class="text-[9px] text-gray-500 uppercase font-bold">預設停利 / 停損</span>
                                                <span class="text-[11px] text-pink-400 font-mono font-bold">{{ data.avgTakeProfit }}x / {{ data.avgStopLoss }}x</span>
                                            </div>
                                        </div>
                                        
                                        <div class="mt-3 text-[9px] text-gray-500 text-right italic">
                                            * 數據由載入之 DNA 動態彙整
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <p class="text-xs text-blue-400 italic">模式已切換，請先載入 DNA 資料後開始運行。</p>
                    </div>
                    <div v-else class="text-xs text-gray-500 italic">
                        目前為「手動固定策略模式」，適合單一配置的壓力測試。
                    </div>
                </div>

                <!-- 結算面板 -->
                <div v-if="$game.lastResult" class="bg-gray-800 rounded-xl p-6 border border-gray-700 shadow-lg animate-fade-in">
                    <h3 class="text-xl font-bold text-white mb-4 border-b border-gray-600 pb-2 flex justify-between">
                        <span>📊 最新一局明細</span>
                        <span class="text-sm text-gray-400 font-normal mt-1">#{{ $game.lastResult.round }}</span>
                    </h3>
                    
                    <!-- Bonus 結算顯示 -->
                    <div v-if="$game.lastResult.bonusTriggered" class="mb-4">
                        <div v-if="$game.simulationMode === 'manual'">
                            <div class="p-3 rounded text-center font-bold text-sm"
                                 :class="$game.lastResult.bonusSuccess ? 'bg-yellow-600 text-white shadow-[0_0_15px_rgba(202,138,4,0.5)] animate-pulse' : 'bg-red-900/80 text-gray-300 border border-red-700'">
                                <div v-if="$game.lastResult.bonusSuccess">
                                    🎉 BONUS 挑戰成功！<br>
                                    {{ $game.lastResult.bonusResultText }}
                                    <div v-if="$game.lastResult.jpWin > 0" class="mt-1 text-pink-300 text-base animate-bounce">
                                        💎 獨得 JP 累積池！ +{{ $game.lastResult.jpWin.toFixed(2) }}
                                    </div>
                                </div>
                                <div v-else>
                                    💥 BONUS 挑戰失敗...<br>
                                    <span class="text-gray-400 font-normal">{{ $game.lastResult.bonusResultText }}</span>
                                    <div v-if="$game.lastResult.bonusFailDetails" class="text-xs text-red-300 mt-2 border-t border-red-800/50 pt-2">
                                        您選擇了 [{{ $game.lastResult.bonusFailDetails.pick }}] 號位<br>
                                        此層安全位置為: {{ $game.lastResult.bonusFailDetails.safe.join(', ') }}
                                    </div>
                                </div>
                                
                                <!-- 各層開獎紀錄 -->
                                <div v-if="$game.lastResult.bonusLevelHistory" class="text-xs text-left mt-3 border-t border-white/20 pt-2 space-y-1 font-mono">
                                    <div v-for="lvl in $game.lastResult.bonusLevelHistory" :key="lvl.level" class="flex justify-between items-center bg-black/30 p-1.5 rounded" :class="lvl.passed ? 'border-l-2 border-green-400' : 'border-l-2 border-red-400'">
                                        <span class="text-gray-200">第{{ lvl.level }}層</span>
                                        <span class="text-gray-200">選[{{ lvl.pick }}]</span>
                                        <span class="text-gray-300">安全:{{ lvl.safe.join(',') }}</span>
                                        <span :class="lvl.passed ? 'text-green-300' : 'text-red-400'">{{ lvl.passed ? '✔ 過關' : '✖ 觸雷' }}</span>
                                    </div>
                                </div>
                            </div>
                        </div>
                        <div v-else>
                            <!-- 人流模式：世界線視角 -->
                            <div class="bg-purple-900/40 border border-purple-600/50 p-4 rounded-lg text-center">
                                <div class="text-purple-300 font-bold mb-2">🌐 BONUS 世界線 (Public Result)</div>
                                <div class="text-xs text-gray-400">全場共用此開獎結果，玩家依自身 DNA 決定</div>
                                
                                <div v-if="$game.lastResult.bonusLevelStats" class="text-xs text-left mt-2 border-t border-purple-800/50 pt-2 space-y-2 font-mono">
                                    <div v-for="stat in $game.lastResult.bonusLevelStats" :key="stat.level" class="flex flex-col bg-black/30 p-2 rounded border-l-2 border-purple-500">
                                        <div class="flex justify-between items-center mb-1">
                                            <span class="text-gray-200 font-bold">第 {{ stat.level }} 層 <span class="text-yellow-400 ml-1 text-[11px]">({{ $game.appConfig.bonusGame.levelSettings.payouts[stat.level - 1] }}倍)</span> <span class="text-gray-400 font-normal ml-1">(抵達: {{ stat.totalArrived }} 人)</span></span>
                                            <span class="text-gray-300 bg-gray-800 px-1.5 py-0.5 rounded">安全: {{ $game.lastResult.bonusLevelHistory[stat.level - 1].safe.join(',') }}</span>
                                        </div>
                                        <div class="flex justify-end items-center text-[10px]">
                                            <div class="flex gap-2">
                                                <span v-if="stat.cashedOutCount > 0" class="text-blue-300">💰 Cashout: {{ stat.cashedOutCount }} 人</span>
                                                <span v-if="stat.continuedCount > 0" class="text-yellow-300">🏃 續闖: {{ stat.continuedCount }} 人</span>
                                                <span v-if="stat.crashedCount > 0" class="text-red-400">💀 陣亡: {{ stat.crashedCount }} 人</span>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>

                    <div v-if="$game.simulationMode === 'manual'" class="space-y-3 font-mono text-sm sm:text-base">
                        <div v-for="detail in $game.lastResult.details" :key="detail.grid" class="flex justify-between items-center bg-gray-900 p-2 rounded">
                            <span class="text-gray-300">格子 [{{ detail.grid }}] (中 {{ detail.balls }} 球)</span>
                            <div class="text-right">
                                <span class="text-gray-400 text-xs block">
                                    ({{ detail.betAmount }} × {{ detail.basePayout }}) × (1 + {{ detail.baseL }} + {{ detail.purchasedL }})
                                </span>
                                <span class="text-green-400 font-bold">+{{ detail.win }}</span>
                            </div>
                        </div>
                        
                        <div v-if="$game.lastResult.details.length === 0 && !$game.lastResult.bonusTriggered" class="text-center text-gray-500 py-2">
                            本局沒有押中任何獎項...
                        </div>
                    </div>
                    <div v-else class="space-y-2 font-mono text-xs sm:text-sm">
                        <!-- 人流模式：簡化顯示落球與閃電結果及總押注與總派彩 -->
                        <div v-for="grid in $game.lastResult.finalGridsState.filter(g => g.balls > 0 || g.baseLightning > 0 || g.purchasedLightning > 0 || ($game.lastResult.gridStats && $game.lastResult.gridStats[g.id-1] && $game.lastResult.gridStats[g.id-1].totalBet > 0))" :key="'grid-res-'+grid.id" 
                             class="flex flex-col bg-gray-900 p-2 rounded border-l-2" 
                             :class="grid.balls > 0 ? 'border-blue-500' : 'border-gray-700'">
                            <div class="flex justify-between items-center border-b border-gray-800 pb-1 mb-1">
                                <span class="text-gray-300 font-bold whitespace-nowrap">格子 [{{ grid.id }}]</span>
                                <div class="flex flex-wrap justify-end gap-1 items-center">
                                    <span v-if="grid.balls > 0" class="bg-red-900/80 text-white px-1.5 py-0.5 rounded shadow text-[10px]">中 {{ grid.balls }} 球</span>
                                    <span v-if="grid.baseLightning > 0" class="text-yellow-400 bg-yellow-900/30 border border-yellow-800/50 px-1.5 py-0.5 rounded text-[10px]">⚡ 免費 +{{ grid.baseLightning }}x</span>
                                    <span v-if="grid.purchasedLightning > 0" class="text-purple-400 bg-purple-900/30 border border-purple-800/50 px-1.5 py-0.5 rounded text-[10px]">⚡ 付費 +{{ grid.purchasedLightning }}x</span>
                                </div>
                            </div>
                            <div v-if="$game.lastResult.gridStats" class="flex justify-between items-center text-xs">
                                <span class="text-gray-400">總押注: <span class="text-red-400 font-bold">{{ $game.lastResult.gridStats[grid.id - 1].totalBet.toFixed(2).replace(/\.00$/, '') }}</span></span>
                                <span class="text-gray-400">總派彩: <span :class="$game.lastResult.gridStats[grid.id - 1].totalWin > 0 ? 'text-green-400 font-bold' : 'text-gray-500'">{{ $game.lastResult.gridStats[grid.id - 1].totalWin.toFixed(2).replace(/\.00$/, '') }}</span></span>
                            </div>
                        </div>
                        <div v-if="$game.lastResult.finalGridsState.filter(g => g.balls > 0 || g.baseLightning > 0 || g.purchasedLightning > 0 || ($game.lastResult.gridStats && $game.lastResult.gridStats[g.id-1] && $game.lastResult.gridStats[g.id-1].totalBet > 0)).length === 0" class="text-center text-gray-500 py-2">
                            本局無任何落球與押注...
                        </div>
                    </div>

                    <div class="mt-4 pt-4 border-t border-gray-600 flex justify-between items-end">
                        <div>
                            <p class="text-gray-400 text-sm">投入: <span class="text-red-400">{{ $game.lastResult.cost }}</span></p>
                            <p class="text-gray-400 text-sm">派彩: <span class="text-green-400">{{ $game.lastResult.totalWin }}</span></p>
                        </div>
                        <div class="text-right">
                            <p class="text-sm text-gray-400 mb-1">本局淨利</p>
                            <p :class="$game.lastResult.netProfit >= 0 ? 'text-green-400' : 'text-red-400'" class="text-3xl font-bold">
                                {{ $game.lastResult.netProfit >= 0 ? '+' : '' }}{{ $game.lastResult.netProfit }}
                            </p>
                        </div>
                    </div>
                </div>
                
                <!-- 空白佔位符 (尚未開獎時顯示) -->
                <div v-else class="bg-gray-800 rounded-xl p-6 border border-gray-700 shadow-lg flex items-center justify-center h-[200px] text-gray-500 text-center">
                    <p>尚未開獎<br><span class="text-sm text-gray-600">本局明細將顯示於此</span></p>
                </div>

                <!-- 綜合統計面板 -->
                <div class="bg-gray-800 rounded-xl p-6 border border-gray-700 shadow-lg">
                    <h3 class="text-xl font-bold text-white mb-4 border-b border-gray-600 pb-2 flex justify-between items-center">
                        <span>📈 綜合統計</span>
                        <span class="text-sm font-normal text-gray-400">總局數: {{ $game.currentRound }}</span>
                    </h3>

                    <!-- 總體統計區塊 -->
                    <div class="grid grid-cols-3 gap-2 mb-2 text-center">
                        <div class="bg-gray-900 p-3 rounded-lg">
                            <p class="text-[10px] sm:text-xs text-gray-400">總投入</p>
                            <p class="text-xs sm:text-[15px] font-bold text-red-400 truncate" :title="$game.stats.totalBet">{{ $game.stats.totalBet }}</p>
                        </div>
                        <div class="bg-gray-900 p-3 rounded-lg">
                            <p class="text-[10px] sm:text-xs text-gray-400">總派彩</p>
                            <p class="text-xs sm:text-[15px] font-bold text-green-400 truncate" :title="$game.stats.totalWin">{{ $game.stats.totalWin }}</p>
                        </div>
                        <div class="bg-gray-900 p-3 rounded-lg relative overflow-hidden">
                            <p class="text-xs text-gray-400">總 RTP</p>
                            <p :class="{'text-green-400': $game.currentRTP >= 100, 'text-yellow-400': $game.currentRTP >= 90 && $game.currentRTP < 100, 'text-red-400': $game.currentRTP < 90}" class="text-sm sm:text-lg font-bold">
                                {{ $game.currentRTP }}%
                            </p>
                        </div>
                    </div>
                        
                    <!-- RTP 拆分項目 -->
                    <div class="grid grid-cols-4 gap-2 mb-4 text-center">
                        <div class="bg-gray-900 p-2 rounded-lg border border-gray-700 flex flex-col justify-center">
                            <p class="text-[9px] sm:text-[10px] text-gray-400">基礎</p>
                            <p class="text-xs sm:text-sm font-bold text-blue-400">{{ $game.baseRTP }}%</p>
                        </div>
                        <div class="bg-gray-900 p-2 rounded-lg border border-gray-700 flex flex-col justify-center">
                            <p class="text-[9px] sm:text-[10px] text-gray-400">閃電</p>
                            <p class="text-xs sm:text-sm font-bold text-yellow-400">{{ $game.lightningRTP }}%</p>
                        </div>
                        <div class="bg-gray-900 p-2 rounded-lg border border-gray-700 flex flex-col justify-center">
                            <p class="text-[9px] sm:text-[10px] text-gray-400">BONUS</p>
                            <p class="text-xs sm:text-sm font-bold text-purple-400">{{ $game.bonusRTP }}%</p>
                        </div>
                        <div class="bg-gray-900 p-2 rounded-lg border border-gray-700 flex flex-col justify-center">
                            <p class="text-[9px] sm:text-[10px] text-gray-400">JP</p>
                            <p class="text-xs sm:text-sm font-bold text-pink-400">{{ $game.jpRTP }}%</p>
                        </div>
                    </div>
                    
                    <div class="bg-gray-900 p-2 rounded-lg border border-gray-700 mb-4 text-center flex justify-between items-center px-4">
                        <p class="text-[10px] sm:text-xs text-gray-400">💎 JP 累積池 (理論佔比: {{ ($game.appConfig.bonusGame.jp_contribution_rate * 100).toFixed(2) }}%)</p>
                        <p class="text-lg font-bold text-pink-400">{{ $game.stats.totalJpPool.toFixed(2) }}</p>
                    </div>

                    <!-- 進階統計區塊 (落球型態與分佈) -->
                    <div class="bg-gray-900 p-3 rounded-lg mb-4 space-y-3">
                        <!-- 球型佔比 -->
                        <div>
                            <p class="text-[11px] text-gray-400 font-bold mb-1 border-b border-gray-700 pb-1 flex justify-between">
                                <span>🎯 落球型態佔比</span>
                                <span class="font-normal text-gray-500">出現次數</span>
                            </p>
                            <div class="flex justify-between text-xs font-mono">
                                <span class="text-gray-300 flex flex-col items-center">三同球 <span class="text-yellow-400 font-bold">{{ $game.patternStats.threeSame }}%</span> <span class="text-[10px] text-gray-500">{{ $game.stats.patterns.threeSame }}</span></span>
                                <span class="text-gray-300 flex flex-col items-center">兩同球 <span class="text-blue-400 font-bold">{{ $game.patternStats.twoSame }}%</span> <span class="text-[10px] text-gray-500">{{ $game.stats.patterns.twoSame }}</span></span>
                                <span class="text-gray-300 flex flex-col items-center">三不同 <span class="text-green-400 font-bold">{{ $game.patternStats.allDifferent }}%</span> <span class="text-[10px] text-gray-500">{{ $game.stats.patterns.allDifferent }}</span></span>
                            </div>
                        </div>

                        <!-- 單局閃電數量佔比 -->
                        <div>
                            <p class="text-[11px] text-gray-400 font-bold mb-1 border-b border-gray-700 pb-1 flex justify-between">
                                <span>🌩️ 單局閃電數量佔比</span>
                                <span class="font-normal text-gray-500">總局數: {{ $game.currentRound }}</span>
                            </p>
                            <div class="grid grid-cols-3 gap-1">
                                <div v-for="(pct, count) in $game.strikeCountStats" :key="'sc-'+count" class="bg-gray-800 rounded p-1 flex justify-between items-center text-[10px] font-mono hover:bg-gray-700 cursor-default" :title="'出現次數: ' + $game.stats.strikeCounts[count]">
                                    <span class="text-gray-500 font-bold">{{ count }}次</span>
                                    <span class="text-yellow-400">{{ pct }}%</span>
                                </div>
                            </div>
                            <div v-if="Object.keys($game.strikeCountStats).length === 0" class="text-xs text-gray-500 text-center py-1">暫無數據</div>
                        </div>
                        
                        <!-- 9宮格落點佔比 -->
                        <div>
                            <p class="text-[11px] text-gray-400 font-bold mb-1 border-b border-gray-700 pb-1 flex justify-between">
                                <span>🎲 各格落球機率 (全域)</span>
                                <span class="font-normal text-gray-500">總球數: {{ $game.currentRound * 3 }}</span>
                            </p>
                            <div class="grid grid-cols-3 gap-1">
                                <div v-for="(pct, idx) in $game.gridHitStats" :key="'ball-'+idx" class="bg-gray-800 rounded p-1 flex justify-between items-center text-[10px] font-mono hover:bg-gray-700 cursor-default" :title="'落球次數: ' + $game.stats.gridHits[idx]">
                                    <span class="text-gray-500 font-bold">[{{ idx + 1 }}]</span>
                                    <span class="text-gray-300">{{ pct }}%</span>
                                </div>
                            </div>
                        </div>

                        <!-- 9宮格閃電落點佔比 -->
                        <div>
                            <p class="text-[11px] text-gray-400 font-bold mb-1 border-b border-gray-700 pb-1 flex justify-between">
                                <span>⚡ 各格閃電落點機率 (全域)</span>
                                <span class="font-normal text-gray-500">總閃電數: {{ $game.totalLightningStrikes }}</span>
                            </p>
                            <div class="grid grid-cols-3 gap-1">
                                <div v-for="(pct, idx) in $game.gridLightningHitStats" :key="'lightning-'+idx" class="bg-gray-800 rounded p-1 flex justify-between items-center text-[10px] font-mono hover:bg-gray-700 cursor-default" :title="'閃電次數: ' + $game.stats.lightningHits[idx]">
                                    <span class="text-gray-500 font-bold">[{{ idx + 1 }}]</span>
                                    <span class="text-yellow-400">{{ pct }}%</span>
                                </div>
                            </div>
                        </div>

                        <!-- BONUS 系統安全位置佔比 -->
                        <div>
                            <p class="text-[11px] text-gray-400 font-bold mb-1 border-b border-gray-700 pb-1 flex justify-between">
                                <span>🃏 BONUS 安全位置分佈 (全域)</span>
                                <span class="font-normal text-gray-500">總產生數: {{ $game.totalBonusSafeSpots }}</span>
                            </p>
                            <div class="grid grid-cols-4 gap-1">
                                <div v-for="(pct, idx) in $game.bonusSafeHitStats" :key="'safe-'+idx" class="bg-gray-800 rounded p-1 flex justify-between items-center text-[10px] font-mono hover:bg-gray-700 cursor-default" :title="'出現次數: ' + $game.stats.bonusSafeHits[idx]">
                                    <span class="text-gray-500 font-bold">[{{ idx + 1 }}]</span>
                                    <span class="text-purple-400">{{ pct }}%</span>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
                
                <!-- ================= 批次統計 (切片) 面板 ================= -->
                <div class="bg-gray-800 rounded-xl p-6 border border-gray-700 shadow-lg">
                    <h3 class="text-xl font-bold text-white mb-4 border-b border-gray-600 pb-2 flex justify-between items-center">
                        <span>📦 批次統計 (切片)</span>
                        <button @click="$game.exportBatchesToCSV" class="bg-blue-600 hover:bg-blue-500 text-white text-sm font-bold px-3 py-1 rounded shadow transition flex items-center gap-1" :disabled="$game.displayBatches.length === 0" :class="{'opacity-50 cursor-not-allowed': $game.displayBatches.length === 0}">
                            <span>📥</span> <span class="hidden sm:inline">匯出 CSV</span>
                        </button>
                    </h3>
                    
                    <div class="flex items-center gap-3 mb-4 bg-gray-900 p-3 rounded-lg border border-gray-700">
                        <span class="text-sm text-gray-400 whitespace-nowrap">批次局數:</span>
                        <input type="number" v-model.number="$game.batchSize" min="1" max="1000000" class="w-full bg-gray-800 border border-blue-500 rounded px-3 py-1.5 text-white font-bold outline-none shadow-inner transition">
                    </div>
                    
                    <!-- 高度加倍 (max-h-[600px]) -->
                    <div class="max-h-[600px] overflow-y-auto pr-2 space-y-2 font-mono text-sm relative custom-scrollbar">
                        <!-- 渲染所有切片 -->
                        <div v-for="(b, idx) in $game.displayBatches" :key="'batch-'+b.startRound"
                             @click="$game.openBatchModal(b)"
                             class="bg-gray-900 p-3 rounded border-l-4 cursor-pointer hover:bg-gray-700 transition transform hover:scale-[1.01]"
                             :class="$game.getBatchRTP(b, 'total') >= 100 ? 'border-green-500' : 'border-blue-500'">
                            <div class="flex justify-between items-center mb-1">
                                <span class="text-gray-300 font-bold">局數 #{{ b.startRound }} ~ #{{ b.endRound }}</span>
                                <span v-if="b.roundsCount < $game.batchSize && b === $game.currentBatchStats" class="text-[10px] bg-gray-700 text-gray-300 px-2 py-0.5 rounded border border-gray-600">進行中 ({{ b.roundsCount }})</span>
                                <span v-else class="text-[10px] bg-blue-900/80 text-blue-300 px-2 py-0.5 rounded border border-blue-700">已完成 ({{ b.roundsCount }})</span>
                            </div>
                            <div class="flex justify-between text-gray-400 text-xs mt-2">
                                <span>RTP: <span :class="$game.getBatchRTP(b, 'total') >= 100 ? 'text-green-400 font-bold' : 'text-yellow-400 font-bold'">{{ $game.getBatchRTP(b, 'total') }}%</span></span>
                                <span class="italic text-gray-500 text-[10px]">點擊看詳情 👆</span>
                            </div>
                        </div>
                        
                        <div v-if="$game.displayBatches.length === 0" class="text-center text-gray-500 py-6 border border-dashed border-gray-700 rounded-lg">
                            尚未產生批次統計資料
                        </div>
                    </div>
                </div>

            </div>
</template>

<script>
export default {
    name: 'LeftSidebar',
    inject: ['$game'],
    methods: {
        // 數值表使用比例的色塊: PRT 紅系 (越強越深)、BST 綠系 (越強越深)、BASE 灰
        zoneColor(key) {
            return {
                BASE: 'bg-gray-500',
                PRT1: 'bg-red-600', PRT2: 'bg-red-500', PRT3: 'bg-red-400',
                BST3: 'bg-green-400', BST2: 'bg-green-500', BST1: 'bg-green-600'
            }[key] || 'bg-gray-600';
        }
    }
}
</script>
