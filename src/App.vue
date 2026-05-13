<template>
    <div id="app" class="min-h-screen py-8 px-4 flex justify-center">
        <!-- 三欄佈局容器 -->
        <div class="max-w-[1400px] w-full flex flex-col xl:flex-row gap-6 items-start relative mx-auto">
            <LeftSidebar />
            <GameBoard />
            <RightSidebar />
        </div>

        <!-- 彈跳視窗 (Modals) -->
        <ConfigModal />
        <ChartModal />
        <DistributionModal />
        <BinModal />
        <BatchModal />
        <HistoryModal />
        <ActiveAgentsModal />
        <GridDetailsModal />
        <AgentInfoModal />

        <!-- 版本標示 -->
        <div class="fixed bottom-2 right-2 text-xs text-gray-500 opacity-50 pointer-events-none z-50">
            v2.29 (Agent Traffic UI Refinement)
        </div>
    </div>
</template>

<script>
import LeftSidebar from './components/layout/LeftSidebar.vue';
import RightSidebar from './components/layout/RightSidebar.vue';
import GameBoard from './components/game/GameBoard.vue';
import ConfigModal from './components/modals/ConfigModal.vue';
import ChartModal from './components/modals/ChartModal.vue';
import DistributionModal from './components/modals/DistributionModal.vue';
import BinModal from './components/modals/BinModal.vue';
import BatchModal from './components/modals/BatchModal.vue';
import HistoryModal from './components/modals/HistoryModal.vue';
import ActiveAgentsModal from './components/game/ActiveAgentsModal.vue';
import GridDetailsModal from './components/game/GridDetailsModal.vue';
import AgentInfoModal from './components/modals/AgentInfoModal.vue';
import { useGameStore } from './store/gameStore';

export default {
    components: {
        LeftSidebar,
        RightSidebar,
        GameBoard,
        ConfigModal,
        ChartModal,
        DistributionModal,
        BinModal,
        BatchModal,
        HistoryModal,
        ActiveAgentsModal,
        GridDetailsModal,
        AgentInfoModal
    },
    setup() {
        const game = useGameStore();
        return { game };
    },
    provide() {
        return {
            $game: this.game
        };
    },
    computed: {
        isAnyModalOpen() {
            return !!(
                this.game.selectedHistoryRecord ||
                this.game.selectedBatch ||
                this.game.selectedGridId ||
                this.game.selectedAgentInfo ||
                this.game.showConfigModal ||
                this.game.showChartModal ||
                this.game.showDistributionModal ||
                this.game.showBinModal ||
                this.game.showActiveAgentsModal
            );
        }
    },
    watch: {
        isAnyModalOpen(newVal) {
            if (newVal) {
                document.body.style.overflow = 'hidden';
            } else {
                document.body.style.overflow = '';
            }
        },
        'game.simRounds'(newVal) {
            localStorage.setItem('livemines_simRounds', newVal);
        },
        'game.batchSize'(newVal) {
            localStorage.setItem('livemines_batchSize', newVal);
        },
        'game.distributionBinSize'(newVal) {
            if (newVal <= 0) this.game.distributionBinSize = 0.1;
            localStorage.setItem('livemines_distBinSize', this.game.distributionBinSize);
            this.game.updateChart();
        }
    },
    mounted() {
        this.game.initializeStore();
    }
}
</script>
