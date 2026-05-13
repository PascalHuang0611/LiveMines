<template>
        <!-- ================= 歷史紀錄詳情彈跳視窗 (Modal) ================= -->
        <div v-if="$game.selectedHistoryRecord" @click.self="$game.closeHistoryModal" class="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm animate-fade-in">
            <div class="bg-gray-800 border border-gray-600 rounded-2xl p-6 w-full overflow-y-auto relative shadow-2xl flex flex-col md:flex-row gap-6 max-h-[95vh]"
                 :class="$game.selectedHistoryRecord.agentDetails ? 'max-w-5xl' : 'max-w-md'">
                 
                <!-- 關閉按鈕 -->
                <button @click="$game.closeHistoryModal" class="absolute top-4 right-4 text-gray-400 hover:text-white text-3xl font-bold leading-none z-10">&times;</button>
                
                <!-- 左欄：開獎結果與大盤 -->
                <div class="flex-1 flex flex-col min-w-[300px]">
                    <h2 class="text-2xl font-bold text-yellow-400 mb-4 border-b border-gray-700 pb-2 flex flex-col sm:flex-row sm:justify-between sm:items-end gap-2 shrink-0">
                        <span>局數 #{{ $game.selectedHistoryRecord.round }} 詳情</span>
                        <span v-if="$game.selectedHistoryRecord.csvInfo" class="text-xs text-gray-400 font-normal bg-gray-900 px-2 py-1 rounded border border-gray-700 text-right">
                            🗄️ CSV: V{{ $game.selectedHistoryRecord.csvInfo.version }} / R{{ $game.selectedHistoryRecord.csvInfo.round }} / Idx: {{ $game.selectedHistoryRecord.csvInfo.index }}
                        </span>
                        <span v-else class="text-xs text-gray-400 font-normal bg-gray-900 px-2 py-1 rounded border border-gray-700 text-right">
                            🎲 來源: 理論隨機
                        </span>
                    </h2>

                    <!-- 該局的 9 宮格還原 -->
                    <div class="grid grid-cols-3 grid-rows-3 gap-2 mb-6 aspect-square max-w-xs mx-auto w-full shrink-0">
                        <div v-for="grid in $game.selectedHistoryRecord.finalGridsState" :key="grid.id" 
                             @click="$game.selectedHistoryRecord.agentDetails ? (selectedHistoryGridId = grid.id) : null"
                             :class="['grid-cell relative border-2 rounded flex flex-col items-center justify-center p-1', 
                                      grid.betAmount > 0 ? getGridColorClass(grid) : 'bg-gray-800 border-gray-600',
                                      $game.selectedHistoryRecord.agentDetails ? 'cursor-pointer hover:border-white transition-colors' : '',
                                      selectedHistoryGridId === grid.id ? 'ring-2 ring-white shadow-[0_0_15px_rgba(255,255,255,0.5)]' : '']">
                            
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

                    <!-- 該局結算明細 (Bonus + 總計) -->
                    <div class="flex-1 flex flex-col overflow-hidden">
                        <div class="space-y-3 font-mono text-sm sm:text-base mb-4 overflow-y-auto custom-scrollbar flex-1">
                            <!-- Modal 內的 Bonus 結算顯示 (手動模式) -->
                            <template v-if="!$game.selectedHistoryRecord.agentDetails">
                                <div v-if="$game.selectedHistoryRecord.bonusTriggered" class="p-3 rounded mb-2 text-center font-bold text-sm shrink-0"
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
                            </template>

                            <!-- Modal 內的 Bonus 結算顯示 (人流模式) -->
                            <template v-else>
                                <div v-if="$game.selectedHistoryRecord.bonusTriggered" class="p-3 rounded mb-2 text-center font-bold text-sm shrink-0 bg-purple-900/80 text-gray-200 border border-purple-700 shadow-[0_0_10px_rgba(147,51,234,0.3)]">
                                    <div class="mb-1 text-purple-300 text-base">
                                        🌐 BONUS 世界線 (Public Result)
                                    </div>
                                    <div class="text-xs text-gray-400 mb-2">
                                        全場共用此開獎結果，玩家依自身 DNA 決定提早 Cashout 或繼續
                                    </div>
                                    
                                    <!-- 各層存活統計 -->
                                    <div v-if="$game.selectedHistoryRecord.bonusLevelStats" class="text-xs text-left mt-2 border-t border-purple-800/50 pt-2 space-y-2 font-mono">
                                        <div v-for="stat in $game.selectedHistoryRecord.bonusLevelStats" :key="stat.level" class="flex flex-col bg-black/30 p-2 rounded border-l-2 border-purple-500">
                                            <div class="flex justify-between items-center mb-1">
                                                <span class="text-gray-200 font-bold">第 {{ stat.level }} 層 <span class="text-yellow-400 ml-1 text-[11px]">({{ $game.appConfig.bonusGame.levelSettings.payouts[stat.level - 1] }}倍)</span> <span class="text-gray-400 font-normal ml-1">(抵達: {{ stat.totalArrived }} 人)</span></span>
                                                <span class="text-gray-300 bg-gray-800 px-1.5 py-0.5 rounded">安全: {{ $game.selectedHistoryRecord.bonusLevelHistory[stat.level - 1].safe.join(',') }}</span>
                                            </div>
                                            <div class="flex justify-end items-center text-[10px]">
                                                <div class="flex gap-2">
                                                    <span v-if="stat.cashedOutCount > 0" class="text-blue-300 bg-blue-900/30 px-1 py-0.5 rounded">💰 Cashout: {{ stat.cashedOutCount }} 人</span>
                                                    <span v-if="stat.continuedCount > 0" class="text-yellow-300 bg-yellow-900/30 px-1 py-0.5 rounded">🏃 續闖: {{ stat.continuedCount }} 人</span>
                                                    <span v-if="stat.crashedCount > 0" class="text-red-400 bg-red-900/30 px-1 py-0.5 rounded">💀 陣亡: {{ stat.crashedCount }} 人</span>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </template>

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
                        </div>

                        <!-- 結算總計 -->
                        <div class="border-t border-gray-600 pt-4 flex justify-between items-end shrink-0 mt-auto">
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

                <!-- 右欄：玩家排行榜 / 歷史單格明細 (僅 Agent Traffic 模式顯示) -->
                <div v-if="$game.selectedHistoryRecord.agentDetails" class="flex-1 flex flex-col md:border-l border-gray-600 md:pl-6 min-h-[50vh]">
                    
                    <!-- 狀態 1：顯示排行榜 -->
                    <template v-if="!selectedHistoryGridId">
                        <div class="mb-4 flex items-center justify-between border-b border-gray-700 pb-2 shrink-0">
                            <h3 class="text-xl font-bold text-gray-200">🏆 玩家盈虧排行榜</h3>
                            <span class="text-xs text-gray-500">共 {{ $game.selectedHistoryRecord.agentDetails.length }} 名</span>
                        </div>
                        
                        <div class="bg-gray-900 rounded-lg p-2 overflow-y-auto space-y-2 custom-scrollbar flex-1">
                            <div v-for="(agent, idx) in sortedAgentDetails" :key="agent.agentId" 
                                 @click="$game.openAgentInfoModal(agent)"
                                 class="flex flex-col xl:flex-row justify-between xl:items-center p-2.5 rounded border-l-4 bg-gray-800/50 hover:bg-gray-700 cursor-pointer transition-colors hover:scale-[1.01]"
                                 :class="agent.netProfit > 0 ? 'border-green-500' : (agent.netProfit < 0 ? 'border-red-500' : 'border-gray-500')">
                                
                                <div class="flex items-center gap-2 mb-1.5 xl:mb-0">
                                    <span class="text-xs text-gray-500 w-5 text-right font-bold">#{{ idx + 1 }}</span>
                                    <span class="font-mono text-sm text-gray-300 w-24 truncate" :title="agent.agentId">{{ agent.agentId }}</span>
                                    <span v-if="agent.vipGroup" class="px-1.5 py-0.5 rounded text-[10px] font-bold" :class="getVipClass(agent.vipGroup)">{{ agent.vipGroup }}</span>
                                    
                                    <span class="px-1.5 py-0.5 rounded text-[10px] whitespace-nowrap text-white font-bold opacity-80"
                                          :style="{ backgroundColor: getPersonaColor(agent.persona) }">
                                        {{ formatPersonaName(agent.persona) }}
                                    </span>
                                </div>
                                
                                <div class="flex items-center gap-4 text-xs font-mono w-full xl:w-auto justify-between xl:justify-end">
                                    <div class="text-gray-400 flex items-center gap-1.5">
                                        <span v-if="agent.buyLightning" title="已購買付費閃電" class="text-yellow-400 text-sm">⚡</span>
                                        <span v-if="agent.bonusWin > 0" title="Bonus 通關獎金" class="text-purple-400 text-sm">🎯</span>
                                        <span v-if="agent.jpWin > 0" title="獨得 JP 分紅" class="text-pink-400 text-sm">💎</span>
                                        投入: {{ agent.cost.toFixed(2) }}
                                    </div>
                                    <div class="text-right w-24">
                                        <span :class="agent.netProfit > 0 ? 'text-green-400 font-bold text-sm' : (agent.netProfit < 0 ? 'text-red-400' : 'text-gray-400')">
                                            {{ agent.netProfit > 0 ? '+' : '' }}{{ agent.netProfit.toFixed(2) }}
                                        </span>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </template>

                    <!-- 狀態 2：顯示被點擊格子的下注明細 -->
                    <template v-else>
                        <div class="mb-4 flex items-center justify-between border-b border-gray-700 pb-2 shrink-0">
                            <div class="flex items-center gap-3">
                                <button @click="selectedHistoryGridId = null" class="bg-gray-700 hover:bg-gray-600 text-white px-3 py-1 rounded text-sm transition-colors">
                                    ← 返回排行
                                </button>
                                <h3 class="text-xl font-bold text-gray-200">第 {{ selectedHistoryGridId }} 格 歷史明細</h3>
                            </div>
                            <span class="text-xs text-gray-500">共 {{ selectedGridDetails.length }} 名玩家</span>
                        </div>

                        <div class="bg-gray-900 rounded-lg p-2 overflow-y-auto space-y-2 custom-scrollbar flex-1">
                            <div v-if="selectedGridDetails.length === 0" class="text-center text-gray-500 py-10">
                                本局沒有任何玩家押注此格
                            </div>
                            <div v-else v-for="(agent, idx) in selectedGridDetails" :key="agent.agentId" 
                                 class="flex flex-col p-3 rounded border border-gray-700 bg-gray-800">
                                
                                <div class="flex items-center justify-between mb-2">
                                    <div class="flex items-center gap-2">
                                        <span class="text-xs text-gray-500 font-bold w-4">{{ idx + 1 }}.</span>
                                        <span class="font-mono text-sm text-gray-300 max-w-[120px] xl:max-w-[200px] truncate" :title="agent.agentId">{{ agent.agentId }}</span>
                                        <span v-if="agent.vipGroup" class="px-1.5 py-0.5 rounded text-[10px] font-bold" :class="getVipClass(agent.vipGroup)">{{ agent.vipGroup }}</span>
                                        <span class="px-1.5 py-0.5 rounded text-[10px] whitespace-nowrap text-white font-bold opacity-80"
                                              :style="{ backgroundColor: getPersonaColor(agent.persona) }">
                                            {{ formatPersonaName(agent.persona) }}
                                        </span>
                                    </div>
                                    <div class="text-lg font-bold flex items-baseline gap-1">
                                        <span class="text-gray-200">{{ agent.baseBet }}</span>
                                        <span v-if="agent.taxAmount > 0" class="text-yellow-400 text-sm" title="付費閃電加收">
                                            +{{ agent.taxAmount }}
                                        </span>
                                    </div>
                                </div>
                                
                                <div class="flex items-center justify-between text-xs">
                                    <div class="text-gray-400 flex items-center gap-2">
                                        <span v-if="agent.buyLightning" class="bg-yellow-900/50 text-yellow-500 px-1.5 py-0.5 rounded border border-yellow-700/50">
                                            ⚡ 付費閃電
                                        </span>
                                        <span v-if="agent.isBonusGrid" class="bg-purple-900/50 text-purple-400 px-1.5 py-0.5 rounded border border-purple-700/50">
                                            🎯 目標: L{{ agent.cashoutLevel }}
                                        </span>
                                    </div>
                                    <div class="text-right">
                                        <span v-if="agent.win > 0" class="text-green-400 font-bold">贏分: +{{ agent.win.toFixed(2) }}</span>
                                        <span v-else class="text-gray-500">無中獎</span>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </template>
                </div>
            </div>
        </div>
