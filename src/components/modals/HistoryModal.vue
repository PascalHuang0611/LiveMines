<template>
        <!-- ================= 歷史紀錄詳情彈跳視窗 (Modal) ================= -->
        <div v-if="$game.selectedHistoryRecord" @click.self="$game.closeHistoryModal" class="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm animate-fade-in">
            <div class="bg-gray-800 border border-gray-600 rounded-2xl p-6 w-full max-w-md max-h-[90vh] overflow-y-auto relative shadow-2xl">
                <!-- 關閉按鈕 -->
                <button @click="$game.closeHistoryModal" class="absolute top-4 right-4 text-gray-400 hover:text-white text-3xl font-bold leading-none">&times;</button>
                
                <h2 class="text-2xl font-bold text-yellow-400 mb-4 border-b border-gray-700 pb-2 flex flex-col sm:flex-row sm:justify-between sm:items-end gap-2">
                    <span>局數 #{{ $game.selectedHistoryRecord.round }} 詳情</span>
                    <span v-if="$game.selectedHistoryRecord.csvInfo" class="text-xs text-gray-400 font-normal bg-gray-900 px-2 py-1 rounded border border-gray-700 text-right">
                        🗄️ CSV: V{{ $game.selectedHistoryRecord.csvInfo.version }} / R{{ $game.selectedHistoryRecord.csvInfo.round }} / Idx: {{ $game.selectedHistoryRecord.csvInfo.index }}
                    </span>
                    <span v-else class="text-xs text-gray-400 font-normal bg-gray-900 px-2 py-1 rounded border border-gray-700 text-right">
                        🎲 來源: 理論隨機
                    </span>
                </h2>

                <!-- 該局的 9 宮格還原 -->
                <div class="grid grid-cols-3 grid-rows-3 gap-2 mb-6 aspect-square max-w-xs mx-auto w-full">
                    <div v-for="grid in $game.selectedHistoryRecord.finalGridsState" :key="grid.id" 
                         :class="['grid-cell relative overflow-hidden border-2 border-gray-600 rounded-xl flex flex-col items-center justify-center p-1', grid.betAmount > 0 ? 'selected' : 'bg-gray-800']">
                        
                        <div v-if="grid.betAmount > 0" class="absolute top-1 left-1 w-2 h-2 bg-blue-500 rounded-full shadow-[0_0_8px_#3b82f6] z-0"></div>
                        <span class="text-gray-500 font-bold text-lg absolute top-1 right-2 opacity-50 z-0">{{ grid.id }}</span>

                        <div class="flex flex-col items-center justify-center h-full space-y-1 z-10 w-full">
                            <!-- 押注金額 -->
                            <div v-if="grid.betAmount > 0" class="text-yellow-300 font-bold text-[10px] bg-gray-800/80 px-1.5 py-0.5 rounded border border-yellow-700 text-center w-[90%] truncate">
                                💰 {{ grid.betAmount }}
                            </div>
                            <div v-if="grid.balls > 0" class="ball-badge relative flex items-center justify-center bg-gradient-to-br from-red-400 to-red-600 text-white font-bold rounded-full w-6 h-6 shadow-[0_0_8px_rgba(239,68,68,0.8)] border border-red-400 flex-shrink-0">
                                <div class="absolute top-1 left-1 w-1 h-1 bg-white rounded-full opacity-50 shadow-inner"></div>
                                <span class="text-[10px] z-10">x{{ grid.balls }}</span>
                            </div>
                            <div v-if="grid.baseLightning > 0" class="text-yellow-400 font-bold text-[10px] sm:text-xs bg-yellow-900/80 px-1 py-0.5 rounded border border-yellow-600 w-[95%] text-center truncate shadow-sm">
                                ⚡ 免費: +{{ grid.baseLightning }}x
                            </div>
                            <div v-if="grid.purchasedLightning > 0" class="text-purple-400 font-bold text-[10px] sm:text-xs bg-purple-900/80 px-1 py-0.5 rounded border border-purple-600 w-[95%] text-center truncate shadow-sm">
                                ⚡ 付費: +{{ grid.purchasedLightning }}x
                            </div>
                        </div>
                    </div>
                </div>

                <!-- 該局結算明細 -->
                <div class="space-y-3 font-mono text-sm sm:text-base mb-4">
                    <!-- Modal 內的 Bonus 結算顯示 -->
                    <div v-if="$game.selectedHistoryRecord.bonusTriggered" class="p-3 rounded mb-2 text-center font-bold text-sm"
                         :class="$game.selectedHistoryRecord.bonusSuccess ? 'bg-yellow-600 text-white shadow-[0_0_10px_rgba(202,138,4,0.5)]' : 'bg-red-900/80 text-gray-300 border border-red-700'">
                        <div v-if="$game.selectedHistoryRecord.bonusSuccess">
                            🎉 BONUS 挑戰成功！<br>
                            {{ $game.selectedHistoryRecord.bonusResultText }} : <span class="text-lg">+{{ $game.selectedHistoryRecord.bonusWin }}</span>
                            <div v-if="$game.selectedHistoryRecord.jpWin > 0" class="mt-1 text-pink-300 text-base animate-bounce">
                                💎 獨得 JP 累積池！ +{{ $game.selectedHistoryRecord.jpWin.toFixed(2) }}
                            </div>
                        </div>
                        <div v-else>
                            💥 BONUS 挑戰失敗...<br>
                            <span class="text-gray-400 font-normal">{{ $game.selectedHistoryRecord.bonusResultText }}</span>
                            <div v-if="$game.selectedHistoryRecord.bonusFailDetails" class="text-xs text-red-300 mt-2 border-t border-red-800/50 pt-2">
                                您選擇了 [{{ $game.selectedHistoryRecord.bonusFailDetails.pick }}] 號位<br>
                                此層安全位置為: {{ $game.selectedHistoryRecord.bonusFailDetails.safe.join(', ') }}
                            </div>
                        </div>
                        
                        <!-- 各層開獎紀錄 -->
                        <div v-if="$game.selectedHistoryRecord.bonusLevelHistory" class="text-xs text-left mt-3 border-t border-white/20 pt-2 space-y-1 font-mono">
                            <div v-for="lvl in $game.selectedHistoryRecord.bonusLevelHistory" :key="lvl.level" class="flex justify-between items-center bg-black/30 p-1.5 rounded" :class="lvl.passed ? 'border-l-2 border-green-400' : 'border-l-2 border-red-400'">
                                <span class="text-gray-200">第{{ lvl.level }}層</span>
                                <span class="text-gray-200">選[{{ lvl.pick }}]</span>
                                <span class="text-gray-300">安全:{{ lvl.safe.join(',') }}</span>
                                <span :class="lvl.passed ? 'text-green-300' : 'text-red-400'">{{ lvl.passed ? '✔ 過關' : '✖ 觸雷' }}</span>
                            </div>
                        </div>
                    </div>

                    <!-- 手動模式：顯示各別格子的總結算明細 -->
                    <template v-if="!$game.selectedHistoryRecord.agentDetails">
                        <div v-for="detail in $game.selectedHistoryRecord.details" :key="detail.grid" class="flex justify-between items-center bg-gray-900 p-2 rounded">
                            <span class="text-gray-300">格子 [{{ detail.grid }}] (中 {{ detail.balls }} 球)</span>
                            <div class="text-right">
                                <span class="text-gray-400 text-xs block">
                                    ({{ detail.betAmount }} × {{ detail.basePayout }}) × (1 + {{ detail.baseL }} + {{ detail.purchasedL }})
                                </span>
                                <span class="text-green-400 font-bold">+{{ detail.win }}</span>
                            </div>
                        </div>
                        <div v-if="$game.selectedHistoryRecord.details.length === 0 && !$game.selectedHistoryRecord.bonusTriggered" class="text-center text-gray-500 py-2">
                            本局沒有押中任何獎項...
                        </div>
                    </template>

                    <!-- Agent Traffic 模式：玩家盈虧排行榜 (Milestone 10) -->
                    <template v-else>
                        <div class="mt-6 mb-2 flex items-center justify-between border-b border-gray-700 pb-2">
                            <h3 class="text-lg font-bold text-gray-200">🏆 本局玩家盈虧排行榜</h3>
                            <span class="text-xs text-gray-500">共 {{ $game.selectedHistoryRecord.agentDetails.length }} 名玩家</span>
                        </div>
                        
                        <div class="bg-gray-900 rounded-lg p-2 max-h-[30vh] overflow-y-auto space-y-2 custom-scrollbar">
                            <div v-for="(agent, idx) in sortedAgentDetails" :key="agent.agentId" 
                                 class="flex flex-col sm:flex-row justify-between sm:items-center p-2 rounded border-l-4 bg-gray-800/50"
                                 :class="agent.netProfit > 0 ? 'border-green-500' : (agent.netProfit < 0 ? 'border-red-500' : 'border-gray-500')">
                                
                                <div class="flex items-center gap-2 mb-1 sm:mb-0">
                                    <span class="text-xs text-gray-500 w-5 text-right font-bold">#{{ idx + 1 }}</span>
                                    <span class="font-mono text-sm text-gray-300 w-24 truncate" :title="agent.agentId">{{ agent.agentId }}</span>
                                    <span v-if="agent.vipGroup" class="px-1 py-0.5 rounded text-[9px] font-bold" :class="getVipClass(agent.vipGroup)">{{ agent.vipGroup }}</span>
                                    
                                    <!-- Persona 翻譯與提示 -->
                                    <span class="px-1.5 py-0.5 rounded text-[10px] whitespace-nowrap text-white font-bold opacity-80"
                                          :style="{ backgroundColor: getPersonaColor(agent.persona) }">
                                        {{ formatPersonaName(agent.persona) }}
                                    </span>
                                </div>
                                
                                <div class="flex items-center gap-4 text-xs font-mono w-full sm:w-auto justify-between sm:justify-end">
                                    <div class="text-gray-400 flex items-center gap-1">
                                        <span v-if="agent.buyLightning" title="已購買付費閃電" class="text-yellow-400">⚡</span>
                                        <span v-if="agent.bonusWin > 0" title="Bonus 通關獎金" class="text-purple-400">🎯</span>
                                        <span v-if="agent.jpWin > 0" title="獨得 JP 分紅" class="text-pink-400">💎</span>
                                        投入: {{ agent.cost.toFixed(2) }}
                                    </div>
                                    <div class="text-right w-20">
                                        <span :class="agent.netProfit > 0 ? 'text-green-400 font-bold' : (agent.netProfit < 0 ? 'text-red-400' : 'text-gray-400')">
                                            {{ agent.netProfit > 0 ? '+' : '' }}{{ agent.netProfit.toFixed(2) }}
                                        </span>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </template>
                </div>

                <!-- 結算總計 -->
                <div class="border-t border-gray-600 pt-4 flex justify-between items-end">
                    <div>
                        <p class="text-gray-400 text-sm">投入: <span class="text-red-400">{{ $game.selectedHistoryRecord.cost }}</span></p>
                        <p class="text-gray-400 text-sm">派彩: <span class="text-green-400">{{ $game.selectedHistoryRecord.totalWin }}</span></p>
                    </div>
                    <div class="text-right">
                        <p class="text-sm text-gray-400 mb-1">該局淨利</p>
                        <p :class="$game.selectedHistoryRecord.netProfit >= 0 ? 'text-green-400' : 'text-red-400'" class="text-2xl font-bold">
                            {{ $game.selectedHistoryRecord.netProfit >= 0 ? '+' : '' }}{{ $game.selectedHistoryRecord.netProfit }}
                        </p>
                    </div>
                </div>
            </div>
        </div>
