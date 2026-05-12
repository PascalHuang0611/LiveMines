<template>
    <div v-if="game.isGridDetailsModalOpen" class="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
        <div class="bg-gray-800 border border-gray-700 rounded-xl shadow-2xl w-full max-w-3xl flex flex-col max-h-[85vh]">
            
            <!-- Header -->
            <div class="flex justify-between items-center p-4 border-b border-gray-700 bg-gray-900 rounded-t-xl shrink-0">
                <div class="flex items-center gap-3">
                    <h2 class="text-xl font-bold text-white">第 {{ game.selectedGridId }} 格 下注明細</h2>
                    <span class="px-2 py-0.5 rounded-full bg-blue-500/20 text-blue-400 text-xs font-bold border border-blue-500/30">
                        共 {{ gridAgents.length }} 名玩家
                    </span>
                    <span class="px-2 py-0.5 rounded-full bg-yellow-500/20 text-yellow-400 text-xs font-bold border border-yellow-500/30">
                        總額: {{ totalGridBet }}
                    </span>
                </div>
                <button @click="game.closeGridDetails()" class="text-gray-400 hover:text-white bg-gray-800 hover:bg-gray-700 rounded-lg p-2 transition">
                    <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path></svg>
                </button>
            </div>

            <!-- Body -->
            <div class="p-4 overflow-y-auto flex-1">
                <div v-if="gridAgents.length === 0" class="text-center text-gray-500 py-10">
                    本回合無人押注此格
                </div>
                <div v-else class="space-y-2">
                    <div v-for="agent in gridAgents" :key="agent.agentId" class="bg-gray-900 rounded-lg p-3 border border-gray-700 flex flex-col gap-2">
                        <!-- 玩家標頭 -->
                        <div class="flex items-center justify-between">
                            <div class="flex items-center gap-2">
                                <span class="font-mono text-sm text-gray-300 max-w-[280px] truncate" :title="agent.agentId">{{ agent.agentId }}</span>
                                <span v-if="agent.vipGroup && agent.vipGroup !== 'V0' && agent.vipGroup !== 'V1'" 
                                      class="px-1.5 py-0.5 rounded text-[10px] font-bold"
                                      :class="getVipClass(agent.vipGroup)">
                                    {{ agent.vipGroup }}
                                </span>
                                <span class="px-2 py-0.5 rounded text-xs font-bold" :style="{ color: getPersonaColor(agent.persona), backgroundColor: getPersonaColor(agent.persona) + '20', borderColor: getPersonaColor(agent.persona) + '40', borderWidth: '1px' }">
                                    {{ formatPersonaName(agent.persona) }}
                                </span>
                                <span v-if="agent.buyLightning" class="text-red-400 text-xs font-bold bg-red-900/30 px-1 rounded border border-red-500/30">⚡ 買閃電</span>
                            </div>
                            <div class="flex items-center gap-4">
                                <div v-if="agent.plannedCashoutLevel" class="text-xs text-gray-400">
                                    二級停扣: <span class="text-green-400 font-bold">L{{ agent.plannedCashoutLevel }}</span>
                                </div>
                                <div class="text-lg font-bold" :class="agent.buyLightning ? 'text-yellow-300' : 'text-gray-200'">
                                    {{ agent.finalAmount }}
                                    <span v-if="agent.buyLightning" class="text-xs text-red-400 block -mt-1 text-right">(含閃電)</span>
                                </div>
                            </div>
                        </div>
                        
                        <!-- 籌碼明細 -->
                        <div class="text-xs text-gray-400 bg-black/30 p-2 rounded flex flex-wrap gap-2 items-center">
                            <span class="text-gray-500 shrink-0">籌碼組合：</span>
                            <span v-for="(count, denom) in agent.chipMap" :key="denom" v-show="count > 0" class="flex items-center gap-1">
                                <span class="text-gray-300 font-mono">[{{ denom >= 1000 ? (denom/1000)+'K' : denom }}]</span>
                                <span class="text-gray-500 text-[10px]">x</span><span class="text-yellow-500 font-bold">{{ count }}</span>
                            </span>
                        </div>
                    </div>
                </div>
            </div>

        </div>
    </div>
</template>

<script>
import { computed } from 'vue';
import { useGameStore } from '../../store/gameStore';

export default {
    name: 'GridDetailsModal',
    setup() {
        const game = useGameStore();

        const formatPersonaName = (persona) => {
            if (persona === 'persona_casual_tourist') return '觀光客';
            if (game.trafficPersonaStats && game.trafficPersonaStats[persona]) {
                return game.trafficPersonaStats[persona].personaNameZH || persona;
            }
            return persona;
        };

        const getPersonaColor = (persona) => {
            // 觀光客強制灰色
            if (persona === 'persona_casual_tourist') return '#9ca3af'; 
            if (game.trafficPersonaStats && game.trafficPersonaStats[persona]) {
                return game.trafficPersonaStats[persona].color || '#3b82f6';
            }
            return '#3b82f6'; // default blue
        };

        const getVipClass = (vipGroup) => {
            if (!vipGroup) return 'bg-gray-700 text-gray-300';
            const num = parseInt(vipGroup.replace('V', ''));
            if (num >= 8) return 'bg-gradient-to-r from-yellow-300 to-yellow-600 text-black shadow-sm';
            if (num >= 6) return 'bg-gradient-to-r from-purple-500 to-indigo-600 text-white shadow-sm';
            if (num >= 4) return 'bg-blue-600 text-white';
            return 'bg-gray-700 text-gray-300';
        };

        const gridAgents = computed(() => {
            if (!game.selectedGridId || !game.currentAgentDecisions) return [];
            
            const list = [];
            const gridId = game.selectedGridId.toString();

            game.currentAgentDecisions.forEach(decision => {
                if (decision.legalBetMap && decision.legalBetMap[gridId]) {
                    let baseAmount = decision.legalBetMap[gridId];
                    let finalAmount = baseAmount;
                    if (decision.buyLightning) {
                        finalAmount += baseAmount * (game.appConfig.mainGame.extraPurchaseCostPercent || 0.5);
                    }
                    
                    const agentDna = game.currentActiveAgents.find(a => a.Account === decision.agentId);
                    
                    list.push({
                        agentId: decision.agentId,
                        persona: decision.persona,
                        vipGroup: agentDna ? agentDna.VIP_Group : null,
                        buyLightning: decision.buyLightning,
                        baseAmount: baseAmount,
                        finalAmount: Math.round(finalAmount * 100) / 100,
                        chipMap: decision.fullChipMap ? decision.fullChipMap[gridId] : {},
                        plannedCashoutLevel: decision.plannedCashoutLevel
                    });
                }
            });

            // 依金額大到小排序
            return list.sort((a, b) => b.finalAmount - a.finalAmount);
        });

        const totalGridBet = computed(() => {
            return Math.round(gridAgents.value.reduce((sum, a) => sum + a.finalAmount, 0) * 100) / 100;
        });

        return {
            game: game,
            gridAgents,
            totalGridBet,
            formatPersonaName,
            getPersonaColor,
            getVipClass
        };
    }
}
</script>
