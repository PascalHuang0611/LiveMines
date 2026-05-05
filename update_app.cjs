const fs = require('fs');

const appVue = fs.readFileSync('src/App.vue', 'utf8');

// Extract the script block
const scriptMatch = appVue.match(/<script>([\s\S]*?)<\/script>/);
if (!scriptMatch) {
    console.error("Script block not found!");
    process.exit(1);
}

let scriptContent = scriptMatch[1];

// Add imports
const imports = `
import LeftSidebar from './components/layout/LeftSidebar.vue';
import RightSidebar from './components/layout/RightSidebar.vue';
import GameBoard from './components/game/GameBoard.vue';
import ConfigModal from './components/modals/ConfigModal.vue';
import ChartModal from './components/modals/ChartModal.vue';
import DistributionModal from './components/modals/DistributionModal.vue';
import BinModal from './components/modals/BinModal.vue';
import BatchModal from './components/modals/BatchModal.vue';
import HistoryModal from './components/modals/HistoryModal.vue';
`;

// Insert imports after Chart.js setup
scriptContent = scriptContent.replace("export default {", imports + "\nexport default {");

// Add components definition and provide
const componentsAndProvide = `
            components: {
                LeftSidebar,
                RightSidebar,
                GameBoard,
                ConfigModal,
                ChartModal,
                DistributionModal,
                BinModal,
                BatchModal,
                HistoryModal
            },
            provide() {
                return {
                    $game: this
                };
            },`;

scriptContent = scriptContent.replace("export default {\n", "export default {\n" + componentsAndProvide);

const newTemplate = `<template>
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
    </div>
</template>`;

const newAppVue = newTemplate + "\n\n<script>" + scriptContent + "</script>\n";

fs.writeFileSync('src/App.vue', newAppVue);
console.log("App.vue updated successfully!");
