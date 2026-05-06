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

                <!-- 結算面板 -->
                <div v-if="$game.lastResult" class="bg-gray-800 rounded-xl p-6 border border-gray-700 shadow-lg animate-fade-in">
                    <h3 class="text-xl font-bold text-white mb-4 border-b border-gray-600 pb-2 flex justify-between">
                        <span>📊 最新一局明細</span>
                        <span class="text-sm text-gray-400 font-normal mt-1">#{{ $game.lastResult.round }}</span>
                    </h3>
                    
                    <!-- Bonus 結算顯示 -->
                    <div v-if="$game.lastResult.bonusTriggered" class="p-3 rounded mb-4 text-center font-bold text-sm"
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

                    <div class="space-y-3 font-mono text-sm sm:text-base">
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
    inject: ['$game']
}
</script>