</template>

<script>
export default {
    name: 'HistoryModal',
    inject: ['$game'],
    computed: {
        sortedAgentDetails() {
            const record = this.$game.selectedHistoryRecord;
            if (!record || !record.agentDetails) return [];
            return [...record.agentDetails].sort((a, b) => b.netProfit - a.netProfit);
        }
    },
    methods: {
        getVipClass(vipGroup) {
            if (!vipGroup) return 'bg-gray-700 text-gray-300';
            const num = parseInt(vipGroup.replace('V', ''));
            if (num >= 8) return 'bg-gradient-to-r from-yellow-400 to-yellow-600 text-black shadow-[0_0_8px_rgba(234,179,8,0.5)]';
            if (num >= 5) return 'bg-gradient-to-r from-purple-400 to-purple-600 text-white';
            if (num >= 2) return 'bg-gradient-to-r from-blue-400 to-blue-600 text-white';
            return 'bg-gray-600 text-gray-300';
        },
        formatPersonaName(persona) {
            if (persona === 'persona_casual_tourist') return '觀光客';
            const stats = this.$game.trafficPersonaStats;
            if (stats && stats[persona]) {
                return stats[persona].personaNameZH || persona;
            }
            return persona;
        },
        getPersonaColor(persona) {
            if (persona === 'persona_casual_tourist') return '#9ca3af'; // gray-400
            const stats = this.$game.trafficPersonaStats;
            if (stats && stats[persona] && stats[persona].color) {
                return stats[persona].color;
            }
            return '#6366f1'; // default indigo
        }
    }
}
</script>

<style scoped>
.custom-scrollbar::-webkit-scrollbar {
    width: 6px;
}
.custom-scrollbar::-webkit-scrollbar-track {
    background: rgba(0, 0, 0, 0.2);
    border-radius: 4px;
}
.custom-scrollbar::-webkit-scrollbar-thumb {
    background: rgba(255, 255, 255, 0.2);
    border-radius: 4px;
}
.custom-scrollbar::-webkit-scrollbar-thumb:hover {
    background: rgba(255, 255, 255, 0.4);
}
</style>
