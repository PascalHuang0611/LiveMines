<template>
    <!-- ================= 玩家詳細資料 (DNA 透視) 彈跳視窗 ================= -->
    <div v-if="$game.selectedAgentInfo" @click.self="$game.closeAgentInfoModal" class="fixed inset-0 z-[60] flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm animate-fade-in">
        <div class="bg-gray-800 border-2 border-gray-600 rounded-2xl w-full max-w-md overflow-hidden relative shadow-2xl">
            
            <!-- 頂部：玩家基本資料 -->
            <div class="bg-gradient-to-br from-gray-700 to-gray-900 p-6 flex flex-col items-center justify-center relative border-b border-gray-600">
                <button @click="$game.closeAgentInfoModal" class="absolute top-2 right-4 text-gray-400 hover:text-white text-3xl font-bold leading-none">&times;</button>
                
                <div class="w-16 h-16 bg-gray-600 rounded-full flex items-center justify-center text-3xl mb-3 border-2 shadow-lg"
                     :style="{ borderColor: getPersonaColor(agent.persona) }">
                    {{ getPersonaEmoji(agent.persona) }}
                </div>
                
                <h2 class="text-xl font-mono font-bold text-white mb-1 truncate w-full px-8 text-center" :title="agent.agentId">{{ agent.agentId }}</h2>
                
                <div class="flex items-center gap-2">
                    <span v-if="agent.vipGroup" class="px-2 py-0.5 rounded text-xs font-bold" :class="getVipClass(agent.vipGroup)">
                        {{ agent.vipGroup }}
                    </span>
                    <span class="px-2 py-0.5 rounded text-xs text-white font-bold opacity-90 shadow-sm"
                          :style="{ backgroundColor: getPersonaColor(agent.persona) }">
                        {{ formatPersonaName(agent.persona) }}
                    </span>
                </div>
            </div>

            <!-- 本局行為透視 -->
            <div class="p-5 bg-gray-900/50">
                <h3 class="text-sm text-gray-400 font-bold mb-3 uppercase tracking-wider flex items-center gap-2">
                    <span>🔍 本局決策透視</span>
                </h3>
                <div class="grid grid-cols-2 gap-3 mb-5">
                    <div class="bg-gray-800 border border-gray-700 p-3 rounded-lg flex flex-col items-center justify-center shadow-inner">
                        <span class="text-xs text-gray-500 mb-1">閃電加購</span>
                        <span class="text-lg font-bold" :class="agent.buyLightning ? 'text-yellow-400' : 'text-gray-400'">
                            {{ agent.buyLightning ? '⚡ 已購買' : '✖ 未購買' }}
                        </span>
                    </div>
                    <div class="bg-gray-800 border border-gray-700 p-3 rounded-lg flex flex-col items-center justify-center shadow-inner relative overflow-hidden">
                        <span class="text-xs text-gray-500 mb-1">Bonus 停扣目標</span>
                        <span class="text-lg font-bold text-purple-400">L{{ agent.plannedCashoutLevel || 1 }}</span>
                        <!-- 背景浮水印效果 -->
                        <span class="absolute -right-2 -bottom-2 text-4xl opacity-10">🎯</span>
                    </div>
                </div>

                <h3 class="text-sm text-gray-400 font-bold mb-3 uppercase tracking-wider flex items-center gap-2 border-t border-gray-700 pt-4">
                    <span>🧬 天生 DNA 參數</span>
                </h3>
                
                <!-- DNA 雷達表 -->
                <div class="space-y-3 font-mono text-xs">
                    <div class="flex justify-between items-center">
                        <span class="text-gray-400">Cashout_Propensity (貪婪度)</span>
                        <span class="text-yellow-400 font-bold">{{ formatPercent(agent.dna.Cashout_Propensity) }}</span>
                    </div>
                    <div class="w-full bg-gray-700 rounded-full h-1.5 mb-2">
                        <div class="bg-yellow-400 h-1.5 rounded-full" :style="{ width: (agent.dna.Cashout_Propensity * 100) + '%' }"></div>
                    </div>

                    <div class="flex justify-between items-center">
                        <span class="text-gray-400">Buy_Lightning_Prob (閃電狂熱)</span>
                        <span class="text-yellow-400 font-bold">{{ formatPercent(agent.dna.Buy_Lightning_Prob) }}</span>
                    </div>
                    <div class="w-full bg-gray-700 rounded-full h-1.5 mb-2">
                        <div class="bg-yellow-400 h-1.5 rounded-full" :style="{ width: (agent.dna.Buy_Lightning_Prob * 100) + '%' }"></div>
                    </div>

                    <div class="flex justify-between items-center">
                        <span class="text-gray-400">Bet_Distribution (下注分佈)</span>
                        <span class="text-blue-300 font-bold">{{ agent.dna.Bet_Distribution_Type === 'anchor' ? '主投 (Anchor)' : '均投 (Equal)' }}</span>
                    </div>
                    
                    <div class="flex justify-between items-center">
                        <span class="text-gray-400">Cashout_Stop_Level (停扣上限)</span>
                        <span class="text-purple-400 font-bold">L{{ agent.dna.Cashout_Stop_Level || 3 }}</span>
                    </div>

                    <div class="flex justify-between items-center">
                        <span class="text-gray-400">Base_bet_Amount (基礎注碼)</span>
                        <span class="text-green-400 font-bold">{{ agent.dna.Base_bet_Amount || 10 }}</span>
                    </div>

                    <div class="flex justify-between items-center">
                        <span class="text-gray-400">Martingale_Multiplier (追注倍率)</span>
                        <span class="text-red-400 font-bold">{{ agent.dna.Martingale_Multiplier || 1.0 }}x</span>
                    </div>

                    <div class="flex justify-between items-center">
                        <span class="text-gray-400">Win_Retrench_Ratio (縮注比例)</span>
                        <span class="text-green-400 font-bold">{{ agent.dna.Win_Retrench_Ratio || 1.0 }}x</span>
                    </div>
                </div>
            </div>
            
        </div>
    </div>
</template>

<script>
export default {
    name: 'AgentInfoModal',
    inject: ['$game'],
    computed: {
        agent() {
            return this.$game.selectedAgentInfo;
        }
    },
    methods: {
        formatPercent(val) {
            return Math.round((Number(val) || 0) * 100) + '%';
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
        },
        getPersonaEmoji(persona) {
            if (persona.includes('gambler')) return '🤑';
            if (persona.includes('whale')) return '🐳';
            if (persona.includes('cautious')) return '🐢';
            if (persona.includes('systematic')) return '🤖';
            if (persona === 'persona_casual_tourist') return '🚶';
            return '👤';
        }
    }
}
</script>