</template>

<script>
export default {
    name: 'HistoryModal',
    inject: ['$game'],
    data() {
        return {
            selectedHistoryGridId: null
        };
    },
    watch: {
        // 如果切換了歷史紀錄，清空選取的格子
        '$game.selectedHistoryRecord'() {
            this.selectedHistoryGridId = null;
        }
    },
    computed: {
        sortedAgentDetails() {
            const record = this.$game.selectedHistoryRecord;
            if (!record || !record.agentDetails) return [];
            return [...record.agentDetails].sort((a, b) => b.netProfit - a.netProfit);
        },
        selectedGridDetails() {
            const record = this.$game.selectedHistoryRecord;
            if (!record || !record.agentDetails || !this.selectedHistoryGridId) return [];
            
            const gridState = record.finalGridsState.find(g => g.id === this.selectedHistoryGridId);
            const isBonusTriggerGrid = record.bonusTriggered && gridState && gridState.balls === 3;
            
            const results = [];
            record.agentDetails.forEach(agent => {
                const gridDetail = agent.details.find(d => d.gridId === this.selectedHistoryGridId);
                if (gridDetail && gridDetail.betAmount > 0) {
                    let actualBet = gridDetail.betAmount;
                    let taxAmount = 0;
                    if (agent.buyLightning) {
                        taxAmount = actualBet * (this.$game.appConfig.mainGame.extraPurchaseCostPercent || 0.5);
                        actualBet += taxAmount;
                    }
                    results.push({
                        agentId: agent.agentId,
                        persona: agent.persona,
                        vipGroup: agent.vipGroup,
                        buyLightning: agent.buyLightning,
                        baseBet: gridDetail.betAmount,
                        taxAmount: taxAmount,
                        betAmount: actualBet,
                        win: gridDetail.winBase + gridDetail.winLightning + (gridDetail.winBonus || 0),
                        isBonus: gridDetail.isBonus,
                        isBonusGrid: isBonusTriggerGrid,
                        cashoutLevel: gridDetail.cashoutLevel
                    });
                }
            });
            // 依照押注金額由大到小排序
            return results.sort((a, b) => b.betAmount - a.betAmount);
        }
    },
    methods: {
        getGridColorClass(grid) {
            const record = this.$game.selectedHistoryRecord;
            if (!record) return 'bg-gray-800 border-gray-600';
            
            let bet = grid.betAmount;
            if (record.gridStats && record.gridStats[grid.id - 1]) {
                bet = record.gridStats[grid.id - 1].totalBet;
            }
            
            if (bet === 0) return 'bg-gray-800 border-gray-600';
            if (!record.agentDetails) return 'border-blue-500 bg-blue-900/30';
            
            const amounts = new Set();
            record.finalGridsState.forEach(g => {
                let a = g.betAmount;
                if (record.gridStats && record.gridStats[g.id - 1]) {
                    a = record.gridStats[g.id - 1].totalBet;
                }
                if (a > 0) amounts.add(a);
            });
            const sortedAmounts = [...amounts].sort((a, b) => b - a);
            
            if (sortedAmounts.length > 0 && bet === sortedAmounts[0]) {
                return 'border-red-500 bg-red-900/40';
            } else if (sortedAmounts.length > 1 && bet === sortedAmounts[1]) {
                return 'border-red-400/80 bg-red-900/20';
            } else {
                return 'border-blue-500 bg-blue-900/30';
            }
        },
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
            if (persona === 'persona_casual_tourist') return '#9ca3af'; 
            const stats = this.$game.trafficPersonaStats;
            if (stats && stats[persona] && stats[persona].color) {
                return stats[persona].color;
            }
            return '#6366f1'; 
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
