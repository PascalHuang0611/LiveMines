<template>
<!-- ================= 放大版 RTP 折線圖彈跳視窗 (Modal) ================= -->
        <div v-show="$game.showChartModal" @click.self="$game.closeChartModal" class="fixed inset-0 z-50 flex items-center justify-center bg-black/90 p-4 backdrop-blur-md animate-fade-in">
            <div class="bg-gray-800 border border-gray-600 rounded-2xl p-6 w-full max-w-7xl h-[85vh] flex flex-col relative shadow-2xl">
                <button @click="$game.closeChartModal" class="absolute top-4 right-4 text-gray-400 hover:text-white text-3xl font-bold leading-none z-10">&times;</button>
                
                <h2 class="text-2xl font-bold text-yellow-400 mb-4 border-b border-gray-700 pb-2">
                    📈 批次 RTP 走勢圖 (詳細展開版)
                </h2>
                
                <!-- 雙 Canvas 架構以固定 Y 軸 -->
                <div class="flex-1 flex bg-gray-900 rounded-lg border border-gray-700 relative overflow-hidden">
                    <!-- 固定 Y 軸圖表區塊，加寬至 90px 確保數字不被裁切 -->
                    <div class="w-[90px] shrink-0 flex flex-col bg-gray-900 z-10 border-r border-gray-700 shadow-[2px_0_8px_rgba(0,0,0,0.5)]">
                        <div class="flex-1 py-4">
                            <canvas id="expandedYAxisChart"></canvas>
                        </div>
                        <!-- 底部保留 6px 的空間給捲動軸，確保左右 Canvas 高度完全對齊 -->
                        <div class="h-[6px] w-full bg-gray-800"></div>
                    </div>
                    <!-- 可左右滑動的主要圖表區塊 -->
                    <div class="flex-1 flex flex-col overflow-x-auto overflow-y-hidden custom-scrollbar bg-gray-900">
                        <div :style="{ width: $game.expandedChartWidth + 'px', minWidth: '100%' }" class="flex-1 py-4 pr-4">
                            <canvas id="expandedRtpChart"></canvas>
                        </div>
                    </div>
                </div>
                
                <div class="text-center mt-3 text-sm text-gray-400">
                    💡 提示：紅線為 100% 理論基準線。若切片數量過多，您可以直接左右滑動圖表來檢視所有波段的轉折點。點擊數據點可查看詳細數據。
                </div>
            </div>
        </div>
</template>

<script>
export default {
    name: 'ChartModal',
    inject: ['$game']
}
</script>
