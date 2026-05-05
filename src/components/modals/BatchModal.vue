<template>
<!-- ================= 批次統計詳情彈跳視窗 (Modal) ================= -->
        <!-- 注意：加上 z-[60] 確保在圖表放大的時候點擊，這個 Modal 也能蓋在放大版 Modal 的上方 -->
        <div v-if="$game.selectedBatch" @click.self="$game.closeBatchModal" class="fixed inset-0 z-[60] flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm animate-fade-in">
            <div class="bg-gray-800 border border-blue-500 rounded-2xl p-6 w-full max-w-lg max-h-[90vh] overflow-y-auto relative shadow-2xl">
                <button @click="$game.closeBatchModal" class="absolute top-4 right-4 text-gray-400 hover:text-white text-3xl font-bold leading-none">&times;</button>
                
                <h2 class="text-xl font-bold text-blue-400 mb-4 border-b border-gray-700 pb-2">
                    📦 批次詳情 (局數 #{{ $game.selectedBatch.startRound }} ~ #{{ $game.selectedBatch.endRound }})
                </h2>

                <!-- Modal 內的總體統計 -->
                <div class="grid grid-cols-3 gap-2 mb-2 text-center">
                    <div class="bg-gray-900 p-3 rounded-lg">
                        <p class="text-[10px] sm:text-xs text-gray-400">總投入</p>
                        <p class="text-xs sm:text-[15px] font-bold text-red-400 truncate" :title="$game.selectedBatch.totalBet">{{ $game.selectedBatch.totalBet }}</p>
                    </div>
                    <div class="bg-gray-900 p-3 rounded-lg">
                        <p class="text-[10px] sm:text-xs text-gray-400">總派彩</p>
                        <p class="text-xs sm:text-[15px] font-bold text-green-400 truncate" :title="$game.selectedBatch.totalWin">{{ $game.selectedBatch.totalWin }}</p>
                    </div>
                    <div class="bg-gray-900 p-3 rounded-lg relative overflow-hidden">
                        <p class="text-xs text-gray-400">總 RTP</p>
                        <p :class="{'text-green-400': $game.getBatchRTP($game.selectedBatch, 'total') >= 100, 'text-yellow-400': $game.getBatchRTP($game.selectedBatch, 'total') >= 90 && $game.getBatchRTP($game.selectedBatch, 'total') < 100, 'text-red-400': $game.getBatchRTP($game.selectedBatch, 'total') < 90}" class="text-sm sm:text-lg font-bold">
                            {{ $game.getBatchRTP($game.selectedBatch, 'total') }}%
                        </p>
                    </div>
                </div>
                <!-- Modal 內的 RTP 拆分 -->
                <div class="grid grid-cols-4 gap-2 mb-4 text-center">
                    <div class="bg-gray-900 p-2 rounded-lg border border-gray-700 flex flex-col justify-center">
                        <p class="text-[9px] sm:text-[10px] text-gray-400">基礎</p>
                        <p class="text-xs sm:text-sm font-bold text-blue-400">{{ $game.getBatchRTP($game.selectedBatch, 'base') }}%</p>
                    </div>
                    <div class="bg-gray-900 p-2 rounded-lg border border-gray-700 flex flex-col justify-center">
                        <p class="text-[9px] sm:text-[10px] text-gray-400">閃電</p>
                        <p class="text-xs sm:text-sm font-bold text-yellow-400">{{ $game.getBatchRTP($game.selectedBatch, 'lightning') }}%</p>
                    </div>
                    <div class="bg-gray-900 p-2 rounded-lg border border-gray-700 flex flex-col justify-center">
                        <p class="text-[9px] sm:text-[10px] text-gray-400">BONUS</p>
                        <p class="text-xs sm:text-sm font-bold text-purple-400">{{ $game.getBatchRTP($game.selectedBatch, 'bonus') }}%</p>
                    </div>
                    <div class="bg-gray-900 p-2 rounded-lg border border-gray-700 flex flex-col justify-center">
                        <p class="text-[9px] sm:text-[10px] text-gray-400">JP</p>
                        <p class="text-xs sm:text-sm font-bold text-pink-400">{{ $game.getBatchRTP($game.selectedBatch, 'jp') }}%</p>
                    </div>
                </div>

                <div class="bg-gray-900 p-3 rounded-lg mb-4 space-y-3">
                    <!-- 球型佔比 -->
                    <div>
                        <p class="text-[11px] text-gray-400 font-bold mb-1 border-b border-gray-700 pb-1 flex justify-between">
                            <span>🎯 落球型態佔比</span>
                            <span class="font-normal text-gray-500">出現次數</span>
                        </p>
                        <div class="flex justify-between text-xs font-mono">
                            <span class="text-gray-300 flex flex-col items-center">三同球 <span class="text-yellow-400 font-bold">{{ $game.getBatchPatternStats($game.selectedBatch).threeSame }}%</span> <span class="text-[10px] text-gray-500">{{ $game.selectedBatch.patterns.threeSame }}</span></span>
                            <span class="text-gray-300 flex flex-col items-center">兩同球 <span class="text-blue-400 font-bold">{{ $game.getBatchPatternStats($game.selectedBatch).twoSame }}%</span> <span class="text-[10px] text-gray-500">{{ $game.selectedBatch.patterns.twoSame }}</span></span>
                            <span class="text-gray-300 flex flex-col items-center">三不同 <span class="text-green-400 font-bold">{{ $game.getBatchPatternStats($game.selectedBatch).allDifferent }}%</span> <span class="text-[10px] text-gray-500">{{ $game.selectedBatch.patterns.allDifferent }}</span></span>
                        </div>
                    </div>
                    <!-- 單局閃電數量佔比 -->
                    <div>
                        <p class="text-[11px] text-gray-400 font-bold mb-1 border-b border-gray-700 pb-1 flex justify-between">
                            <span>🌩️ 單局閃電數量佔比</span>
                            <span class="font-normal text-gray-500">此批次: {{ $game.selectedBatch.roundsCount }} 局</span>
                        </p>
                        <div class="grid grid-cols-3 gap-1">
                            <div v-for="(pct, count) in $game.getBatchStrikeCountStats($game.selectedBatch)" :key="'batch-sc-'+count" class="bg-gray-800 rounded p-1 flex justify-between items-center text-[10px] font-mono hover:bg-gray-700 cursor-default" :title="'出現次數: ' + $game.selectedBatch.strikeCounts[count]">
                                <span class="text-gray-500 font-bold">{{ count }}次</span>
                                <span class="text-yellow-400">{{ pct }}%</span>
                            </div>
                        </div>
                    </div>
                    <!-- 9宮格落點佔比 -->
                    <div>
                        <p class="text-[11px] text-gray-400 font-bold mb-1 border-b border-gray-700 pb-1 flex justify-between">
                            <span>🎲 各格落球機率</span>
                        </p>
                        <div class="grid grid-cols-3 gap-1">
                            <div v-for="(pct, idx) in $game.getBatchGridHitStats($game.selectedBatch)" :key="'batch-ball-'+idx" class="bg-gray-800 rounded p-1 flex justify-between items-center text-[10px] font-mono hover:bg-gray-700 cursor-default" :title="'落球次數: ' + $game.selectedBatch.gridHits[idx]">
                                <span class="text-gray-500 font-bold">[{{ idx + 1 }}]</span>
                                <span class="text-gray-300">{{ pct }}%</span>
                            </div>
                        </div>
                    </div>
                    <!-- 9宮格閃電落點佔比 -->
                    <div>
                        <p class="text-[11px] text-gray-400 font-bold mb-1 border-b border-gray-700 pb-1 flex justify-between">
                            <span>⚡ 各格閃電落點機率</span>
                        </p>
                        <div class="grid grid-cols-3 gap-1">
                            <div v-for="(pct, idx) in $game.getBatchLightningHitStats($game.selectedBatch)" :key="'batch-lightning-'+idx" class="bg-gray-800 rounded p-1 flex justify-between items-center text-[10px] font-mono hover:bg-gray-700 cursor-default" :title="'閃電次數: ' + $game.selectedBatch.lightningHits[idx]">
                                <span class="text-gray-500 font-bold">[{{ idx + 1 }}]</span>
                                <span class="text-yellow-400">{{ pct }}%</span>
                            </div>
                        </div>
                    </div>
                    <!-- BONUS 系統安全位置佔比 -->
                    <div>
                        <p class="text-[11px] text-gray-400 font-bold mb-1 border-b border-gray-700 pb-1 flex justify-between">
                            <span>🃏 BONUS 安全位置分佈</span>
                        </p>
                        <div class="grid grid-cols-4 gap-1">
                            <div v-for="(pct, idx) in $game.getBatchBonusSafeHitStats($game.selectedBatch)" :key="'batch-safe-'+idx" class="bg-gray-800 rounded p-1 flex justify-between items-center text-[10px] font-mono hover:bg-gray-700 cursor-default" :title="'出現次數: ' + $game.selectedBatch.bonusSafeHits[idx]">
                                <span class="text-gray-500 font-bold">[{{ idx + 1 }}]</span>
                                <span class="text-purple-400">{{ pct }}%</span>
                            </div>
                        </div>
                    </div>
                </div>

                <div class="flex justify-end mt-4 pt-4 border-t border-gray-700">
                    <button @click="$game.closeBatchModal" class="px-6 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg font-bold transition">關閉</button>
                </div>
            </div>
        </div>
</template>

<script>
export default {
    name: 'BatchModal',
    inject: ['$game']
}
</script>
