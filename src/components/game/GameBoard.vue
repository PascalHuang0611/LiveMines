<template>
<!-- ================= 中間欄：遊戲主體 ================= -->
            <div class="w-full xl:flex-1 max-w-2xl mx-auto flex flex-col order-1 xl:order-2">
                
                <!-- 標題與設定按鈕 -->
                <div class="flex justify-between items-center mb-6">
                    <h1 class="text-3xl font-bold text-yellow-400 mx-auto xl:mx-0">⚡ LiveMines 終局之戰 ⚡</h1>
                    <div class="absolute right-4 top-8 xl:static xl:right-auto xl:top-auto flex gap-2 z-10">
                        <button @click="$game.clearData" class="bg-red-600 hover:bg-red-500 text-white font-bold py-2 px-2 sm:px-4 rounded-lg shadow-lg transition transform active:scale-95 text-sm flex items-center gap-1 sm:gap-2">
                            <span>🗑️</span> <span class="hidden sm:inline">清除資料</span>
                        </button>
                        <button @click="$game.openConfigModal" class="bg-blue-600 hover:bg-blue-500 text-white font-bold py-2 px-2 sm:px-4 rounded-lg shadow-lg transition transform active:scale-95 text-sm flex items-center gap-1 sm:gap-2">
                            <span>⚙️</span> <span class="hidden sm:inline">參數設定</span>
                        </button>
                    </div>
                </div>

                <!-- 控制面板 (押注設定) -->
                <div class="bg-gray-800 rounded-xl p-5 mb-6 border border-gray-700 shadow-lg">
                    <div class="flex flex-col sm:flex-row justify-between items-center gap-4">
                        <div class="space-y-3 w-full">
                            <div class="flex flex-wrap items-center gap-3">
                                <!-- 預設單格金額輸入 -->
                                <div class="flex items-center gap-2 bg-gray-900 px-3 py-1.5 rounded-lg border border-gray-600">
                                    <span class="text-gray-400 text-sm whitespace-nowrap">預設單格金額:</span>
                                    <input type="number" v-model.number="$game.defaultBetUnit" min="0" step="100"
                                           :disabled="$game.simulationMode === 'agentTraffic'"
                                           class="w-24 bg-gray-800 border border-yellow-600 rounded px-2 py-1 text-yellow-400 font-bold text-sm outline-none focus:border-yellow-400 transition text-center disabled:opacity-50">
                                </div>
                                <button @click="$game.toggleAllBets" :disabled="$game.isPlaying || $game.simulationMode === 'agentTraffic'"
                                        class="bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-xs font-bold px-3 py-1.5 rounded shadow transition">
                                    {{ $game.isAllSelected ? '取消全選' : '全選 9 格' }}
                                </button>
                                <button @click="$game.grids.forEach(g => g.betAmount = 0)" :disabled="$game.isPlaying || $game.simulationMode === 'agentTraffic'"
                                        class="bg-gray-600 hover:bg-gray-500 disabled:opacity-50 text-white text-xs font-bold px-3 py-1.5 rounded shadow transition">
                                    清空所有
                                </button>
                            </div>
                            <label class="flex items-center space-x-3 cursor-pointer">
                                <input type="checkbox" v-model="$game.buyExtraLightning" :disabled="$game.simulationMode === 'agentTraffic'" class="form-checkbox h-5 w-5 text-blue-600 rounded disabled:opacity-50 disabled:cursor-not-allowed">
                                <span class="text-white font-medium text-lg" :class="{ 'opacity-50': $game.simulationMode === 'agentTraffic' }">購買額外閃電 (加收 {{ ($game.appConfig.mainGame.extraPurchaseCostPercent * 100) }}% 總押注)</span>
                            </label>
                        </div>
                        
                        <div class="text-right bg-gray-900 p-3 rounded-lg min-w-[150px]">
                            <p class="text-sm text-gray-400">本局總成本</p>
                            <p class="text-2xl font-bold text-red-400">-{{ $game.totalCost }}</p>
                        </div>
                    </div>
                </div>

                <!-- 9宮格遊戲區 -->
                <div class="grid grid-cols-3 grid-rows-3 gap-2 sm:gap-3 mb-6 aspect-square max-w-md mx-auto w-full">
                    <div v-for="grid in $game.grids" :key="grid.id"
                         @click="$game.simulationMode === 'agentTraffic' ? $game.openGridDetails(grid.id) : null"
                         :class="['grid-cell relative overflow-hidden border-2 rounded-xl flex flex-col items-center justify-center p-1 sm:p-2',
                                  grid.betAmount > 0 ? 'selected' : 'bg-gray-800 border-gray-600',
                                  $game.simulationMode === 'agentTraffic' ? 'cursor-pointer hover:border-blue-500 hover:bg-gray-700 transition-colors' : '']">
                        
                        <!-- 格子編號 -->
                        <span class="text-gray-500 font-bold text-lg absolute top-1 right-2 opacity-40 z-0">{{ grid.id }}</span>

                        <!-- 押注金額輸入框 -->
                        <input
                            type="number" min="0" step="100"
                            v-model.number="grid.betAmount"
                            :disabled="$game.isPlaying || $game.simulationMode === 'agentTraffic'"
                            @click.stop
                            class="w-[82%] text-center font-bold text-sm rounded bg-gray-900 border px-1 py-1 outline-none z-10 transition"
                            :class="grid.betAmount > 0
                                ? 'border-yellow-500 text-yellow-300 shadow-[0_0_8px_rgba(234,179,8,0.5)]'
                                : 'border-gray-600 text-gray-400'"
                            placeholder="0">

                        <!-- 動態開獎結果顯示 -->
                        <div class="flex flex-col items-center justify-center space-y-0.5 z-10 w-full mt-1">
                            <!-- 球 -->
                            <div v-if="grid.balls > 0" class="ball-badge relative flex items-center justify-center bg-gradient-to-br from-red-400 to-red-600 text-white font-bold rounded-full w-8 h-8 sm:w-9 sm:h-9 shadow-[0_0_10px_rgba(239,68,68,0.8)] border border-red-400 flex-shrink-0">
                                <div class="absolute top-1 left-1.5 w-2 h-2 bg-white rounded-full opacity-50 shadow-inner"></div>
                                <span class="text-xs sm:text-sm z-10">x{{ grid.balls }}</span>
                            </div>
                            
                            <!-- 基礎閃電 -->
                            <div v-if="grid.baseLightning > 0" class="text-yellow-400 font-bold text-[10px] bg-yellow-900/80 px-1 py-0.5 rounded border border-yellow-600 w-[95%] text-center truncate shadow-sm">
                                ⚡ 免費: +{{ grid.baseLightning }}x
                            </div>

                            <!-- 購買閃電 -->
                            <div v-if="grid.purchasedLightning > 0" class="text-purple-400 font-bold text-[10px] bg-purple-900/80 px-1 py-0.5 rounded border border-purple-600 w-[95%] text-center truncate shadow-sm">
                                ⚡ 付費: +{{ grid.purchasedLightning }}x
                            </div>
                        </div>
                    </div>
                </div>

                <!-- 操作按鈕與進度條區塊 -->
                <div class="w-full flex flex-col gap-4 mt-2 mb-6">
                    <div class="flex flex-col sm:flex-row justify-center gap-4 w-full">
                        <!-- 單局開獎按鈕 -->
                        <button @click="$game.runSimulations(1)" :disabled="($game.totalCost === 0 && $game.simulationMode === 'manual') || $game.isPlaying"
                                class="w-full sm:w-36 sm:flex-none bg-gradient-to-r from-green-500 to-emerald-600 hover:from-green-400 hover:to-emerald-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold py-4 px-2 rounded-xl text-lg shadow-lg transform transition active:scale-95 whitespace-nowrap">
                            {{ $game.isPlaying ? '開獎中...' : '單局開獎' }}
                        </button>
                        <div class="flex flex-1 gap-3 w-full">
                            <!-- 執行局數輸入框 -->
                            <div class="relative flex-1">
                                <span class="absolute top-[-20px] left-1 text-xs text-gray-400">執行局數</span>
                                <input type="number" v-model.number="$game.simRounds" min="1" :max="$game.appConfig.simulationRuns"
                                       class="w-full h-full bg-gray-800 border border-purple-500 text-center text-2xl font-bold text-white rounded-xl focus:outline-none focus:border-indigo-400 shadow-inner px-2">
                            </div>
                            <!-- 自動開獎按鈕 -->
                            <button @click="$game.startBatchSimulations" :disabled="($game.totalCost === 0 && $game.simulationMode === 'manual') || $game.isPlaying || $game.simRounds < 1"
                                    class="w-32 sm:w-48 sm:flex-none bg-gradient-to-r from-purple-500 to-indigo-600 hover:from-purple-400 hover:to-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold py-4 px-2 rounded-xl text-lg sm:text-xl shadow-lg transform transition active:scale-95 whitespace-nowrap">
                                {{ $game.isPlaying ? '開獎中...' : '自動開獎' }}
                            </button>
                        </div>
                    </div>

                    <!-- 進度條 -->
                    <div v-if="$game.isPlaying && $game.simRounds > 1" class="w-full bg-gray-800 rounded-full h-6 border border-gray-700 overflow-hidden relative shadow-inner">
                        <div class="h-full bg-indigo-500 progress-bar-stripes transition-all duration-200" :style="{ width: $game.progressPercent + '%' }"></div>
                        <div class="absolute inset-0 flex items-center justify-center text-xs font-bold text-white drop-shadow-md">
                            執行中... {{ $game.simulatedCount }} / {{ $game.totalSimToRun }} ({{ $game.progressPercent.toFixed(1) }}%)
                        </div>
                    </div>
                </div>

                <!-- 二級玩法進階設定區塊 -->
                <div class="bg-gray-800 rounded-xl p-5 border border-gray-700 shadow-lg flex flex-col gap-4 w-full">
                    <h3 class="text-lg font-bold text-yellow-400 border-b border-gray-700 pb-2 flex items-center gap-2">
                        <span>🎯 BONUS 闖關設定</span>
                    </h3>

                    <!-- 二級玩法目標選擇 -->
                    <div class="flex flex-col sm:flex-row items-center justify-between bg-gray-900 p-3 rounded-lg border border-gray-700" :class="{ 'opacity-50': $game.simulationMode === 'agentTraffic' }">
                        <div class="text-gray-300 font-medium mb-2 sm:mb-0">
                            二級玩法目標 (收手層數):
                            <p class="text-xs text-gray-500 mt-1">若觸發 BONUS，系統將模擬闖關至此層級。</p>
                        </div>
                        <select v-model="$game.bonusTargetLevel" :disabled="$game.simulationMode === 'agentTraffic'" class="bg-gray-800 text-yellow-400 border border-gray-600 rounded-lg px-4 py-2 font-bold cursor-pointer hover:bg-gray-700 outline-none focus:border-yellow-500 disabled:cursor-not-allowed">
                            <option v-for="(payout, idx) in $game.appConfig.bonusGame.levelSettings.payouts" :key="idx" :value="idx + 1">
                                第 {{ idx + 1 }} 層 ({{ payout }}倍)
                            </option>
                        </select>
                    </div>

                    <!-- 二級玩法拔牌位置選擇 -->
                    <div class="bg-gray-900 p-4 rounded-lg border border-gray-700">
                        <p class="text-gray-300 font-medium mb-3 border-b border-gray-700 pb-2">設定闖關拔牌位置:</p>
                        <div class="grid gap-3">
                            <div v-for="level in $game.bonusTargetLevel" :key="level" class="flex items-center justify-between">
                                <span class="text-sm text-gray-400 font-bold w-16">第 {{ level }} 層</span>
                                <div class="flex space-x-2">
                                    <button v-for="pos in $game.appConfig.bonusGame.levelSettings.totalChoices[level-1]" :key="pos"
                                            @click="$game.bonusPositions[level-1] = pos"
                                            :disabled="$game.simulationMode === 'agentTraffic'"
                                            :class="$game.bonusPositions[level-1] === pos ? 'bg-yellow-500 text-black shadow-[0_0_8px_rgba(234,179,8,0.6)] scale-110' : 'bg-gray-700 text-gray-300 hover:bg-gray-600'"
                                            class="w-10 h-10 rounded-lg font-bold text-lg transition-all border border-gray-600 disabled:opacity-50 disabled:cursor-not-allowed">
                                        {{ pos }}
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                <!-- ================= 數據來源設定 ================= -->
                <div class="bg-gray-800 rounded-xl p-5 mt-6 border border-gray-700 shadow-lg">
                    <h3 class="text-lg font-bold text-yellow-400 border-b border-gray-700 pb-2 mb-3 flex items-center gap-2">
                        <span>🗄️ 落球數據來源設定</span>
                    </h3>
                    <div class="flex flex-col sm:flex-row gap-4 mb-4">
                        <label class="flex items-center space-x-2 cursor-pointer p-3 bg-gray-900 rounded-lg border border-gray-600 flex-1 hover:bg-gray-700 transition"
                               :class="{'border-blue-500 shadow-[0_0_8px_rgba(59,130,246,0.5)]': $game.dataSourceMode === 'theoretical'}">
                            <input type="radio" v-model="$game.dataSourceMode" value="theoretical" class="form-radio text-blue-500 w-5 h-5">
                            <span class="text-white font-bold">理論隨機 (純數學)</span>
                        </label>
                        <label class="flex items-center space-x-2 cursor-pointer p-3 bg-gray-900 rounded-lg border border-gray-600 flex-1 hover:bg-gray-700 transition"
                               :class="{'border-green-500 shadow-[0_0_8px_rgba(34,197,94,0.5)]': $game.dataSourceMode === 'csv'}">
                            <input type="radio" v-model="$game.dataSourceMode" value="csv" class="form-radio text-green-500 w-5 h-5">
                            <span class="text-white font-bold">真實物理數據 (CSV)</span>
                        </label>
                    </div>

                    <!-- CSV 專屬設定區塊 -->
                    <div v-if="$game.dataSourceMode === 'csv'" class="bg-gray-900 p-4 rounded-lg border border-gray-700 animate-fade-in">
                        <div class="flex flex-col gap-3">
                            <div class="flex flex-col gap-1">
                                <label class="text-xs text-gray-400">上傳 CSV 檔案 (格式: barrier_version, round, ball1, ball2, ball3)</label>
                                <input type="file" accept=".csv" @change="$game.handleFileUpload" class="text-sm text-gray-400 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-bold file:bg-blue-600 file:text-white hover:file:bg-blue-500 cursor-pointer outline-none">
                            </div>
                            
                            <div v-if="$game.csvData.length > 0" class="flex flex-col sm:flex-row gap-4 mt-2">
                                <div class="flex-1">
                                    <div class="flex justify-between items-center mb-1">
                                        <label class="block text-xs text-gray-400">選擇 Barrier Version (可多選)</label>
                                        <button v-if="$game.availableVersions.length > 0" @click="$game.toggleAllVersions" class="text-[10px] bg-blue-600 hover:bg-blue-500 text-white px-2 py-0.5 rounded transition">
                                            {{ $game.isAllVersionsSelected ? '取消全選' : '全選' }}
                                        </button>
                                    </div>
                                    <div class="max-h-[120px] overflow-y-auto bg-gray-800 border border-gray-600 rounded-lg p-2 flex flex-col gap-1 custom-scrollbar">
                                        <label v-for="v in $game.availableVersions" :key="'v-'+v" class="flex items-center space-x-2 cursor-pointer hover:bg-gray-700 p-1.5 rounded transition">
                                            <input type="checkbox" :value="v" v-model="$game.selectedVersions" @change="$game.updateAvailableRounds" class="form-checkbox text-blue-500 w-4 h-4 rounded">
                                            <span class="text-sm text-gray-300 font-bold">Version {{ v }}</span>
                                        </label>
                                        <div v-if="$game.availableVersions.length === 0" class="text-xs text-gray-500 text-center py-2">尚未載入資料</div>
                                    </div>
                                </div>
                                <div class="flex-1">
                                    <div class="flex justify-between items-center mb-1">
                                        <label class="block text-xs text-gray-400">選擇物理批次 Round (可多選)</label>
                                        <button v-if="$game.availableRounds.length > 0" @click="$game.toggleAllRounds" class="text-[10px] bg-green-600 hover:bg-green-500 text-white px-2 py-0.5 rounded transition">
                                            {{ $game.isAllRoundsSelected ? '取消全選' : '全選' }}
                                        </button>
                                    </div>
                                    <div class="max-h-[120px] overflow-y-auto bg-gray-800 border border-gray-600 rounded-lg p-2 flex flex-col gap-1 custom-scrollbar">
                                        <label v-for="r in $game.availableRounds" :key="'r-'+r" class="flex items-center space-x-2 cursor-pointer hover:bg-gray-700 p-1.5 rounded transition">
                                            <input type="checkbox" :value="r" v-model="$game.selectedRounds" @change="$game.resetCsvIndex" class="form-checkbox text-green-500 w-4 h-4 rounded">
                                            <span class="text-sm text-gray-300 font-bold">Round {{ r }}</span>
                                        </label>
                                        <div v-if="$game.availableRounds.length === 0" class="text-xs text-gray-500 text-center py-2">尚未載入資料</div>
                                    </div>
                                </div>
                            </div>
                            
                            <div v-if="$game.filteredCsvData.length > 0" class="text-green-400 text-sm mt-1 font-bold">
                                ✅ 成功篩選出 {{ $game.filteredCsvData.length }} 筆掉落數據！開獎時將依序循環讀取。
                            </div>
                            <div v-else-if="$game.csvData.length > 0" class="text-red-400 text-sm mt-1">
                                ⚠️ 查無符合條件的數據，請重新勾選 Version 與 Round。
                            </div>
                        </div>
                    </div>
                </div>

                <!-- ================= RTP 折線圖 ================= -->
                <div class="bg-gray-800 rounded-xl p-5 mt-6 border border-gray-700 shadow-lg relative">
                    <div class="flex justify-between items-center mb-3 border-b border-gray-700 pb-2">
                        <h3 class="text-lg font-bold text-yellow-400 flex items-center gap-2">
                            <span>📈 批次 RTP 走勢圖</span>
                        </h3>
                        <button @click="$game.openChartModal" :disabled="$game.displayBatches.length === 0" :class="{'opacity-50 cursor-not-allowed': $game.displayBatches.length === 0}" class="bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold px-3 py-1.5 rounded shadow transition flex items-center gap-1">
                            <span>🔍</span> <span class="hidden sm:inline">放大圖表</span>
                        </button>
                    </div>
                    <div class="relative w-full h-[300px]">
                        <canvas id="rtpChart"></canvas>
                    </div>
                </div>

                <!-- ================= RTP 分佈長條圖 ================= -->
                <div class="bg-gray-800 rounded-xl p-5 mt-6 border border-gray-700 shadow-lg relative">
                    <div class="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-3 border-b border-gray-700 pb-2 gap-2">
                        <div class="flex items-center gap-3">
                            <h3 class="text-lg font-bold text-yellow-400 flex items-center gap-2">
                                <span>📊 批次 RTP 分佈圖</span>
                            </h3>
                            <div class="flex items-center gap-2 bg-gray-900 px-2 py-1 rounded border border-gray-600">
                                <span class="text-xs text-gray-400">區間:</span>
                                <input type="number" v-model.number="$game.distributionBinSize" min="0.1" step="0.1" class="w-16 bg-gray-800 border border-gray-600 rounded px-1 py-0.5 text-white text-xs outline-none focus:border-blue-500 text-center transition">
                                <span class="text-xs text-gray-400">%</span>
                            </div>
                        </div>
                        <div class="flex items-center gap-3 w-full sm:w-auto justify-between sm:justify-end">
                            <span class="text-sm font-normal text-gray-400">總計: {{ $game.batches.length }} 個切片</span>
                            <button @click="$game.openDistributionChartModal" :disabled="$game.displayBatches.length === 0" :class="{'opacity-50 cursor-not-allowed': $game.displayBatches.length === 0}" class="bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold px-3 py-1.5 rounded shadow transition flex items-center gap-1">
                                <span>🔍</span> <span class="hidden sm:inline">放大圖表</span>
                            </button>
                        </div>
                    </div>
                    <div class="relative w-full h-[250px]">
                        <canvas id="rtpDistributionChart"></canvas>
                    </div>
                    <div class="text-center mt-2 text-xs text-gray-400">
                        💡 提示：點擊上方長條圖，可檢視該 RTP 區間內的所有批次列表。
                    </div>
                    
                    <!-- 統計數據 -->
                    <div class="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-2 text-center border-t border-gray-700 pt-4">
                        <div class="bg-gray-900 p-2 rounded-lg">
                            <p class="text-xs text-gray-400">最低 RTP</p>
                            <p class="text-lg font-bold text-red-400">{{ $game.minBatchRTP }}%</p>
                        </div>
                        <div class="bg-gray-900 p-2 rounded-lg">
                            <p class="text-xs text-gray-400">最高 RTP</p>
                            <p class="text-lg font-bold text-green-400">{{ $game.maxBatchRTP }}%</p>
                        </div>
                        <div class="bg-gray-900 p-2 rounded-lg">
                            <p class="text-xs text-gray-400">大於等於 100% 次數</p>
                            <p class="text-lg font-bold text-blue-400">{{ $game.batchesOver100Count }} 次</p>
                        </div>
                        <div class="bg-gray-900 p-2 rounded-lg">
                            <p class="text-xs text-gray-400">大於等於 100% 佔比</p>
                            <p class="text-lg font-bold text-purple-400">{{ $game.batchesOver100Percent }}%</p>
                        </div>
                    </div>
                </div>

            </div>
</template>

<script>
export default {
    name: 'GameBoard',
    inject: ['$game']
}
</script>
