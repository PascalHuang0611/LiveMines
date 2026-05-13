<template>
<!-- ================= 右側欄：歷史紀錄 ================= -->
    <div class="w-full xl:w-[350px] flex flex-col gap-6 shrink-0 order-3 xl:order-3">
        <!-- Milestone 4: Agent 人流狀態 -->
        <div v-if="$game.simulationMode === 'agentTraffic'" class="bg-gray-800 rounded-xl p-6 border border-gray-700 shadow-lg border-t-4 border-t-blue-500 flex flex-col animate-fade-in">
            <h3 class="text-lg font-bold text-white mb-4 border-b border-gray-600 pb-2 flex justify-between items-center">
                <span>⏱️ 當前時鐘 (Runtime)</span>
                <span class="text-sm font-mono text-blue-400 font-bold">Day {{ $game.trafficCurrentDay }}</span>
            </h3>
            
            <div class="flex items-center justify-between bg-gray-900 p-4 rounded-lg mb-4 shadow-inner border border-gray-700">
                <span class="text-gray-400 font-bold text-sm">目前時間</span>
                <span class="text-3xl font-mono font-bold text-white tracking-widest" style="text-shadow: 0 0 10px rgba(59,130,246,0.8);">{{ $game.trafficTimeOfDay }}</span>
            </div>

            <div @click="$game.openActiveAgentsModal()"
                 class="flex items-center justify-between bg-black/40 p-3 rounded-lg border border-gray-700/50 cursor-pointer hover:bg-gray-700 transition transform hover:scale-[1.02] group">
                <span class="text-[11px] text-gray-400 uppercase tracking-wider font-bold group-hover:text-white transition">本局 Active Agents</span>
                <span class="text-lg font-mono font-bold" :class="$game.currentActiveAgents.length > 0 ? 'text-green-400' : 'text-gray-500'">
                    {{ $game.currentActiveAgents.length }} <span class="text-[10px] text-gray-600 font-normal">人在線</span>
                    <span v-if="$game.currentActiveAgents.length > 0" class="inline-block ml-1 text-blue-400 text-xs">🔍</span>
                </span>
            </div>
            
            <div class="mt-3 text-[10px] text-gray-500 text-center italic">
                * 請按左下方「開始跑 N 局」推進時間 *
            </div>
        </div>

        <div class="bg-gray-800 rounded-xl p-6 border border-gray-700 shadow-lg h-full flex flex-col">
            <h3 class="text-xl font-bold text-white mb-4 border-b border-gray-600 pb-2">📜 歷史紀錄</h3>
            
            <!-- 歷史紀錄篩選器 -->
            <div class="flex flex-col gap-2 mb-3 bg-gray-900 p-2 rounded-lg">
                <div class="flex gap-2">
                    <button @click="$game.historyFilter = 'all'" :class="$game.historyFilter === 'all' ? 'bg-blue-600 text-white' : 'bg-gray-800 text-gray-400 hover:bg-gray-700'" class="px-3 py-1.5 rounded text-xs font-bold transition flex-1">全部</button>
                    <button @click="$game.historyFilter = 'win'" :class="$game.historyFilter === 'win' ? 'bg-green-600 text-white' : 'bg-gray-800 text-gray-400 hover:bg-gray-700'" class="px-3 py-1.5 rounded text-xs font-bold transition flex-1">{{ $game.simulationMode === 'agentTraffic' ? '玩家有淨利' : '有贏分' }}</button>
                    <button @click="$game.historyFilter = 'bonus'" :class="$game.historyFilter === 'bonus' ? 'bg-yellow-600 text-white' : 'bg-gray-800 text-gray-400 hover:bg-gray-700'" class="px-3 py-1.5 rounded text-xs font-bold transition flex-1">有 BONUS</button>
                </div>
                <div class="flex gap-2">
                    <button @click="$game.historyFilter = 'bonus_pass'" :class="$game.historyFilter === 'bonus_pass' ? 'bg-purple-600 text-white' : 'bg-gray-800 text-gray-400 hover:bg-gray-700'" class="px-3 py-1.5 rounded text-xs font-bold transition flex-1">BONUS 且有通關</button>
                    <button @click="$game.historyFilter = 'jp'" :class="$game.historyFilter === 'jp' ? 'bg-pink-600 text-white' : 'bg-gray-800 text-gray-400 hover:bg-gray-700'" class="px-3 py-1.5 rounded text-xs font-bold transition flex-1">有 JP</button>
                </div>
                <!-- 新增局數範圍篩選 -->
                <div class="flex gap-2 items-center mt-1 border-t border-gray-700 pt-2">
                    <span class="text-gray-400 text-xs whitespace-nowrap">局數:</span>
                    <input type="number" v-model.number="$game.filterStartRound" placeholder="起" class="w-full bg-gray-800 border border-gray-600 rounded px-2 py-1 text-white text-xs outline-none focus:border-blue-500 transition">
                    <span class="text-gray-400 text-xs">-</span>
                    <input type="number" v-model.number="$game.filterEndRound" placeholder="迄" class="w-full bg-gray-800 border border-gray-600 rounded px-2 py-1 text-white text-xs outline-none focus:border-blue-500 transition">
                    <button @click="$game.filterStartRound=null; $game.filterEndRound=null" class="bg-gray-700 hover:bg-gray-600 text-gray-300 px-2 py-1 rounded text-xs whitespace-nowrap transition">清除</button>
                </div>
                <!-- 排序功能 -->
                <div class="flex gap-2 items-center mt-1 border-t border-gray-700 pt-2">
                    <span class="text-gray-400 text-xs whitespace-nowrap">排序:</span>
                    <select v-model="$game.historySortMethod" class="w-full bg-gray-800 border border-gray-600 rounded px-2 py-1 text-white text-xs outline-none focus:border-blue-500 transition cursor-pointer">
                        <option value="time_desc">最新紀錄優先</option>
                        <option value="value_desc">{{ $game.simulationMode === 'agentTraffic' ? '玩家淨利 (大到小)' : '贏分 (大到小)' }}</option>
                        <option value="value_asc">{{ $game.simulationMode === 'agentTraffic' ? '玩家淨利 (小到大)' : '贏分 (小到大)' }}</option>
                    </select>
                </div>
            </div>

            <!-- 歷史紀錄列表 -->
            <div class="overflow-y-auto pr-2 space-y-2 font-mono text-sm relative custom-scrollbar" style="height: 2400px;">
                <!-- 根據篩選結果顯示，最多渲染 200 筆以防卡頓 -->
                <div v-for="(record, index) in $game.displayHistory" :key="record.round"
                     @click="$game.openHistoryModal(record)"
                     class="bg-gray-900 p-3 rounded border-l-4 cursor-pointer hover:bg-gray-700 transition transform hover:scale-[1.01]" 
                     :class="record.netProfit >= 0 ? 'border-green-500' : 'border-gray-600'">
                    <div class="flex justify-between items-center mb-1">
                        <span class="text-gray-300 font-bold">#{{ record.round }}</span>
                        <div class="flex space-x-2">
                            <span v-if="record.jpWin > 0" class="text-[10px] bg-pink-600 text-white px-2 py-0.5 rounded shadow-[0_0_8px_rgba(219,39,119,0.6)]">💎 JP WIN</span>
                            <span v-else-if="record.bonusTriggered && record.bonusSuccess" class="text-[10px] bg-yellow-600 text-white px-2 py-0.5 rounded shadow-[0_0_8px_rgba(202,138,4,0.6)]">BONUS WIN</span>
                            <span v-if="record.bonusTriggered && !record.bonusSuccess" class="text-[10px] bg-red-800 text-white px-2 py-0.5 rounded border border-red-600">BONUS FAIL</span>
                        </div>
                    </div>
                    <div class="flex justify-between text-gray-400 text-xs">
                        <span>投入: {{ record.cost }}</span>
                        <span>派彩: <span :class="record.netProfit >= 0 ? 'text-green-400' : 'text-gray-300'">{{ record.totalWin }}</span></span>
                        <span>淨利: <span :class="record.netProfit >= 0 ? 'text-green-400 font-bold' : 'text-red-400'">{{ record.netProfit >= 0 ? '+' : '' }}{{ record.netProfit }}</span></span>
                    </div>
                    <div class="flex justify-between items-center text-[10px] text-gray-500 mt-1">
                        <span v-if="record.csvInfo" class="bg-gray-800 px-2 py-0.5 rounded border border-gray-700 text-[9px]" title="版本 / 批次 / 索引">
                            🗄️ V{{ record.csvInfo.version }} | R{{ record.csvInfo.round }} | Idx: {{ record.csvInfo.index }}
                        </span>
                        <span v-else class="bg-gray-800 px-2 py-0.5 rounded border border-gray-700 text-[9px]">
                            🎲 理論隨機
                        </span>
                        <span class="italic ml-auto">點擊查看詳情 👆</span>
                    </div>
                </div>
                
                <!-- 狀態提示文字 -->
                <div v-if="$game.filteredHistory.length > $game.historyDisplayLimit" class="text-center text-xs text-gray-500 py-3">
                    ...僅顯示首 {{ $game.historyDisplayLimit }} 筆 (符合條件共 {{ $game.filteredHistory.length }} 筆)...
                </div>
                
                <!-- 自定義顯示筆數 -->
                <div v-if="$game.history.length > 0" class="flex flex-col items-center justify-center py-4 gap-2 border-t border-gray-800 mt-2">
                    <label class="text-xs text-gray-400">顯示筆數 (過多可能導致卡頓)</label>
                    <input type="number" v-model.number="$game.historyDisplayLimit" min="10" step="50" class="bg-gray-800 border border-gray-600 rounded px-3 py-1 text-white text-sm outline-none focus:border-blue-500 w-24 text-center">
                </div>

                <div v-if="$game.filteredHistory.length === 0 && $game.history.length > 0" class="text-center text-gray-500 py-8">
                    沒有符合篩選條件的紀錄
                </div>
                <div v-if="$game.history.length === 0" class="text-center text-gray-500 py-8">
                    尚未有任何遊戲紀錄
                </div>
            </div>
        </div>
    </div>
</template>

<script>
export default {
    name: 'RightSidebar',
    inject: ['$game']
}
</script>
