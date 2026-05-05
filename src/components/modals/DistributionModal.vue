<template>
<!-- ================= 放大版 RTP 分佈長條圖彈跳視窗 (Modal) ================= -->
        <div v-show="$game.showDistributionModal" @click.self="$game.closeDistributionChartModal" class="fixed inset-0 z-50 flex items-center justify-center bg-black/90 p-4 backdrop-blur-md animate-fade-in">
            <div class="bg-gray-800 border border-gray-600 rounded-2xl p-6 w-full max-w-7xl h-[85vh] flex flex-col relative shadow-2xl">
                <button @click="$game.closeDistributionChartModal" class="absolute top-4 right-4 text-gray-400 hover:text-white text-3xl font-bold leading-none z-10">&times;</button>
                
                <div class="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-4 border-b border-gray-700 pb-2 gap-3">
                    <h2 class="text-2xl font-bold text-yellow-400 flex items-center gap-3">
                        <span>📊 批次 RTP 分佈圖 (詳細展開版)</span>
                    </h2>
                    <div class="flex items-center gap-2 bg-gray-900 px-3 py-1.5 rounded border border-gray-600 text-sm">
                        <span class="text-gray-400">區間大小:</span>
                        <input type="number" v-model.number="$game.distributionBinSize" min="0.1" step="0.1" class="w-20 bg-gray-800 border border-gray-600 rounded px-2 py-0.5 text-white outline-none focus:border-blue-500 text-center transition">
                        <span class="text-gray-400">%</span>
                    </div>
                </div>
                
                <div class="flex-1 flex flex-col overflow-x-auto overflow-y-hidden custom-scrollbar bg-gray-900 rounded-lg border border-gray-700 relative">
                    <div :style="{ width: $game.expandedDistChartWidth + 'px', minWidth: '100%' }" class="flex-1 p-4">
                        <canvas id="expandedDistributionChart"></canvas>
                    </div>
                </div>
                
                <div class="text-center mt-3 text-sm text-gray-400">
                    💡 提示：點擊長條圖可查看該區間的所有批次。可左右滑動檢視完整分佈。
                </div>
            </div>
        </div>
</template>

<script>
export default {
    name: 'DistributionModal',
    inject: ['$game']
}
</script>
