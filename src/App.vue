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

        <!-- 版本標示 -->
        <div class="fixed bottom-2 right-2 text-xs text-gray-500 opacity-50 pointer-events-none z-50">
            v3.0.0 (Refactored)
        </div>
    </div>
</template>

<script>

import { Chart, registerables } from 'chart.js';
Chart.register(...registerables);
import { DEFAULT_CONFIG, getEmptyStats } from './utils/constants';

// --- 自定義 Chart.js 插件 ---
const horizontalLinePlugin = {
    id: 'horizontalLine',
    beforeDraw: (chart) => {
        const { ctx, chartArea: { top, right, bottom, left }, scales: { y } } = chart;
        const y100 = y.getPixelForValue(100);
        if (y100 >= top && y100 <= bottom) {
            ctx.save();
            ctx.beginPath();
            ctx.lineWidth = 2.5;
            ctx.strokeStyle = 'rgba(239, 68, 68, 0.9)';
            ctx.setLineDash([]);
            ctx.moveTo(left, y100);
            ctx.lineTo(right, y100);
            ctx.stroke();
            ctx.restore();
        }
    }
};


import LeftSidebar from './components/layout/LeftSidebar.vue';
import RightSidebar from './components/layout/RightSidebar.vue';
import GameBoard from './components/game/GameBoard.vue';
import ConfigModal from './components/modals/ConfigModal.vue';
import ChartModal from './components/modals/ChartModal.vue';
import DistributionModal from './components/modals/DistributionModal.vue';
import BinModal from './components/modals/BinModal.vue';
import BatchModal from './components/modals/BatchModal.vue';
import HistoryModal from './components/modals/HistoryModal.vue';

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
                HistoryModal
            },
            provide() {
                return {
                    $game: this
                };
            },
            data() {
                return {
                    balance: 0,
                    buyExtraLightning: false,
                    bonusTargetLevel: 1, 
                    simRounds: 120000,     
                    bonusPositions: [1, 1, 1, 1, 1], 
                    isPlaying: false,
                    
                    // 數據來源模式切換
                    dataSourceMode: 'theoretical',
                    csvData: [],                   
                    availableVersions: [],         
                    availableRounds: [],           
                    selectedVersions: [],          
                    selectedRounds: [],            
                    csvDataIndex: 0,               

                    // Modal 相關
                    showConfigModal: false,
                    showChartModal: false,
                    showDistributionModal: false,
                    showBinModal: false,
                    tempConfigText: "",
                    
                    // 分佈圖設定
                    distributionBinSize: 2,

                    // 區間點擊儲存
                    selectedBinLabel: '',
                    selectedBinBatches: [],
                    
                    // 進度條相關
                    simulatedCount: 0,
                    totalSimToRun: 0,
                    progressPercent: 0,

                    lastResult: null,
                    selectedHistoryRecord: null,
                    
                    history: [],
                    historyFilter: 'all',
                    filterStartRound: null, // 局數篩選 (起)
                    filterEndRound: null,   // 局數篩選 (迄)
                    currentRound: 0,
                    
                    // 全域統計資料
                    stats: getEmptyStats(),
                    
                    // 批次統計 (切片) 相關
                    batchSize: 1200,
                    batches: [], // 儲存已完成的批次
                    currentBatchStats: getEmptyStats(), // 當前進行中的批次
                    selectedBatch: null, // 用於 Batch Modal 顯示
                    
                    // 基礎押注額 (前端固定 UI)
                    baseBetUnit: 100,

                    // 初始化 9 宮格 UI 狀態
                    grids: Array.from({length: 9}, (_, i) => ({
                        id: i + 1,
                        bet: false,
                        balls: 0,
                        baseLightning: 0,
                        purchasedLightning: 0
                    })),

                    // 整合設定檔 
                    appConfig: JSON.parse(JSON.stringify(DEFAULT_CONFIG))
                }
            },
            computed: {
                selectedCount() {
                    return this.grids.filter(g => g.bet).length;
                },
                isAllSelected() {
                    return this.selectedCount === 9;
                },
                isAllVersionsSelected() {
                    return this.availableVersions.length > 0 && this.selectedVersions.length === this.availableVersions.length;
                },
                isAllRoundsSelected() {
                    return this.availableRounds.length > 0 && this.selectedRounds.length === this.availableRounds.length;
                },
                totalCost() {
                    let baseCost = this.selectedCount * this.baseBetUnit;
                    if (this.buyExtraLightning) {
                        return baseCost + (baseCost * this.appConfig.mainGame.extraPurchaseCostPercent);
                    }
                    return baseCost;
                },
                currentGGR() {
                    return -this.balance;
                },
                filteredCsvData() {
                    if (this.selectedVersions.length === 0 || this.selectedRounds.length === 0) return [];
                    return this.csvData.filter(d => this.selectedVersions.includes(d.version) && this.selectedRounds.includes(d.round));
                },
                // 動態計算放大版圖表的寬度 (每個點給足夠的寬度，確保不會擠在一起)
                expandedChartWidth() {
                    // 每個批次給 80px 寬度，最少維持 800px 以免太小
                    return Math.max(800, this.batches.length * 80);
                },
                // 動態計算放大版分佈圖寬度
                expandedDistChartWidth() {
                    if (!this.distributionData.labels) return 800;
                    return Math.max(800, this.distributionData.labels.length * 60);
                },
                // --- 全域 RTP 百分比計算 ---
                currentRTP() { return this.getBatchRTP(this.stats, 'total'); },
                baseRTP() { return this.getBatchRTP(this.stats, 'base'); },
                lightningRTP() { return this.getBatchRTP(this.stats, 'lightning'); },
                bonusRTP() { return this.getBatchRTP(this.stats, 'bonus'); },
                jpRTP() { return this.getBatchRTP(this.stats, 'jp'); },
                // --- 全域其他統計 ---
                patternStats() { return this.getBatchPatternStats(this.stats); },
                strikeCountStats() { return this.getBatchStrikeCountStats(this.stats); },
                gridHitStats() { return this.getBatchGridHitStats(this.stats); },
                totalLightningStrikes() {
                    return this.stats.lightningHits.reduce((a, b) => a + b, 0);
                },
                gridLightningHitStats() { return this.getBatchLightningHitStats(this.stats); },
                totalBonusSafeSpots() {
                    return this.stats.bonusSafeHits.reduce((a, b) => a + b, 0);
                },
                bonusSafeHitStats() { return this.getBatchBonusSafeHitStats(this.stats); },
                
                // 批次列表顯示 (最新的排在前面，若有進行中的切片也顯示出來)
                displayBatches() {
                    let list = [...this.batches];
                    if (this.currentBatchStats.roundsCount > 0) {
                        list.push(this.currentBatchStats);
                    }
                    return list.reverse();
                },

                filteredHistory() {
                    let result = this.history;
                    if (this.historyFilter === 'win') {
                        result = result.filter(r => r.totalWin > 0);
                    } else if (this.historyFilter === 'bonus') {
                        result = result.filter(r => r.bonusTriggered);
                    } else if (this.historyFilter === 'bonus_pass') {
                        result = result.filter(r => r.bonusTriggered && r.bonusSuccess);
                    } else if (this.historyFilter === 'jp') {
                        result = result.filter(r => r.jpWin > 0);
                    }
                    
                    // 套用局數範圍篩選
                    if (this.filterStartRound !== null && this.filterStartRound !== '') {
                        result = result.filter(r => r.round >= this.filterStartRound);
                    }
                    if (this.filterEndRound !== null && this.filterEndRound !== '') {
                        result = result.filter(r => r.round <= this.filterEndRound);
                    }
                    
                    return result;
                },
                displayHistory() {
                    return this.filteredHistory.slice(0, 200);
                },
                
                // --- 分佈圖資料 ---
                distributionData() {
                    const rtps = this.batches.map(b => parseFloat(this.getBatchRTP(b, 'total')));
                    if (rtps.length === 0) return { labels: [], data: [] };

                    const minRtp = Math.min(...rtps);
                    const maxRtp = Math.max(...rtps);
                    const step = parseFloat(this.distributionBinSize) || 2;

                    // 處理浮點數精度，全部乘 100 變整數計算
                    const mult = 100;
                    const stepInt = Math.round(step * mult);
                    
                    const startInt = Math.min(Math.floor(Math.round(minRtp * mult) / stepInt) * stepInt, Math.floor(90 * mult / stepInt) * stepInt);
                    const endInt = Math.max(Math.floor(Math.round(maxRtp * mult) / stepInt) * stepInt + stepInt, Math.ceil(110 * mult / stepInt) * stepInt);

                    let labels = [];
                    let counts = {};

                    for (let i = startInt; i <= endInt; i += stepInt) {
                        const s = i / mult;
                        const e = (i + stepInt) / mult;
                        const label = `${Number(s).toFixed(2)}~${Number(e).toFixed(2)}%`;
                        labels.push(label);
                        counts[label] = 0;
                    }

                    rtps.forEach(rtp => {
                        let binStartInt = Math.floor(Math.round(rtp * mult) / stepInt) * stepInt;
                        if (binStartInt < startInt) binStartInt = startInt;
                        const s = binStartInt / mult;
                        const e = (binStartInt + stepInt) / mult;
                        const label = `${Number(s).toFixed(2)}~${Number(e).toFixed(2)}%`;
                        if (counts[label] !== undefined) {
                            counts[label]++;
                        }
                    });

                    return { labels, data: labels.map(l => counts[l]) };
                },

                minBatchRTP() {
                    if (this.batches.length === 0) return "0.00";
                    const min = Math.min(...this.batches.map(b => parseFloat(this.getBatchRTP(b, 'total'))));
                    return min.toFixed(2);
                },
                maxBatchRTP() {
                    if (this.batches.length === 0) return "0.00";
                    const max = Math.max(...this.batches.map(b => parseFloat(this.getBatchRTP(b, 'total'))));
                    return max.toFixed(2);
                },
                batchesOver100Count() {
                    return this.batches.filter(b => parseFloat(this.getBatchRTP(b, 'total')) >= 100).length;
                },
                batchesOver100Percent() {
                    if (this.batches.length === 0) return "0.00";
                    return ((this.batchesOver100Count / this.batches.length) * 100).toFixed(2);
                }
            },
            watch: {
                simRounds(newVal) {
                    localStorage.setItem('livemines_simRounds', newVal);
                },
                batchSize(newVal) {
                    localStorage.setItem('livemines_batchSize', newVal);
                },
                distributionBinSize(newVal) {
                    if (newVal <= 0) this.distributionBinSize = 0.1;
                    localStorage.setItem('livemines_distBinSize', this.distributionBinSize);
                    this.updateChart();
                }
            },
            mounted() {
                const savedConfig = localStorage.getItem('livemines_config');
                if (savedConfig) {
                    try {
                        const parsed = JSON.parse(savedConfig);
                        if (parsed.mainGame && parsed.bonusGame) {
                            this.appConfig = parsed;
                        }
                    } catch (e) {
                        console.error("本地參數解析失敗，使用預設值", e);
                    }
                }
                
                // 載入暫存的局數與批次設定
                const savedSimRounds = localStorage.getItem('livemines_simRounds');
                if (savedSimRounds) this.simRounds = parseInt(savedSimRounds, 10) || 120000;
                
                const savedBatchSize = localStorage.getItem('livemines_batchSize');
                if (savedBatchSize) this.batchSize = parseInt(savedBatchSize, 10) || 1200;
                
                const savedDistBinSize = localStorage.getItem('livemines_distBinSize');
                if (savedDistBinSize) this.distributionBinSize = parseFloat(savedDistBinSize) || 2;

                // 初始化圖表
                this.initChart();
                this.initDistributionChart();
            },
            methods: {
                // ================== RTP 折線圖功能 ==================
                initChart() {
                    const ctx = document.getElementById('rtpChart').getContext('2d');
                    const self = this;
                    
                    const chartConfig = {
                        type: 'line',
                        plugins: [horizontalLinePlugin],
                        data: {
                            labels: [],
                            datasets: [{
                                label: '批次 RTP (%)',
                                data: [],
                                borderColor: '#4ade80', // Tailwind text-green-400
                                backgroundColor: 'rgba(74, 222, 128, 0.1)',
                                borderWidth: 2,
                                pointBackgroundColor: '#22c55e',
                                pointBorderColor: '#fff',
                                pointRadius: 4,
                                pointHoverRadius: 6,
                                fill: true,
                                tension: 0.3
                            }]
                        },
                        options: {
                            responsive: true,
                            maintainAspectRatio: false,
                            layout: {
                                padding: { left: 10, right: 10 }
                            },
                            onClick: (event, elements) => {
                                if (elements.length > 0) {
                                    const idx = elements[0].index;
                                    const b = self.batches[idx];
                                    if (b) {
                                        self.openBatchModal(b);
                                    }
                                }
                            },
                            onHover: (event, elements, chart) => {
                                chart.canvas.style.cursor = elements.length ? 'pointer' : 'default';
                            },
                            plugins: {
                                legend: { display: false },
                                tooltip: {
                                    backgroundColor: 'rgba(17, 24, 39, 0.95)',
                                    titleColor: '#fbbf24',
                                    bodyColor: '#e5e7eb',
                                    borderColor: '#4b5563',
                                    borderWidth: 1,
                                    padding: 12,
                                    displayColors: false,
                                    callbacks: {
                                        title: function(context) {
                                            const idx = context[0].dataIndex;
                                            const b = self.batches[idx];
                                            if (!b) return '';
                                            return `📦 批次詳情 (局數 #${b.startRound} ~ #${b.endRound})`;
                                        },
                                        label: function(context) {
                                            const idx = context.dataIndex;
                                            const b = self.batches[idx];
                                            if (!b) return '';
                                            return [
                                                `總 RTP: ${self.getBatchRTP(b, 'total')}%`,
                                                `總投入: ${b.totalBet}`,
                                                `總派彩: ${b.totalWin}`,
                                                `基礎 RTP: ${self.getBatchRTP(b, 'base')}%`,
                                                `閃電 RTP: ${self.getBatchRTP(b, 'lightning')}%`,
                                                `Bonus RTP: ${self.getBatchRTP(b, 'bonus')}%`,
                                                `JP RTP: ${self.getBatchRTP(b, 'jp')}%`
                                            ];
                                        }
                                    }
                                }
                            },
                            scales: {
                                x: {
                                    ticks: { color: '#9ca3af' },
                                    grid: { color: '#374151', borderDash: [5, 5] }
                                },
                                y: {
                                    ticks: { 
                                        color: '#9ca3af',
                                        callback: function(value) { return Number(value).toFixed(2) + '%'; }
                                    },
                                    grid: { color: '#374151', borderDash: [5, 5] }
                                }
                            },
                            interaction: {
                                mode: 'index',
                                intersect: false,
                            },
                        }
                    };
                    
                    this.$options.chartInstance = new Chart(ctx, chartConfig);
                },

                initExpandedChart() {
                    const mainCtx = document.getElementById('expandedRtpChart').getContext('2d');
                    const yAxisCtx = document.getElementById('expandedYAxisChart').getContext('2d');
                    const self = this;
                    
                    const commonOptions = {
                        responsive: true,
                        maintainAspectRatio: false,
                        interaction: { mode: 'index', intersect: false },
                    };
                    
                    // --- 主圖表 (會捲動) ---
                    const mainConfig = {
                        type: 'line',
                        plugins: [horizontalLinePlugin],
                        data: {
                            labels: [],
                            datasets: [{
                                label: '批次 RTP (%)',
                                data: [],
                                borderColor: '#4ade80', 
                                backgroundColor: 'rgba(74, 222, 128, 0.1)',
                                borderWidth: 2,
                                pointBackgroundColor: '#22c55e',
                                pointBorderColor: '#fff',
                                pointRadius: 5, // 放大版點位稍微大一點
                                pointHoverRadius: 8,
                                fill: true,
                                tension: 0.3
                            }]
                        },
                        options: {
                            ...commonOptions,
                            layout: {
                                padding: { left: 5, right: 15 } // 讓右邊有空間不被切到
                            },
                            onClick: (event, elements) => {
                                if (elements.length > 0) {
                                    const idx = elements[0].index;
                                    const b = self.batches[idx];
                                    if (b) {
                                        self.openBatchModal(b);
                                    }
                                }
                            },
                            onHover: (event, elements, chart) => {
                                chart.canvas.style.cursor = elements.length ? 'pointer' : 'default';
                            },
                            plugins: {
                                legend: { display: false },
                                tooltip: {
                                    backgroundColor: 'rgba(17, 24, 39, 0.95)',
                                    titleColor: '#fbbf24',
                                    bodyColor: '#e5e7eb',
                                    borderColor: '#4b5563',
                                    borderWidth: 1,
                                    padding: 12,
                                    titleFont: { size: 14 },
                                    bodyFont: { size: 13 },
                                    displayColors: false,
                                    callbacks: {
                                        title: function(context) {
                                            const idx = context[0].dataIndex;
                                            const b = self.batches[idx];
                                            if (!b) return '';
                                            return `📦 批次詳情 (局數 #${b.startRound} ~ #${b.endRound})`;
                                        },
                                        label: function(context) {
                                            const idx = context.dataIndex;
                                            const b = self.batches[idx];
                                            if (!b) return '';
                                            return [
                                                `總 RTP: ${self.getBatchRTP(b, 'total')}%`,
                                                `總投入: ${b.totalBet}`,
                                                `總派彩: ${b.totalWin}`,
                                                `基礎 RTP: ${self.getBatchRTP(b, 'base')}%`,
                                                `閃電 RTP: ${self.getBatchRTP(b, 'lightning')}%`,
                                                `Bonus RTP: ${self.getBatchRTP(b, 'bonus')}%`,
                                                `JP RTP: ${self.getBatchRTP(b, 'jp')}%`
                                            ];
                                        }
                                    }
                                }
                            },
                            scales: {
                                x: {
                                    ticks: { color: '#9ca3af', font: { size: 12 } },
                                    grid: { color: '#374151', borderDash: [5, 5] },
                                    border: { display: false }
                                },
                                y: {
                                    // 隱藏主圖的 Y 軸標籤，交給固定軸顯示以避免重疊
                                    ticks: { display: false },
                                    grid: { color: '#374151', borderDash: [5, 5] },
                                    border: { display: false }
                                }
                            }
                        }
                    };
                    
                    // --- 固定 Y 軸圖表 ---
                    const yAxisConfig = {
                        type: 'line',
                        plugins: [horizontalLinePlugin],
                        data: {
                            labels: [],
                            datasets: [{
                                label: '批次 RTP (%)',
                                data: [],
                                borderColor: 'transparent',
                                backgroundColor: 'transparent',
                                pointRadius: 0,
                                pointHoverRadius: 0
                            }]
                        },
                        options: {
                            ...commonOptions,
                            layout: {
                                padding: { left: 5, right: 0 } // 避免壓縮到 Y 軸標籤
                            },
                            plugins: {
                                legend: { display: false },
                                tooltip: { enabled: false }
                            },
                            scales: {
                                x: {
                                    // 將 X 軸文字變透明，確保與主圖表高度完全對齊
                                    ticks: { color: 'transparent', font: { size: 12 } },
                                    grid: { display: false, drawBorder: false },
                                    border: { display: false }
                                },
                                y: {
                                    // 使用 afterFit 保證 Y 軸有足夠的渲染空間
                                    afterFit: function(scale) {
                                        scale.width = 90; // 強制留出 90px 寬度給 Y 軸文字
                                    },
                                    ticks: { 
                                        color: '#9ca3af',
                                        font: { size: 12 },
                                        callback: function(value) { return Number(value).toFixed(2) + '%'; },
                                        align: 'end',
                                        crossAlign: 'far'
                                    },
                                    grid: { display: false, drawBorder: false },
                                    border: { display: false }
                                }
                            }
                        }
                    };

                    this.$options.expandedChartInstance = new Chart(mainCtx, mainConfig);
                    this.$options.expandedYAxisInstance = new Chart(yAxisCtx, yAxisConfig);
                },
                
                // ================== RTP 分佈圖 (長條圖) ==================
                initDistributionChart() {
                    const ctx = document.getElementById('rtpDistributionChart').getContext('2d');
                    const self = this;
                    const chartConfig = {
                        type: 'bar',
                        data: {
                            labels: [],
                            datasets: [{
                                label: '批次數量',
                                data: [],
                                backgroundColor: function(context) {
                                    const index = context.dataIndex;
                                    const label = context.chart.data.labels[index] || '';
                                    const binStart = parseFloat(label.split('~')[0]);
                                    if (binStart >= 100) return 'rgba(74, 222, 128, 0.8)'; // 綠色
                                    return 'rgba(239, 68, 68, 0.8)'; // 紅色
                                },
                                borderWidth: 0,
                                borderRadius: 4
                            }]
                        },
                        options: {
                            responsive: true,
                            maintainAspectRatio: false,
                            onClick: (event, elements) => {
                                if (elements.length > 0) {
                                    const idx = elements[0].index;
                                    const label = self.$options.distributionChartInstance.data.labels[idx];
                                    self.openBinModal(label);
                                }
                            },
                            onHover: (event, elements, chart) => {
                                chart.canvas.style.cursor = elements.length ? 'pointer' : 'default';
                            },
                            plugins: {
                                legend: { display: false },
                                tooltip: {
                                    backgroundColor: 'rgba(17, 24, 39, 0.95)',
                                    titleColor: '#fbbf24',
                                    bodyColor: '#e5e7eb',
                                    padding: 12,
                                    displayColors: false,
                                    callbacks: {
                                        label: function(context) {
                                            return `該區間共有 ${context.parsed.y} 個批次`;
                                        }
                                    }
                                }
                            },
                            scales: {
                                x: {
                                    ticks: { color: '#9ca3af', font: { size: 11 } },
                                    grid: { display: false }
                                },
                                y: {
                                    ticks: { color: '#9ca3af', stepSize: 1 },
                                    grid: { color: '#374151', borderDash: [5, 5] },
                                    beginAtZero: true
                                }
                            }
                        }
                    };
                    this.$options.distributionChartInstance = new Chart(ctx, chartConfig);
                },

                initExpandedDistributionChart() {
                    const ctx = document.getElementById('expandedDistributionChart').getContext('2d');
                    const self = this;
                    const chartConfig = {
                        type: 'bar',
                        data: {
                            labels: [],
                            datasets: [{
                                label: '批次數量',
                                data: [],
                                backgroundColor: function(context) {
                                    const index = context.dataIndex;
                                    const label = context.chart.data.labels[index] || '';
                                    const binStart = parseFloat(label.split('~')[0]);
                                    if (binStart >= 100) return 'rgba(74, 222, 128, 0.8)'; 
                                    return 'rgba(239, 68, 68, 0.8)'; 
                                },
                                borderWidth: 0,
                                borderRadius: 4
                            }]
                        },
                        options: {
                            responsive: true,
                            maintainAspectRatio: false,
                            onClick: (event, elements) => {
                                if (elements.length > 0) {
                                    const idx = elements[0].index;
                                    const label = self.$options.expandedDistributionChartInstance.data.labels[idx];
                                    self.openBinModal(label);
                                }
                            },
                            onHover: (event, elements, chart) => {
                                chart.canvas.style.cursor = elements.length ? 'pointer' : 'default';
                            },
                            plugins: {
                                legend: { display: false },
                                tooltip: {
                                    backgroundColor: 'rgba(17, 24, 39, 0.95)',
                                    titleColor: '#fbbf24',
                                    bodyColor: '#e5e7eb',
                                    padding: 12,
                                    titleFont: { size: 14 },
                                    bodyFont: { size: 13 },
                                    displayColors: false,
                                    callbacks: {
                                        label: function(context) {
                                            return `該區間共有 ${context.parsed.y} 個批次`;
                                        }
                                    }
                                }
                            },
                            scales: {
                                x: {
                                    ticks: { color: '#9ca3af', font: { size: 12 } },
                                    grid: { display: false }
                                },
                                y: {
                                    ticks: { color: '#9ca3af', font: { size: 12 }, stepSize: 1 },
                                    grid: { color: '#374151', borderDash: [5, 5] },
                                    beginAtZero: true
                                }
                            }
                        }
                    };
                    this.$options.expandedDistributionChartInstance = new Chart(ctx, chartConfig);
                },

                updateChart() {
                    const labels = this.batches.map((b, i) => `B${i+1}`);
                    const data = this.batches.map(b => parseFloat(this.getBatchRTP(b, 'total')));
                    
                    // 更新首頁小圖
                    if (this.$options.chartInstance) {
                        this.$options.chartInstance.data.labels = labels;
                        this.$options.chartInstance.data.datasets[0].data = data;
                        this.$options.chartInstance.update();
                    }
                    
                    // 若有開放大圖，同步更新
                    if (this.showChartModal) {
                        if (this.$options.expandedChartInstance) {
                            this.$options.expandedChartInstance.data.labels = labels;
                            this.$options.expandedChartInstance.data.datasets[0].data = data;
                            this.$options.expandedChartInstance.update();
                            
                            // 強制同步固定 Y 軸的刻度邊界
                            if (this.$options.expandedYAxisInstance) {
                                const yAxis = this.$options.expandedChartInstance.scales.y;
                                if (yAxis) {
                                    this.$options.expandedYAxisInstance.options.scales.y.min = yAxis.min;
                                    this.$options.expandedYAxisInstance.options.scales.y.max = yAxis.max;
                                }
                                this.$options.expandedYAxisInstance.data.labels = labels;
                                this.$options.expandedYAxisInstance.data.datasets[0].data = data;
                                this.$options.expandedYAxisInstance.update();
                            }
                        }
                    }
                    
                    // 更新 RTP 分佈長條圖
                    if (this.$options.distributionChartInstance) {
                        const dist = this.distributionData;
                        this.$options.distributionChartInstance.data.labels = dist.labels;
                        this.$options.distributionChartInstance.data.datasets[0].data = dist.data;
                        this.$options.distributionChartInstance.update();
                    }

                    // 更新 放大版 RTP 分佈長條圖
                    if (this.showDistributionModal && this.$options.expandedDistributionChartInstance) {
                        const dist = this.distributionData;
                        this.$options.expandedDistributionChartInstance.data.labels = dist.labels;
                        this.$options.expandedDistributionChartInstance.data.datasets[0].data = dist.data;
                        this.$options.expandedDistributionChartInstance.update();
                    }
                },

                openChartModal() {
                    if (this.displayBatches.length === 0) return;
                    this.showChartModal = true;
                    // 等待 DOM 渲染 Modal 出來後再綁定/更新 Canvas
                    this.$nextTick(() => {
                        this.initExpandedChart();
                        this.updateChart();
                    });
                },

                closeChartModal() {
                    this.showChartModal = false;
                    // 徹底銷毀實例，確保下次打開不會出錯，並清除畫布殘留
                    if (this.$options.expandedChartInstance) {
                        this.$options.expandedChartInstance.destroy();
                        this.$options.expandedChartInstance = null;
                    }
                    if (this.$options.expandedYAxisInstance) {
                        this.$options.expandedYAxisInstance.destroy();
                        this.$options.expandedYAxisInstance = null;
                    }
                },

                openDistributionChartModal() {
                    if (this.displayBatches.length === 0) return;
                    this.showDistributionModal = true;
                    this.$nextTick(() => {
                        this.initExpandedDistributionChart();
                        this.updateChart();
                    });
                },

                closeDistributionChartModal() {
                    this.showDistributionModal = false;
                    if (this.$options.expandedDistributionChartInstance) {
                        this.$options.expandedDistributionChartInstance.destroy();
                        this.$options.expandedDistributionChartInstance = null;
                    }
                },

                openBinModal(label) {
                    const rtps = this.batches.map(b => parseFloat(this.getBatchRTP(b, 'total')));
                    if (rtps.length === 0) return;
                    
                    const step = parseFloat(this.distributionBinSize) || 2;
                    const mult = 100; // 計算精度控制
                    const minRtp = Math.min(...rtps);
                    const stepInt = Math.round(step * mult);
                    // 必須與分佈圖的 startInt 計算邏輯一致
                    const startInt = Math.min(Math.floor(Math.round(minRtp * mult) / stepInt) * stepInt, Math.floor(90 * mult / stepInt) * stepInt);

                    // 過濾出屬於該區間的批次
                    this.selectedBinBatches = this.batches.filter(b => {
                        const rtp = parseFloat(this.getBatchRTP(b, 'total'));
                        let binStartInt = Math.floor(Math.round(rtp * mult) / stepInt) * stepInt;
                        if (binStartInt < startInt) binStartInt = startInt;
                        
                        const s = binStartInt / mult;
                        const e = (binStartInt + stepInt) / mult;
                        const bLabel = `${Number(s).toFixed(2)}~${Number(e).toFixed(2)}%`;
                        
                        return bLabel === label;
                    }).reverse(); // 最新的排前面

                    this.selectedBinLabel = label;
                    this.showBinModal = true;
                },

                closeBinModal() {
                    this.showBinModal = false;
                    this.selectedBinBatches = [];
                },

                // ================== CSV 匯出功能 ==================
                exportBatchesToCSV() {
                    if (this.displayBatches.length === 0) {
                        alert("目前沒有任何批次資料可以匯出！");
                        return;
                    }

                    // 加入 BOM 使 Excel 能正確識別 UTF-8
                    let csvContent = "\uFEFF"; 
                    
                    // 定義標題列
                    const headers = [
                        "Start Round", "End Round", "Total Rounds", "Total Bet", "Total Win",
                        "Total RTP(%)", "Base RTP(%)", "Lightning RTP(%)", "Bonus RTP(%)", "JP RTP(%)",
                        "3 Same(%)", "2 Same(%)", "All Different(%)",
                        "Grid 1 Drop(%)", "Grid 2 Drop(%)", "Grid 3 Drop(%)", "Grid 4 Drop(%)", "Grid 5 Drop(%)", "Grid 6 Drop(%)", "Grid 7 Drop(%)", "Grid 8 Drop(%)", "Grid 9 Drop(%)",
                        "Lightning Grid 1(%)", "Lightning Grid 2(%)", "Lightning Grid 3(%)", "Lightning Grid 4(%)", "Lightning Grid 5(%)", "Lightning Grid 6(%)", "Lightning Grid 7(%)", "Lightning Grid 8(%)", "Lightning Grid 9(%)",
                        "Bonus Safe 1(%)", "Bonus Safe 2(%)", "Bonus Safe 3(%)", "Bonus Safe 4(%)"
                    ];
                    csvContent += headers.join(",") + "\n";

                    // 處理資料列 (這裡採用時間順序，由最舊到最新)
                    const exportList = [...this.displayBatches].reverse(); 

                    exportList.forEach(b => {
                        const patternStats = this.getBatchPatternStats(b);
                        const gridStats = this.getBatchGridHitStats(b);
                        const lightningStats = this.getBatchLightningHitStats(b);
                        const safeStats = this.getBatchBonusSafeHitStats(b);

                        const row = [
                            b.startRound,
                            b.endRound,
                            b.roundsCount,
                            b.totalBet,
                            b.totalWin,
                            this.getBatchRTP(b, 'total'),
                            this.getBatchRTP(b, 'base'),
                            this.getBatchRTP(b, 'lightning'),
                            this.getBatchRTP(b, 'bonus'),
                            this.getBatchRTP(b, 'jp'),
                            patternStats.threeSame,
                            patternStats.twoSame,
                            patternStats.allDifferent,
                            ...gridStats,
                            ...lightningStats,
                            ...safeStats
                        ];
                        csvContent += row.join(",") + "\n";
                    });

                    // 觸發下載
                    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
                    const link = document.createElement("a");
                    const url = URL.createObjectURL(blob);
                    link.setAttribute("href", url);
                    link.setAttribute("download", `livemines_batches_${new Date().getTime()}.csv`);
                    link.style.visibility = 'hidden';
                    document.body.appendChild(link);
                    link.click();
                    document.body.removeChild(link);
                },

                // ================== 切片統計格式化輔助函式 ==================
                // 讓全域與各切片都能共用同一套計算邏輯
                getBatchRTP(b, type) {
                    if (!b || b.totalBet === 0) return "0.00";
                    if (type === 'total') return ((b.totalWin / b.totalBet) * 100).toFixed(2);
                    if (type === 'base') return ((b.totalBaseWin / b.totalBet) * 100).toFixed(2);
                    if (type === 'lightning') return ((b.totalLightningWin / b.totalBet) * 100).toFixed(2);
                    if (type === 'bonus') return ((b.totalBonusWin / b.totalBet) * 100).toFixed(2);
                    if (type === 'jp') return ((b.totalJpWin / b.totalBet) * 100).toFixed(2);
                    return "0.00";
                },
                getBatchPatternStats(b) {
                    const count = b.roundsCount || this.currentRound;
                    if (!b || count === 0) return { threeSame: "0.00", twoSame: "0.00", allDifferent: "0.00" };
                    return {
                        threeSame: ((b.patterns.threeSame / count) * 100).toFixed(2),
                        twoSame: ((b.patterns.twoSame / count) * 100).toFixed(2),
                        allDifferent: ((b.patterns.allDifferent / count) * 100).toFixed(2)
                    };
                },
                getBatchStrikeCountStats(b) {
                    const count = b.roundsCount || this.currentRound;
                    if (!b || count === 0) return {};
                    let res = {};
                    Object.keys(b.strikeCounts).sort((x, y) => x - y).forEach(k => {
                        res[k] = ((b.strikeCounts[k] / count) * 100).toFixed(2);
                    });
                    return res;
                },
                getBatchGridHitStats(b) {
                    const count = b.roundsCount || this.currentRound;
                    const totalBalls = count * this.appConfig.mainGame.numberOfBalls;
                    if (!b || totalBalls === 0) return Array(9).fill("0.00");
                    return b.gridHits.map(hits => ((hits / totalBalls) * 100).toFixed(2));
                },
                getBatchLightningHitStats(b) {
                    if (!b) return Array(9).fill("0.00");
                    const totalL = b.lightningHits.reduce((sum, h) => sum + h, 0);
                    if (totalL === 0) return Array(9).fill("0.00");
                    return b.lightningHits.map(hits => ((hits / totalL) * 100).toFixed(2));
                },
                getBatchBonusSafeHitStats(b) {
                    if (!b) return Array(4).fill("0.00");
                    const totalS = b.bonusSafeHits.reduce((sum, h) => sum + h, 0);
                    if (totalS === 0) return Array(4).fill("0.00");
                    return b.bonusSafeHits.map(hits => ((hits / totalS) * 100).toFixed(2));
                },
                
                openBatchModal(b) {
                    this.selectedBatch = b;
                },
                closeBatchModal() {
                    this.selectedBatch = null;
                },

                // ================== CSV 處理 ==================
                handleFileUpload(event) {
                    const file = event.target.files[0];
                    if (!file) return;
                    
                    const reader = new FileReader();
                    reader.onload = (e) => {
                        const text = e.target.result;
                        const lines = text.split('\n');
                        const data = [];
                        
                        let startIndex = lines[0].includes('barrier_version') ? 1 : 0;
                        
                        for (let i = startIndex; i < lines.length; i++) {
                            if (!lines[i].trim()) continue;
                            const cols = lines[i].split(',');
                            if (cols.length >= 5) {
                                data.push({
                                    version: cols[0].trim(),
                                    round: cols[1].trim(),
                                    balls: [parseInt(cols[2].trim()), parseInt(cols[3].trim()), parseInt(cols[4].trim())]
                                });
                            }
                        }
                        
                        this.csvData = data;
                        this.availableVersions = [...new Set(data.map(d => d.version))];
                        
                        if (this.availableVersions.length > 0) {
                            this.selectedVersions = [this.availableVersions[0]];
                            this.updateAvailableRounds();
                        }
                        this.csvDataIndex = 0; 
                    };
                    reader.readAsText(file);
                },
                
                updateAvailableRounds() {
                    const rounds = this.csvData
                        .filter(d => this.selectedVersions.includes(d.version))
                        .map(d => d.round);
                    this.availableRounds = [...new Set(rounds)];
                    
                    this.selectedRounds = this.selectedRounds.filter(r => this.availableRounds.includes(r));
                    
                    if (this.selectedRounds.length === 0 && this.availableRounds.length > 0) {
                        this.selectedRounds = [this.availableRounds[0]];
                    }
                    this.csvDataIndex = 0; 
                },
                
                resetCsvIndex() {
                    this.csvDataIndex = 0; 
                },

                // ================== 清除資料 ==================
                clearData() {
                    if (!confirm("確定要清除所有的統計資料與歷史紀錄嗎？")) return;
                    
                    this.balance = 0;
                    this.lastResult = null;
                    this.selectedHistoryRecord = null;
                    this.selectedBatch = null;
                    this.showBinModal = false;
                    this.selectedBinBatches = [];
                    this.history = [];
                    this.currentRound = 0;
                    this.csvDataIndex = 0; 
                    
                    this.stats = getEmptyStats();
                    this.batches = [];
                    this.currentBatchStats = getEmptyStats();

                    this.grids.forEach(g => {
                        g.balls = 0;
                        g.baseLightning = 0;
                        g.purchasedLightning = 0;
                    });
                    
                    this.updateChart(); // 清除圖表資料
                },

                // ================== UI 互動 ==================
                toggleBet(id) {
                    if (this.isPlaying) return;
                    const grid = this.grids.find(g => g.id === id);
                    if (grid) grid.bet = !grid.bet;
                },
                
                toggleAllBets() {
                    if (this.isPlaying) return;
                    const currentAllSelected = this.isAllSelected;
                    this.grids.forEach(g => g.bet = !currentAllSelected);
                },

                toggleAllVersions() {
                    if (this.isAllVersionsSelected) {
                        this.selectedVersions = [];
                    } else {
                        this.selectedVersions = [...this.availableVersions];
                    }
                    this.updateAvailableRounds();
                },

                toggleAllRounds() {
                    if (this.isAllRoundsSelected) {
                        this.selectedRounds = [];
                    } else {
                        this.selectedRounds = [...this.availableRounds];
                    }
                    this.resetCsvIndex();
                },

                openHistoryModal(record) {
                    this.selectedHistoryRecord = record;
                },
                closeHistoryModal() {
                    this.selectedHistoryRecord = null;
                },
                
                // Config Modal 相關邏輯
                openConfigModal() {
                    this.tempConfigText = JSON.stringify(this.appConfig, null, 4);
                    this.showConfigModal = true;
                },
                closeConfigModal() {
                    this.showConfigModal = false;
                },
                saveConfig() {
                    try {
                        let newConfig = JSON.parse(this.tempConfigText);
                        
                        if (!newConfig.mainGame || typeof newConfig.mainGame.numberOfBalls !== 'number') {
                            throw new Error("缺少 mainGame 節點或參數格式錯誤");
                        }
                        if (!newConfig.lightningFeature || !newConfig.purchasedLightningFeature) {
                            throw new Error("缺少閃電模組 (lightningFeature / purchasedLightningFeature) 節點");
                        }
                        if (!newConfig.bonusGame || !newConfig.bonusGame.levelSettings || !Array.isArray(newConfig.bonusGame.levelSettings.payouts)) {
                            throw new Error("缺少 bonusGame 節點或 levelSettings 結構不完整");
                        }

                        this.appConfig = newConfig;
                        
                        localStorage.setItem('livemines_config', JSON.stringify(newConfig));
                        
                        if(this.bonusTargetLevel > this.appConfig.bonusGame.levelSettings.payouts.length) {
                            this.bonusTargetLevel = 1;
                        }

                        this.closeConfigModal();
                        alert("✅ 參數設定已成功儲存並套用！");
                    } catch (e) {
                        alert("❌ JSON 格式錯誤或缺少必要參數，請檢查！\n錯誤訊息: " + e.message);
                    }
                },
                restoreDefaultConfig() {
                    if (confirm("確定要恢復預設參數嗎？您目前的修改將會被清除。")) {
                        this.appConfig = JSON.parse(JSON.stringify(DEFAULT_CONFIG));
                        localStorage.removeItem('livemines_config');
                        
                        if(this.bonusTargetLevel > this.appConfig.bonusGame.levelSettings.payouts.length) {
                            this.bonusTargetLevel = 1;
                        }
                        
                        alert("✅ 已成功恢復為預設參數！");
                        this.closeConfigModal();
                    }
                },
                
                // ================== 核心模擬邏輯 ==================
                
                sampleWeightedWithoutReplacement(items, weights, n) {
                    let availableItems = [...items];
                    let availableWeights = [...weights];
                    let selectedItems = [];

                    for (let i = 0; i < n; i++) {
                        if (availableItems.length === 0) break;
                        
                        let totalWeight = availableWeights.reduce((sum, w) => sum + w, 0);
                        if (totalWeight <= 0) {
                            // 若權重異常，退回純隨機
                            const randomIndex = Math.floor(Math.random() * availableItems.length);
                            selectedItems.push(availableItems[randomIndex]);
                            availableItems.splice(randomIndex, 1);
                            availableWeights.splice(randomIndex, 1);
                            continue;
                        }

                        let rand = Math.random() * totalWeight;
                        let sum = 0;
                        let selectedIdx = -1;

                        for (let j = 0; j < availableWeights.length; j++) {
                            sum += availableWeights[j];
                            if (rand <= sum) {
                                selectedIdx = j;
                                break;
                            }
                        }

                        if (selectedIdx === -1) selectedIdx = availableWeights.length - 1;

                        selectedItems.push(availableItems[selectedIdx]);
                        availableItems.splice(selectedIdx, 1);
                        availableWeights.splice(selectedIdx, 1);
                    }

                    return selectedItems;
                },

                sampleWithoutReplacement(arr, n) {
                    let result = [...arr];
                    for (let i = result.length - 1; i > 0; i--) {
                        const j = Math.floor(Math.random() * (i + 1));
                        [result[i], result[j]] = [result[j], result[i]];
                    }
                    return result.slice(0, n);
                },

                getWeightedRandom(featureConfig) {
                    const values = featureConfig.values;
                    const weights = featureConfig.weights;
                    const totalWeight = weights.reduce((sum, w) => sum + w, 0);
                    let rand = Math.floor(Math.random() * totalWeight);
                    for (let i = 0; i < weights.length; i++) {
                        if (rand < weights[i]) return values[i];
                        rand -= weights[i];
                    }
                    return values[0];
                },

                checkExecutionCondition() {
                    if (this.totalCost === 0) {
                        alert("請先至少選擇一個格子進行押注！");
                        return false;
                    }
                    if (this.dataSourceMode === 'csv' && this.filteredCsvData.length === 0) {
                        alert("請先上傳並選擇有效的 CSV 真實掉落數據 (請確認有勾選 Version 與 Round)，或者切換為理論隨機模式！");
                        return false;
                    }
                    if (this.batchSize < 1) {
                        alert("批次局數必須至少為 1！");
                        return false;
                    }
                    return true;
                },

                runSimulations(times) {
                    if (!this.checkExecutionCondition()) return;
                    times = Math.max(1, parseInt(times) || 1); 
                    
                    this.isPlaying = true;
                    this.lastResult = null;
                    const currentCost = this.totalCost;

                    setTimeout(() => {
                        let newRecord = this.simulateSingleRound(currentCost);
                        this.history.unshift(newRecord);
                        
                        // 只保留最多 10 萬筆記憶體
                        if (this.history.length > 100000) {
                            this.history.pop();
                        }
                        
                        this.applyResultToUI(newRecord);
                        this.isPlaying = false;
                        
                        // 若剛好完成一個批次，立即更新圖表
                        if (this.currentBatchStats.roundsCount === 0) {
                            this.updateChart();
                        }
                    }, 50);
                },

                startBatchSimulations() {
                    if (!this.checkExecutionCondition() || this.simRounds < 1) return;
                    
                    this.totalSimToRun = Math.max(1, parseInt(this.simRounds) || 1);
                    this.simulatedCount = 0;
                    this.progressPercent = 0;
                    this.isPlaying = true;
                    this.lastResult = null;
                    
                    const currentCost = this.totalCost;
                    const batchSize = Math.max(1, Math.min(1000, Math.floor(this.totalSimToRun / 20))); 
                    
                    let newRecordsBuffer = [];

                    const runBatch = () => {
                        let runsThisBatch = 0;
                        
                        while (runsThisBatch < batchSize && this.simulatedCount < this.totalSimToRun) {
                            newRecordsBuffer.push(this.simulateSingleRound(currentCost));
                            runsThisBatch++;
                            this.simulatedCount++;
                        }

                        this.progressPercent = (this.simulatedCount / this.totalSimToRun) * 100;

                        if (this.simulatedCount < this.totalSimToRun) {
                            requestAnimationFrame(runBatch);
                        } else {
                            this.finishBatchSimulations(newRecordsBuffer);
                        }
                    };

                    requestAnimationFrame(runBatch);
                },

                finishBatchSimulations(newRecordsBuffer) {
                    if (newRecordsBuffer.length > 0) {
                        // 使用更有效率的陣列合併方式，並裁切至 100,000 筆上限
                        this.history = newRecordsBuffer.reverse().concat(this.history);
                        if (this.history.length > 100000) {
                            this.history.length = 100000;
                        }
                        this.applyResultToUI(newRecordsBuffer[0]);
                    }
                    
                    // 處理最後的剩餘切片 (將不足批次大小的進度強制結算為一筆)
                    if (this.currentBatchStats.roundsCount > 0) {
                        this.batches.push(JSON.parse(JSON.stringify(this.currentBatchStats)));
                        this.currentBatchStats = getEmptyStats();
                    }

                    this.isPlaying = false;
                    this.updateChart(); // 更新折線圖
                },

                simulateSingleRound(currentCost) {
                    this.currentRound++;
                    const roundNum = this.currentRound;
                    const allGridIds = [1, 2, 3, 4, 5, 6, 7, 8, 9];
                    
                    // ================= 批次統計準備 =================
                    let cb = this.currentBatchStats;
                    if (cb.roundsCount === 0) {
                        cb.startRound = roundNum;
                    }
                    cb.endRound = roundNum;
                    cb.roundsCount++;

                    let localGrids = Array.from({length: 9}, (_, i) => ({
                        id: i + 1,
                        bet: this.grids[i].bet,
                        balls: 0,
                        baseLightning: 0,
                        purchasedLightning: 0
                    }));

                    // JP 貢獻額加入累積池 (全域與批次同步)
                    let currentJpContribution = currentCost * this.appConfig.bonusGame.jp_contribution_rate;
                    this.stats.totalJpPool += currentJpContribution;
                    cb.totalJpPool += currentJpContribution;

                    // 1. 分配基礎閃電 (套用 config 權重)
                    let numBaseStrikes = this.getWeightedRandom(this.appConfig.lightningFeature.strikes);
                    const baseStrikeIds = this.sampleWeightedWithoutReplacement(allGridIds, this.appConfig.lightningFeature.gridWeights, numBaseStrikes);
                    baseStrikeIds.forEach(id => {
                        localGrids[id - 1].baseLightning = this.getWeightedRandom(this.appConfig.lightningFeature.payoutMultipliers);
                        this.stats.lightningHits[id - 1]++; 
                        cb.lightningHits[id - 1]++;
                    });

                    // 2. 分配付費閃電 (套用 config 權重)
                    let numPurchasedStrikes = 0;
                    if (this.buyExtraLightning) {
                        numPurchasedStrikes = this.getWeightedRandom(this.appConfig.purchasedLightningFeature.strikes);
                        const purchasedStrikeIds = this.sampleWeightedWithoutReplacement(allGridIds, this.appConfig.purchasedLightningFeature.gridWeights, numPurchasedStrikes);
                        purchasedStrikeIds.forEach(id => {
                            localGrids[id - 1].purchasedLightning = this.getWeightedRandom(this.appConfig.purchasedLightningFeature.payoutMultipliers);
                            this.stats.lightningHits[id - 1]++; 
                            cb.lightningHits[id - 1]++;
                        });
                    }

                    // 紀錄本局閃電總次數
                    let totalStrikesThisRound = numBaseStrikes + numPurchasedStrikes;
                    this.stats.strikeCounts[totalStrikesThisRound] = (this.stats.strikeCounts[totalStrikesThisRound] || 0) + 1;
                    cb.strikeCounts[totalStrikesThisRound] = (cb.strikeCounts[totalStrikesThisRound] || 0) + 1;

                    // 3. 執行落球
                    let csvInfo = null;
                    if (this.dataSourceMode === 'csv' && this.filteredCsvData.length > 0) {
                        const dataIndex = this.csvDataIndex % this.filteredCsvData.length;
                        const dropData = this.filteredCsvData[dataIndex];
                        this.csvDataIndex++;
                        
                        csvInfo = { version: dropData.version, round: dropData.round, index: dataIndex + 1 };
                        
                        dropData.balls.forEach(ballPos => {
                            let idx = ballPos - 1;
                            if (idx >= 0 && idx < 9) {
                                localGrids[idx].balls += 1;
                            }
                        });
                    } else {
                        for (let i = 0; i < this.appConfig.mainGame.numberOfBalls; i++) {
                            let targetIdx = Math.floor(Math.random() * this.appConfig.mainGame.numberOfGrids);
                            localGrids[targetIdx].balls += 1;
                        }
                    }

                    // 4. 計算分數
                    let totalWin = 0;
                    let roundBaseWin = 0;
                    let roundLightningWin = 0;
                    let roundBonusWin = 0;
                    let jpWin = 0; 
                    let details = [];
                    
                    let bonusTriggered = false;
                    let bonusSuccess = false;
                    let bonusWin = 0;
                    let bonusResultText = "";
                    let bonusLevelHistory = null; 

                    let hasThreeSame = false;
                    let hasTwoSame = false;

                    localGrids.forEach(g => {
                        // 紀錄落點次數
                        this.stats.gridHits[g.id - 1] += g.balls;
                        cb.gridHits[g.id - 1] += g.balls;
                        
                        if (g.balls === 3) hasThreeSame = true;
                        if (g.balls === 2) hasTwoSame = true;

                        // Bonus 觸發
                        if (g.bet && g.balls === 3) {
                            bonusTriggered = true;
                            bonusLevelHistory = [];
                            
                            let currentLevel = 0;
                            let targetLevel = this.bonusTargetLevel;
                            let alive = true;

                            for (let lvl = 0; lvl < targetLevel; lvl++) {
                                let totalChoices = this.appConfig.bonusGame.levelSettings.totalChoices[lvl];
                                let winChoices = this.appConfig.bonusGame.levelSettings.winChoices[lvl];
                                let userPick = this.bonusPositions[lvl]; 
                                
                                let allPositions = Array.from({length: totalChoices}, (_, i) => i + 1);
                                // 注意：BONUS 翻牌本身就是完全隨機，不套用網格閃電權重，所以維持一般 sampleWithoutReplacement
                                let winningSpots = this.sampleWithoutReplacement(allPositions, winChoices);
                                
                                // 紀錄安全位置統計
                                winningSpots.forEach(spot => {
                                    this.stats.bonusSafeHits[spot - 1]++;
                                    cb.bonusSafeHits[spot - 1]++;
                                });

                                let passed = winningSpots.includes(userPick);
                                
                                bonusLevelHistory.push({
                                    level: lvl + 1,
                                    pick: userPick,
                                    safe: winningSpots.sort((a, b) => a - b),
                                    passed: passed
                                });
                                
                                if (passed) {
                                    currentLevel++;
                                } else {
                                    alive = false; 
                                    break;
                                }
                            }

                            if (alive) {
                                bonusSuccess = true;
                                let payoutMult = this.appConfig.bonusGame.levelSettings.payouts[targetLevel - 1];
                                bonusWin = this.baseBetUnit * payoutMult;
                                bonusResultText = `成功通關第 ${targetLevel} 層！獲得 ${payoutMult} 倍`;
                                
                                // JP 條件 (通關終局)
                                if (targetLevel === this.appConfig.bonusGame.endLevel) {
                                    jpWin = this.stats.totalJpPool; // 贏得累積池
                                    this.stats.totalJpPool = 0;     // 累積池歸零 (注意: 這裡只歸零全域，批次內的只是數據紀錄，批次本身的 Pool 會結算進 Win)
                                    // 將該局的池子轉移至 JP 贏分
                                    cb.totalJpPool = 0;
                                }
                            } else {
                                bonusSuccess = false;
                                bonusWin = 0;
                                bonusResultText = `在第 ${currentLevel + 1} 層觸雷失敗，獎金歸零`;
                            }

                            roundBonusWin += bonusWin;
                            totalWin += (bonusWin + jpWin);
                        }

                        // 計算一般贏分
                        if (g.bet && g.balls > 0) {
                            let payoutIndex = Math.min(g.balls - 1, this.appConfig.mainGame.singleAreaBasePayouts.length - 1);
                            let payout = this.appConfig.mainGame.singleAreaBasePayouts[payoutIndex];
                            
                            let baseWinPart = this.baseBetUnit * payout;
                            let lightningWinPart = baseWinPart * (g.baseLightning + g.purchasedLightning);
                            let cellTotalWin = baseWinPart + lightningWinPart;
                            
                            roundBaseWin += baseWinPart;
                            roundLightningWin += lightningWinPart;
                            totalWin += cellTotalWin;

                            details.push({
                                grid: g.id,
                                balls: g.balls,
                                basePayout: payout,
                                baseL: g.baseLightning,
                                purchasedL: g.purchasedLightning,
                                win: cellTotalWin
                            });
                        }
                    });

                    // 更新球型佔比
                    if (hasThreeSame) { this.stats.patterns.threeSame++; cb.patterns.threeSame++; } 
                    else if (hasTwoSame) { this.stats.patterns.twoSame++; cb.patterns.twoSame++; } 
                    else { this.stats.patterns.allDifferent++; cb.patterns.allDifferent++; }

                    // 更新總統計數據與餘額
                    this.stats.totalBet += currentCost; cb.totalBet += currentCost;
                    this.stats.totalWin += totalWin; cb.totalWin += totalWin;
                    this.stats.totalBaseWin += roundBaseWin; cb.totalBaseWin += roundBaseWin;
                    this.stats.totalLightningWin += roundLightningWin; cb.totalLightningWin += roundLightningWin;
                    this.stats.totalBonusWin += roundBonusWin; cb.totalBonusWin += roundBonusWin;
                    this.stats.totalJpWin += jpWin; cb.totalJpWin += jpWin;
                    this.balance += (totalWin - currentCost);

                    // ================= 批次處理結算 =================
                    if (cb.roundsCount >= this.batchSize) {
                        this.batches.push(JSON.parse(JSON.stringify(cb))); // 深拷貝保存
                        this.currentBatchStats = getEmptyStats(); // 重新起一個新批次
                    }

                    // 【核心優化】使用 Object.freeze 將結果變成唯讀，避免 Vue 為每筆歷史紀錄建立代理
                    // 這能大幅度節省龐大數據(如 10 萬筆)的記憶體開銷與渲染效能。
                    return Object.freeze({
                        round: roundNum,
                        cost: currentCost,
                        totalWin: totalWin,
                        netProfit: totalWin - currentCost,
                        details: details,
                        bonusTriggered: bonusTriggered,
                        bonusSuccess: bonusSuccess,
                        bonusWin: bonusWin,
                        jpWin: jpWin, 
                        csvInfo: csvInfo, 
                        bonusResultText: bonusResultText,
                        bonusLevelHistory: bonusLevelHistory, 
                        finalGridsState: localGrids 
                    });
                },

                applyResultToUI(result) {
                    this.lastResult = result;
                    for(let i=0; i<9; i++) {
                        this.grids[i].balls = result.finalGridsState[i].balls;
                        this.grids[i].baseLightning = result.finalGridsState[i].baseLightning;
                        this.grids[i].purchasedLightning = result.finalGridsState[i].purchasedLightning;
                    }
                }
            }
        
};

</script>
