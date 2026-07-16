<template>
<!-- ================= Config 參數設定彈跳視窗 (Modal) ================= -->
        <div v-if="$game.showConfigModal" @click.self="$game.closeConfigModal" class="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm animate-fade-in">
            <div class="bg-gray-800 border border-gray-600 rounded-2xl w-full max-w-4xl max-h-[90vh] flex flex-col relative shadow-2xl overflow-hidden">
                <div class="p-4 border-b border-gray-700 flex justify-between items-center bg-gray-900">
                    <h2 class="text-2xl font-bold text-blue-400">⚙️ Config.json 參數設定</h2>
                    <button @click="$game.closeConfigModal" class="text-gray-400 hover:text-white text-3xl font-bold leading-none">&times;</button>
                </div>
                
                <div class="p-4 flex-1 overflow-y-auto">
                    <p class="text-xs text-gray-400 mb-2">請使用標準 JSON 格式編輯參數。存檔後，下一次開獎將立即採用新設定！</p>
                    <textarea v-model="$game.tempConfigText" 
                              class="w-full h-[50vh] bg-gray-900 text-green-400 font-mono text-sm p-4 rounded-lg border border-gray-600 focus:outline-none focus:border-blue-500 shadow-inner"
                              spellcheck="false"></textarea>
                </div>

                <div class="p-4 border-t border-gray-700 bg-gray-900 flex justify-between items-center">
                    <button @click="$game.restoreDefaultConfig" class="px-4 py-2 rounded-lg font-bold text-red-400 hover:bg-gray-800 transition border border-red-900/50">🔄 恢復預設</button>
                    <div class="flex gap-4">
                        <button @click="$game.closeConfigModal" class="px-6 py-2 rounded-lg font-bold text-gray-300 hover:bg-gray-700 transition border border-gray-600">取消</button>
                        <button @click="$game.saveConfig" class="px-6 py-2 rounded-lg font-bold text-white bg-blue-600 hover:bg-blue-500 transition shadow-lg">儲存並套用</button>
                    </div>
                </div>
            </div>
        </div>
</template>

<script>
export default {
    name: 'ConfigModal',
    inject: ['$game']
}
</script>
