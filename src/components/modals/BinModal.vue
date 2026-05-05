<template>
<!-- ================= 區間批次列表彈跳視窗 (Modal) ================= -->
        <div v-if="$game.showBinModal" @click.self="$game.closeBinModal" class="fixed inset-0 z-[55] flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm animate-fade-in">
            <div class="bg-gray-800 border border-purple-500 rounded-2xl p-6 w-full max-w-lg max-h-[90vh] flex flex-col relative shadow-2xl">
                <button @click="$game.closeBinModal" class="absolute top-4 right-4 text-gray-400 hover:text-white text-3xl font-bold leading-none">&times;</button>
                
                <h2 class="text-xl font-bold text-purple-400 mb-4 border-b border-gray-700 pb-2">
                    📊 區間 {{ $game.selectedBinLabel }} 批次列表
                    <span class="text-sm text-gray-400 font-normal ml-2">(共 {{ $game.selectedBinBatches.length }} 筆)</span>
                </h2>
                
                <div class="flex-1 overflow-y-auto pr-2 space-y-2 font-mono text-sm custom-scrollbar">
                    <div v-for="(b, idx) in $game.selectedBinBatches" :key="'bin-batch-'+b.startRound"
                         @click="$game.openBatchModal(b)"
                         class="bg-gray-900 p-3 rounded border-l-4 cursor-pointer hover:bg-gray-700 transition transform hover:scale-[1.01]"
                         :class="$game.getBatchRTP(b, 'total') >= 100 ? 'border-green-500' : 'border-blue-500'">
                        <div class="flex justify-between items-center mb-1">
                            <span class="text-gray-300 font-bold">局數 #{{ b.startRound }} ~ #{{ b.endRound }}</span>
                            <span class="text-[10px] bg-blue-900/80 text-blue-300 px-2 py-0.5 rounded border border-blue-700">已完成 ({{ b.roundsCount }})</span>
                        </div>
                        <div class="flex justify-between text-gray-400 text-xs mt-2">
                            <span>RTP: <span :class="$game.getBatchRTP(b, 'total') >= 100 ? 'text-green-400 font-bold' : 'text-yellow-400 font-bold'">{{ $game.getBatchRTP(b, 'total') }}%</span></span>
                            <span class="italic text-gray-500 text-[10px]">點擊看詳情 👆</span>
                        </div>
                    </div>
                    <div v-if="$game.selectedBinBatches.length === 0" class="text-center text-gray-500 py-6">
                        此區間目前沒有資料
                    </div>
                </div>
                
                <div class="flex justify-end mt-4 pt-4 border-t border-gray-700">
                    <button @click="$game.closeBinModal" class="px-6 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg font-bold transition">關閉</button>
                </div>
            </div>
        </div>
</template>

<script>
export default {
    name: 'BinModal',
    inject: ['$game']
}
</script>
