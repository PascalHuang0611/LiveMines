<template>
    <div v-if="$game.showActiveAgentsModal" class="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fade-in">
        <div class="bg-gray-900 border border-gray-700 rounded-2xl shadow-2xl w-full max-w-4xl flex flex-col h-[80vh] overflow-hidden">
            <!-- Header -->
            <div class="bg-gray-800 p-4 border-b border-gray-700 flex justify-between items-center shrink-0">
                <h2 class="text-xl font-bold text-white flex items-center gap-2">
                    <span>👥 在線玩家透視鏡 (PM 專用)</span>
                    <span class="bg-blue-600 text-xs px-2 py-1 rounded text-white font-mono">{{ $game.currentActiveAgents.length }} 人在線</span>
                </h2>
                <button @click="$game.closeActiveAgentsModal()" class="text-gray-400 hover:text-white transition">
                    <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path></svg>
                </button>
            </div>

            <!-- Body -->
            <div class="flex flex-1 overflow-hidden">
                <!-- 左側名單列表 -->
                <div class="w-1/3 border-r border-gray-700 flex flex-col bg-gray-800/50">
                    <div class="p-3 border-b border-gray-700/50 bg-gray-800 shrink-0">
                        <input v-model="searchQuery" type="text" placeholder="搜尋 Account 或 Persona..." class="w-full bg-gray-900 border border-gray-600 rounded px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500">
                    </div>
                    <div class="flex-1 overflow-y-auto p-2 space-y-1 custom-scrollbar">
                        <div v-for="agent in filteredAgents" :key="agent.Account"
                             @click="selectAgent(agent)"
                             class="p-3 rounded-lg cursor-pointer transition border"
                             :class="[
                                 selectedAgent?.Account === agent.Account ? 'border-blue-500 shadow-md ring-1 ring-blue-500' : 'border-transparent hover:border-gray-500',
                                 agent.Player_Persona === 'persona_casual_tourist' ? (selectedAgent?.Account === agent.Account ? 'bg-gray-800' : 'bg-gray-900/50 opacity-60 hover:opacity-100') : (selectedAgent?.Account === agent.Account ? 'bg-blue-900/50' : 'bg-gray-800 hover:bg-gray-700')
                             ]">
                            <div class="font-mono text-sm font-bold text-white truncate">{{ agent.Account }}</div>
                            <div class="flex items-center justify-between mt-1 gap-2">
                                <div class="text-xs truncate font-bold"
                                     :style="agent.Player_Persona !== 'persona_casual_tourist' ? { color: $game.trafficPersonaStats[agent.Player_Persona]?.color || '#60a5fa' } : {}"
                                     :class="agent.Player_Persona === 'persona_casual_tourist' ? 'text-gray-500' : ''">
                                    {{ agent.Persona_Name_ZH || agent.Player_Persona || 'Unknown' }}
                                </div>
                                <span v-if="agent.VIP_Group" 
                                      class="text-[9px] px-1.5 py-0.5 rounded font-bold whitespace-nowrap shrink-0"
                                      :class="[
                                          ['V8','V7','V6'].includes(agent.VIP_Group) ? 'bg-gradient-to-r from-yellow-600 to-yellow-400 text-black shadow-[0_0_8px_rgba(234,179,8,0.5)]' : 
                                          (['V5','V4'].includes(agent.VIP_Group) ? 'bg-purple-600/80 text-white border border-purple-500' : 
                                          (['V3','V2'].includes(agent.VIP_Group) ? 'bg-blue-600/80 text-white border border-blue-500' : 
                                          'bg-gray-700 text-gray-400 border border-gray-600'))
                                      ]">
                                    {{ agent.VIP_Group }}
                                </span>
                            </div>
                        </div>
                        <div v-if="filteredAgents.length === 0" class="text-center text-gray-500 text-sm mt-10">
                            找不到符合的 Agent
                        </div>
                    </div>
                </div>

                <!-- 右側 DNA 語意化解析 -->
                <div class="w-2/3 p-6 overflow-y-auto custom-scrollbar bg-gray-900">
                    <div v-if="selectedAgent" class="space-y-6 animate-fade-in">
                        <!-- 基本資料 -->
                        <div class="flex items-start gap-4 pb-4 border-b border-gray-800">
                            <div class="w-16 h-16 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-2xl shadow-lg shrink-0">
                                🧑‍💻
                            </div>
                            <div>
                                <h3 class="text-2xl font-bold text-white font-mono flex items-center gap-3">
                                    {{ selectedAgent.Account }}
                                </h3>
                                <div class="flex items-center gap-3 mt-2">
                                    <div class="px-3 py-1 bg-gray-800 rounded-full text-sm font-bold border shadow-inner"
                                         :style="selectedAgent.Player_Persona !== 'persona_casual_tourist' ? { color: $game.trafficPersonaStats[selectedAgent.Player_Persona]?.color || '#60a5fa', borderColor: ($game.trafficPersonaStats[selectedAgent.Player_Persona]?.color || '#60a5fa') + '40' } : { color: '#9ca3af', borderColor: '#374151' }">
                                        {{ selectedAgent.Persona_Name_ZH || selectedAgent.Player_Persona || 'Unknown' }}
                                    </div>
                                    <span v-if="selectedAgent.VIP_Group" 
                                          class="text-sm px-2 py-0.5 rounded font-bold tracking-wider shadow-sm"
                                          :class="[
                                              ['V8','V7','V6'].includes(selectedAgent.VIP_Group) ? 'bg-gradient-to-r from-yellow-600 to-yellow-400 text-black shadow-[0_0_10px_rgba(234,179,8,0.6)]' : 
                                              (['V5','V4'].includes(selectedAgent.VIP_Group) ? 'bg-purple-600 text-white' : 
                                              (['V3','V2'].includes(selectedAgent.VIP_Group) ? 'bg-blue-600 text-white' : 
                                              'bg-gray-700 text-gray-400'))
                                          ]">
                                        💎 {{ selectedAgent.VIP_Group }}
                                    </span>
                                </div>
                            </div>
                        </div>

                        <!-- 語意化卡片區塊 -->
                        <div class="grid grid-cols-1 gap-4">
                            
                            <!-- 投注習慣與風險特徵 -->
                            <div class="bg-gray-800/80 rounded-xl p-5 border border-gray-700/50 relative overflow-hidden">
                                <div class="absolute top-0 left-0 w-1 h-full bg-blue-500"></div>
                                <h4 class="text-gray-400 text-sm font-bold uppercase tracking-wider mb-3 flex items-center gap-2">
                                    <span>💸 投注習慣與策略</span>
                                </h4>
                                <ul class="space-y-3 text-gray-300 text-sm leading-relaxed">
                                    <li class="flex gap-2">
                                        <span class="text-blue-400 mt-0.5">▪</span>
                                        <span>他平常喜歡下注 <strong class="text-white">{{ selectedAgent.Base_bet_Amount || 10 }} 元</strong> 左右。</span>
                                    </li>
                                    <li class="flex gap-2">
                                        <span class="text-blue-400 mt-0.5">▪</span>
                                        <span>下注分佈偏好：<strong class="text-white">{{ selectedAgent.Bet_Distribution_Type === 'anchor' ? '主投策略 (Anchor)' : '平均分散 (Equal)' }}</strong>。</span>
                                    </li>
                                    <li class="flex gap-2">
                                        <span class="text-blue-400 mt-0.5">▪</span>
                                        <span>當他 <span class="text-red-400">輸錢</span> 時，下一把注碼會變成 <strong class="text-white">{{ selectedAgent.Martingale_Multiplier || 1.0 }} 倍</strong> (追注)。</span>
                                    </li>
                                    <li class="flex gap-2">
                                        <span class="text-blue-400 mt-0.5">▪</span>
                                        <span>當他 <span class="text-green-400">贏錢</span> 時，下一把注碼會變成 <strong class="text-white">{{ selectedAgent.Win_Retrench_Ratio || 1.0 }} 倍</strong> (縮注)。</span>
                                    </li>
                                    <li class="flex gap-2">
                                        <span class="text-blue-400 mt-0.5">▪</span>
                                        <span>他有 <strong class="text-yellow-400">{{ ((selectedAgent.Buy_Lightning_Prob || 0) * 100).toFixed(0) }}%</strong> 的機率會購買額外閃電。</span>
                                    </li>
                                </ul>
                            </div>

                            <!-- 目標與停損 -->
                            <div class="bg-gray-800/80 rounded-xl p-5 border border-gray-700/50 relative overflow-hidden">
                                <div class="absolute top-0 left-0 w-1 h-full bg-green-500"></div>
                                <h4 class="text-gray-400 text-sm font-bold uppercase tracking-wider mb-3 flex items-center gap-2">
                                    <span>🎯 停損停利與目標</span>
                                </h4>
                                <ul class="space-y-3 text-gray-300 text-sm leading-relaxed">
                                    <li class="flex gap-2">
                                        <span class="text-green-400 mt-0.5">▪</span>
                                        <span>進入 BONUS 後，他通常目標只想到 <strong class="text-white">第 {{ selectedAgent.Cashout_Stop_Level || 3 }} 層</strong> 就結算。</span>
                                    </li>
                                    <li class="flex gap-2">
                                        <span class="text-green-400 mt-0.5">▪</span>
                                        <span>只要單次遊玩累積輸掉 <strong class="text-red-400">{{ selectedAgent.Session_Stop_Loss_Multi || 20 }} 倍</strong> 本金，他就會立刻停損離線。</span>
                                    </li>
                                    <li class="flex gap-2">
                                        <span class="text-green-400 mt-0.5">▪</span>
                                        <span>只要單次遊玩累積贏得 <strong class="text-green-400">{{ selectedAgent.Session_Take_Profit_Multi || 30 }} 倍</strong> 本金，他就會心滿意足地提早下線。</span>
                                    </li>
                                </ul>
                            </div>

                            <!-- 作息與活躍度 -->
                            <div class="bg-gray-800/80 rounded-xl p-5 border border-gray-700/50 relative overflow-hidden">
                                <div class="absolute top-0 left-0 w-1 h-full bg-purple-500"></div>
                                <h4 class="text-gray-400 text-sm font-bold uppercase tracking-wider mb-3 flex items-center gap-2">
                                    <span>⏱️ 作息與黏著度</span>
                                </h4>
                                <ul class="space-y-3 text-gray-300 text-sm leading-relaxed">
                                    <li class="flex gap-2">
                                        <span class="text-purple-400 mt-0.5">▪</span>
                                        <span>他每天有 <strong class="text-white">{{ ((selectedAgent.Daily_Login_Probability || 1) * 100).toFixed(0) }}%</strong> 的機率會登入遊戲。</span>
                                    </li>
                                    <li class="flex gap-2">
                                        <span class="text-purple-400 mt-0.5">▪</span>
                                        <span>他每次上線大約只玩 <strong class="text-white">{{ selectedAgent.Micro_Session_Length || 20 }} 局</strong>。</span>
                                    </li>
                                    <li class="flex gap-2">
                                        <span class="text-purple-400 mt-0.5">▪</span>
                                        <span>他一天平均會分 <strong class="text-white">{{ selectedAgent.Sessions_Per_Active_Day || 1 }} 次</strong> 上線。</span>
                                    </li>
                                </ul>
                            </div>
                        </div>

                    </div>
                    
                    <div v-else class="h-full flex flex-col items-center justify-center text-gray-500">
                        <svg class="w-16 h-16 mb-4 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"></path><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"></path></svg>
                        <p>請從左側名單點擊一位玩家以檢視其 DNA 側寫</p>
                    </div>
                </div>
            </div>
        </div>
    </div>
</template>

<script>
import { useGameStore } from '../../store/gameStore';

export default {
    name: 'ActiveAgentsModal',
    data() {
        return {
            searchQuery: '',
            selectedAgent: null
        }
    },
    computed: {
        $game() {
            return useGameStore();
        },
        filteredAgents() {
            const activeAgents = [...(this.$game.currentActiveAgents || [])];
            
            // 排序：高 VIP 在最上面，觀光客在最下面
            activeAgents.sort((a, b) => {
                const isACasual = a.Player_Persona === 'persona_casual_tourist';
                const isBCasual = b.Player_Persona === 'persona_casual_tourist';
                if (isACasual && !isBCasual) return 1;
                if (!isACasual && isBCasual) return -1;
                
                // VIP 排序 (V8 > V7 > ... > V1 > 預設)
                const getVipLevel = (vip) => {
                    if (!vip) return 0;
                    const match = vip.match(/V(\d+)/);
                    return match ? parseInt(match[1]) : 0;
                };
                
                const vipA = getVipLevel(a.VIP_Group);
                const vipB = getVipLevel(b.VIP_Group);
                
                if (vipA !== vipB) {
                    return vipB - vipA; // 降冪排列 (高 VIP 在上)
                }

                return 0; // VIP 相同時保持原樣
            });

            if (!this.searchQuery) return activeAgents;
            
            const q = this.searchQuery.toLowerCase();
            return activeAgents.filter(a => {
                const acc = (a.Account || '').toLowerCase();
                const persona = (a.Persona_Name_ZH || a.Player_Persona || '').toLowerCase();
                return acc.includes(q) || persona.includes(q);
            });
        }
    },
    methods: {
        selectAgent(agent) {
            this.selectedAgent = agent;
        }
    },
    watch: {
        // 當 Modal 關閉時清空選擇
        '$game.showActiveAgentsModal'(newVal) {
            if (!newVal) {
                this.selectedAgent = null;
                this.searchQuery = '';
            } else if (this.$game.currentActiveAgents.length > 0) {
                // 自動選中第一個
                this.selectedAgent = this.$game.currentActiveAgents[0];
            }
        }
    }
}
</script>

<style scoped>
.custom-scrollbar::-webkit-scrollbar {
    width: 6px;
}
.custom-scrollbar::-webkit-scrollbar-track {
    background: rgba(0,0,0,0.1);
}
.custom-scrollbar::-webkit-scrollbar-thumb {
    background: rgba(255,255,255,0.1);
    border-radius: 4px;
}
.custom-scrollbar::-webkit-scrollbar-thumb:hover {
    background: rgba(255,255,255,0.2);
}
</style>
