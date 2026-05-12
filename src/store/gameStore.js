import { defineStore } from 'pinia';
import { nextTick, markRaw } from 'vue';
import { Chart, registerables } from 'chart.js';
import { DEFAULT_CONFIG, getEmptyStats } from '../utils/constants';
import { simulateRound, accumulateStats } from '../engine/SimulationEngine';
import { calculateBatchSettlement } from '../engine/AgentSettlementEngine';
import { processAgentData, calculatePersonaStats } from '../engine/AgentDataLoader';
import { buildAgentRoundDecision } from '../engine/AgentDecisionEngine';

Chart.register(...registerables);

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

export const useGameStore = defineStore('game', {
    state: () => ({
        balance: 0,
        buyExtraLightning: false,
        bonusTargetLevel: 1, 
        simRounds: 120000,     
        bonusPositions: [1, 1, 1, 1, 1], 
        isPlaying: false,

        // --- Milestone 1: Agent Traffic Mode ---
        simulationMode: 'manual', // 'manual' | 'agentTraffic'
        agentTrafficEnabled: false,
        currentTotalAgentCost: 0,
        currentAgentDecisions: [],
        isGridDetailsModalOpen: false,
        selectedGridId: null,
        trafficScenario: {
            roundsPerDay: 1200,
            daysToSimulate: 1,
            gridBehavior: 'base',      // conservative | base | aggressive
            bonusRisk: 'base',         // conservative | base | aggressive
            lightningPriceSensitivity: 0,
            betAmountMultiplier: 1.0,
            maxAgentBetAmount: 100000
        },
        trafficCurrentDay: 0,
        trafficCurrentRoundInDay: 0,
        trafficHistory: [],
        trafficDaySummaries: [],
        trafficPersonaStats: {},
        trafficAgentStats: {},
        agentPool: [],
        agentRuntimeMap: null, 
        activeAgentsBucket: null, // [ [agent1, agent2], [agent2, agent3]... ] length = roundsPerDay
        plannedDayActiveCount: 0,
        estimatedPeakActiveCount: 0,
        // ----------------------------------------
        
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
        showActiveAgentsModal: false,
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
        
        // 預設單格押注金額 (用於「全選」快速填入)
        defaultBetUnit: 100,

        // 初始化 9 宮格 UI 狀態 (betAmount=0 表示不押注)
        grids: Array.from({length: 9}, (_, i) => ({
            id: i + 1,
            betAmount: 0,   // 每格可獨立輸入金額，0 = 不押
            balls: 0,
            baseLightning: 0,
            purchasedLightning: 0
        })),

        // 整合設定檔 
        appConfig: JSON.parse(JSON.stringify(DEFAULT_CONFIG)),

        // Chart instances
        chartInstance: null,
        expandedChartInstance: null,
        expandedYAxisInstance: null,
        distributionChartInstance: null,
        expandedDistributionChartInstance: null
    }),
    
    getters: {
        // --- Milestone 4: Runtime Getters ---
        trafficCurrentDay() {
            const rpd = this.trafficScenario.roundsPerDay || 1200;
            return Math.floor(this.currentRound / rpd) + 1;
        },
        trafficRoundIndexInDay() {
            const rpd = this.trafficScenario.roundsPerDay || 1200;
            return this.currentRound % rpd;
        },
        trafficTimeOfDay() {
            const totalSeconds = (this.trafficRoundIndexInDay / (this.trafficScenario.roundsPerDay || 1200)) * 86400;
            const h = Math.floor(totalSeconds / 3600).toString().padStart(2, '0');
            const m = Math.floor((totalSeconds % 3600) / 60).toString().padStart(2, '0');
            const s = Math.floor(totalSeconds % 60).toString().padStart(2, '0');
            return `${h}:${m}:${s}`;
        },
        currentActiveAgents(state) {
            if (state.simulationMode !== 'agentTraffic' || !state.activeAgentsBucket) return [];
            
            const roundIndexInDay = state.trafficRoundIndexInDay;
            if (roundIndexInDay >= 0 && roundIndexInDay < state.activeAgentsBucket.length) {
                return state.activeAgentsBucket[roundIndexInDay];
            }
            return [];
        },
        // ------------------------------------

        selectedCount() {
            return this.grids.filter(g => g.betAmount > 0).length;
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
            if (this.simulationMode === 'agentTraffic') {
                return this.currentTotalAgentCost || 0;
            }
            let baseCost = this.grids.reduce((sum, g) => sum + (g.betAmount || 0), 0);
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
        expandedChartWidth() {
            return Math.max(800, this.batches.length * 80);
        },
        expandedDistChartWidth() {
            if (!this.distributionData.labels) return 800;
            return Math.max(800, this.distributionData.labels.length * 60);
        },
        currentRTP() { return this.getBatchRTP(this.stats, 'total'); },
        baseRTP() { return this.getBatchRTP(this.stats, 'base'); },
        lightningRTP() { return this.getBatchRTP(this.stats, 'lightning'); },
        bonusRTP() { return this.getBatchRTP(this.stats, 'bonus'); },
        jpRTP() { return this.getBatchRTP(this.stats, 'jp'); },
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
        distributionData() {
            const rtps = this.batches.map(b => parseFloat(this.getBatchRTP(b, 'total')));
            if (rtps.length === 0) return { labels: [], data: [] };

            const minRtp = Math.min(...rtps);
            const maxRtp = Math.max(...rtps);
            const step = parseFloat(this.distributionBinSize) || 2;

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
    
    actions: {
        openGridDetails(gridId) {
            this.selectedGridId = gridId;
            this.isGridDetailsModalOpen = true;
        },
        closeGridDetails() {
            this.isGridDetailsModalOpen = false;
            this.selectedGridId = null;
        },
        initializeStore() {
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
            
            const savedSimRounds = localStorage.getItem('livemines_simRounds');
            if (savedSimRounds) this.simRounds = parseInt(savedSimRounds, 10) || 120000;
            
            const savedBatchSize = localStorage.getItem('livemines_batchSize');
            if (savedBatchSize) this.batchSize = parseInt(savedBatchSize, 10) || 1200;
            
            const savedDistBinSize = localStorage.getItem('livemines_distBinSize');
            if (savedDistBinSize) this.distributionBinSize = parseFloat(savedDistBinSize) || 2;

            this.initChart();
            this.initDistributionChart();
        },

        initChart() {
            const ctx = document.getElementById('rtpChart')?.getContext('2d');
            if (!ctx) return;
            const self = this;
            
            const chartConfig = {
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
                        pointRadius: 4,
                        pointHoverRadius: 6,
                        fill: true,
                        tension: 0.3
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    layout: { padding: { left: 10, right: 10 } },
                    onClick: (event, elements) => {
                        if (elements.length > 0) {
                            const idx = elements[0].index;
                            const b = self.batches[idx];
                            if (b) self.openBatchModal(b);
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
                        x: { ticks: { color: '#9ca3af' }, grid: { color: '#374151', borderDash: [5, 5] } },
                        y: { ticks: { color: '#9ca3af', callback: function(value) { return Number(value).toFixed(2) + '%'; } }, grid: { color: '#374151', borderDash: [5, 5] } }
                    },
                    interaction: { mode: 'index', intersect: false }
                }
            };
            this.chartInstance = markRaw(new Chart(ctx, chartConfig));
        },

        initExpandedChart() {
            const mainCtx = document.getElementById('expandedRtpChart')?.getContext('2d');
            const yAxisCtx = document.getElementById('expandedYAxisChart')?.getContext('2d');
            if (!mainCtx || !yAxisCtx) return;
            const self = this;
            
            const commonOptions = { responsive: true, maintainAspectRatio: false, interaction: { mode: 'index', intersect: false } };
            
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
                        pointRadius: 5,
                        pointHoverRadius: 8,
                        fill: true,
                        tension: 0.3
                    }]
                },
                options: {
                    ...commonOptions,
                    layout: { padding: { left: 5, right: 15 } },
                    onClick: (event, elements) => {
                        if (elements.length > 0) {
                            const idx = elements[0].index;
                            const b = self.batches[idx];
                            if (b) self.openBatchModal(b);
                        }
                    },
                    onHover: (event, elements, chart) => { chart.canvas.style.cursor = elements.length ? 'pointer' : 'default'; },
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
                        x: { ticks: { color: '#9ca3af', font: { size: 12 } }, grid: { color: '#374151', borderDash: [5, 5] }, border: { display: false } },
                        y: { ticks: { display: false }, grid: { color: '#374151', borderDash: [5, 5] }, border: { display: false } }
                    }
                }
            };
            
            const yAxisConfig = {
                type: 'line',
                plugins: [horizontalLinePlugin],
                data: {
                    labels: [],
                    datasets: [{ label: '批次 RTP (%)', data: [], borderColor: 'transparent', backgroundColor: 'transparent', pointRadius: 0, pointHoverRadius: 0 }]
                },
                options: {
                    ...commonOptions,
                    layout: { padding: { left: 5, right: 0 } },
                    plugins: { legend: { display: false }, tooltip: { enabled: false } },
                    scales: {
                        x: { ticks: { color: 'transparent', font: { size: 12 } }, grid: { display: false, drawBorder: false }, border: { display: false } },
                        y: {
                            afterFit: function(scale) { scale.width = 90; },
                            ticks: { color: '#9ca3af', font: { size: 12 }, callback: function(value) { return Number(value).toFixed(2) + '%'; }, align: 'end', crossAlign: 'far' },
                            grid: { display: false, drawBorder: false },
                            border: { display: false }
                        }
                    }
                }
            };

            this.expandedChartInstance = markRaw(new Chart(mainCtx, mainConfig));
            this.expandedYAxisInstance = markRaw(new Chart(yAxisCtx, yAxisConfig));
        },
        
        initDistributionChart() {
            const ctx = document.getElementById('rtpDistributionChart')?.getContext('2d');
            if (!ctx) return;
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
                            const label = self.distributionChartInstance.data.labels[idx];
                            self.openBinModal(label);
                        }
                    },
                    onHover: (event, elements, chart) => { chart.canvas.style.cursor = elements.length ? 'pointer' : 'default'; },
                    plugins: {
                        legend: { display: false },
                        tooltip: {
                            backgroundColor: 'rgba(17, 24, 39, 0.95)',
                            titleColor: '#fbbf24',
                            bodyColor: '#e5e7eb',
                            padding: 12,
                            displayColors: false,
                            callbacks: { label: function(context) { return `該區間共有 ${context.parsed.y} 個批次`; } }
                        }
                    },
                    scales: {
                        x: { ticks: { color: '#9ca3af', font: { size: 11 } }, grid: { display: false } },
                        y: { ticks: { color: '#9ca3af', stepSize: 1 }, grid: { color: '#374151', borderDash: [5, 5] }, beginAtZero: true }
                    }
                }
            };
            this.distributionChartInstance = markRaw(new Chart(ctx, chartConfig));
        },

        initExpandedDistributionChart() {
            const ctx = document.getElementById('expandedDistributionChart')?.getContext('2d');
            if (!ctx) return;
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
                            const label = self.expandedDistributionChartInstance.data.labels[idx];
                            self.openBinModal(label);
                        }
                    },
                    onHover: (event, elements, chart) => { chart.canvas.style.cursor = elements.length ? 'pointer' : 'default'; },
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
                            callbacks: { label: function(context) { return `該區間共有 ${context.parsed.y} 個批次`; } }
                        }
                    },
                    scales: {
                        x: { ticks: { color: '#9ca3af', font: { size: 12 } }, grid: { display: false } },
                        y: { ticks: { color: '#9ca3af', font: { size: 12 }, stepSize: 1 }, grid: { color: '#374151', borderDash: [5, 5] }, beginAtZero: true }
                    }
                }
            };
            this.expandedDistributionChartInstance = markRaw(new Chart(ctx, chartConfig));
        },

        updateChart() {
            const labels = this.batches.map((b, i) => `B${i+1}`);
            const data = this.batches.map(b => parseFloat(this.getBatchRTP(b, 'total')));
            
            if (this.chartInstance) {
                this.chartInstance.data.labels = labels;
                this.chartInstance.data.datasets[0].data = data;
                this.chartInstance.update();
            }
            
            if (this.showChartModal) {
                if (this.expandedChartInstance) {
                    this.expandedChartInstance.data.labels = labels;
                    this.expandedChartInstance.data.datasets[0].data = data;
                    this.expandedChartInstance.update();
                    
                    if (this.expandedYAxisInstance) {
                        const yAxis = this.expandedChartInstance.scales.y;
                        if (yAxis) {
                            this.expandedYAxisInstance.options.scales.y.min = yAxis.min;
                            this.expandedYAxisInstance.options.scales.y.max = yAxis.max;
                        }
                        this.expandedYAxisInstance.data.labels = labels;
                        this.expandedYAxisInstance.data.datasets[0].data = data;
                        this.expandedYAxisInstance.update();
                    }
                }
            }
            
            if (this.distributionChartInstance) {
                const dist = this.distributionData;
                this.distributionChartInstance.data.labels = dist.labels;
                this.distributionChartInstance.data.datasets[0].data = dist.data;
                this.distributionChartInstance.update();
            }

            if (this.showDistributionModal && this.expandedDistributionChartInstance) {
                const dist = this.distributionData;
                this.expandedDistributionChartInstance.data.labels = dist.labels;
                this.expandedDistributionChartInstance.data.datasets[0].data = dist.data;
                this.expandedDistributionChartInstance.update();
            }
        },

        openChartModal() {
            if (this.displayBatches.length === 0) return;
            this.showChartModal = true;
            nextTick(() => {
                this.initExpandedChart();
                this.updateChart();
            });
        },

        closeChartModal() {
            this.showChartModal = false;
            if (this.expandedChartInstance) {
                this.expandedChartInstance.destroy();
                this.expandedChartInstance = null;
            }
            if (this.expandedYAxisInstance) {
                this.expandedYAxisInstance.destroy();
                this.expandedYAxisInstance = null;
            }
        },

        openDistributionChartModal() {
            if (this.displayBatches.length === 0) return;
            this.showDistributionModal = true;
            nextTick(() => {
                this.initExpandedDistributionChart();
                this.updateChart();
            });
        },

        closeDistributionChartModal() {
            this.showDistributionModal = false;
            if (this.expandedDistributionChartInstance) {
                this.expandedDistributionChartInstance.destroy();
                this.expandedDistributionChartInstance = null;
            }
        },

        openBinModal(label) {
            const rtps = this.batches.map(b => parseFloat(this.getBatchRTP(b, 'total')));
            if (rtps.length === 0) return;
            
            const step = parseFloat(this.distributionBinSize) || 2;
            const mult = 100;
            const minRtp = Math.min(...rtps);
            const stepInt = Math.round(step * mult);
            const startInt = Math.min(Math.floor(Math.round(minRtp * mult) / stepInt) * stepInt, Math.floor(90 * mult / stepInt) * stepInt);

            this.selectedBinBatches = this.batches.filter(b => {
                const rtp = parseFloat(this.getBatchRTP(b, 'total'));
                let binStartInt = Math.floor(Math.round(rtp * mult) / stepInt) * stepInt;
                if (binStartInt < startInt) binStartInt = startInt;
                
                const s = binStartInt / mult;
                const e = (binStartInt + stepInt) / mult;
                const bLabel = `${Number(s).toFixed(2)}~${Number(e).toFixed(2)}%`;
                
                return bLabel === label;
            }).reverse();

            this.selectedBinLabel = label;
            this.showBinModal = true;
        },

        closeBinModal() {
            this.showBinModal = false;
            this.selectedBinBatches = [];
        },

        exportBatchesToCSV() {
            if (this.displayBatches.length === 0) {
                alert("目前沒有任何批次資料可以匯出！");
                return;
            }

            let csvContent = "\uFEFF"; 
            const headers = [
                "Start Round", "End Round", "Total Rounds", "Total Bet", "Total Win",
                "Total RTP(%)", "Base RTP(%)", "Lightning RTP(%)", "Bonus RTP(%)", "JP RTP(%)",
                "3 Same(%)", "2 Same(%)", "All Different(%)",
                "Grid 1 Drop(%)", "Grid 2 Drop(%)", "Grid 3 Drop(%)", "Grid 4 Drop(%)", "Grid 5 Drop(%)", "Grid 6 Drop(%)", "Grid 7 Drop(%)", "Grid 8 Drop(%)", "Grid 9 Drop(%)",
                "Lightning Grid 1(%)", "Lightning Grid 2(%)", "Lightning Grid 3(%)", "Lightning Grid 4(%)", "Lightning Grid 5(%)", "Lightning Grid 6(%)", "Lightning Grid 7(%)", "Lightning Grid 8(%)", "Lightning Grid 9(%)",
                "Bonus Safe 1(%)", "Bonus Safe 2(%)", "Bonus Safe 3(%)", "Bonus Safe 4(%)"
            ];
            csvContent += headers.join(",") + "\n";

            const exportList = [...this.displayBatches].reverse(); 

            exportList.forEach(b => {
                const patternStats = this.getBatchPatternStats(b);
                const gridStats = this.getBatchGridHitStats(b);
                const lightningStats = this.getBatchLightningHitStats(b);
                const safeStats = this.getBatchBonusSafeHitStats(b);

                const row = [
                    b.startRound, b.endRound, b.roundsCount, b.totalBet, b.totalWin,
                    this.getBatchRTP(b, 'total'), this.getBatchRTP(b, 'base'),
                    this.getBatchRTP(b, 'lightning'), this.getBatchRTP(b, 'bonus'),
                    this.getBatchRTP(b, 'jp'), patternStats.threeSame, patternStats.twoSame,
                    patternStats.allDifferent, ...gridStats, ...lightningStats, ...safeStats
                ];
                csvContent += row.join(",") + "\n";
            });

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
        
        openBatchModal(b) { this.selectedBatch = b; },
        closeBatchModal() { this.selectedBatch = null; },

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
        
        resetCsvIndex() { this.csvDataIndex = 0; },

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
            
            this.updateChart(); 
        },

        toggleBet(id) {
            // 快速切換：0 -> defaultBetUnit -> 0
            if (this.isPlaying) return;
            const grid = this.grids.find(g => g.id === id);
            if (grid) grid.betAmount = grid.betAmount > 0 ? 0 : this.defaultBetUnit;
        },
        
        toggleAllBets() {
            if (this.isPlaying) return;
            const currentAllSelected = this.isAllSelected;
            this.grids.forEach(g => g.betAmount = currentAllSelected ? 0 : this.defaultBetUnit);
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

        openHistoryModal(record) { this.selectedHistoryRecord = record; },
        closeHistoryModal() { this.selectedHistoryRecord = null; },
        
        openConfigModal() {
            this.tempConfigText = JSON.stringify(this.appConfig, null, 4);
            this.showConfigModal = true;
        },
        closeConfigModal() { this.showConfigModal = false; },

        // Active Agents Modal 控制
        openActiveAgentsModal() {
            if (this.currentActiveAgents.length > 0) {
                this.showActiveAgentsModal = true;
            } else {
                alert("目前沒有在線的 Agent！");
            }
        },
        closeActiveAgentsModal() { 
            this.showActiveAgentsModal = false; 
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
        
        checkExecutionCondition() {
            // 人流模式下，下注由 Agent 決定，不檢查手動下注
            if (this.simulationMode !== 'agentTraffic' && this.totalCost === 0) {
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
                let newRecord = this.simulateSingleRound(currentCost, false);
                this.history.unshift(newRecord);
                
                if (this.history.length > 100000) {
                    this.history.pop();
                }
                
                this.applyResultToUI(newRecord);
                this.isPlaying = false;
                
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
                    newRecordsBuffer.push(this.simulateSingleRound(currentCost, true));
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
                this.history = newRecordsBuffer.reverse().concat(this.history);
                if (this.history.length > 100000) {
                    this.history.length = 100000;
                }
                this.applyResultToUI(newRecordsBuffer[0]);
                
                // 批次跑完後，強制更新一次 Agent 的 UI 總下注額
                if (this.simulationMode === 'agentTraffic') {
                    this.generateCurrentAgentDecisions(false);
                }
            }
            
            if (this.currentBatchStats.roundsCount > 0) {
                this.batches.push(JSON.parse(JSON.stringify(this.currentBatchStats)));
                this.currentBatchStats = getEmptyStats();
            }

            this.isPlaying = false;
            this.updateChart(); 
        },

        simulateSingleRound(currentCost, isBatch = false) {
            // 如果剛好換日，重新產生 Day Plan
            if (this.simulationMode === 'agentTraffic' && this.currentRound > 0) {
                const rpd = this.trafficScenario.roundsPerDay || 1200;
                if (this.currentRound % rpd === 0) {
                    console.log(`🌅 換日了！第 ${Math.floor(this.currentRound/rpd) + 1} 天開始，重新計算 Agent 作息...`);
                    this.generateDayPlan();
                }
            }

            let currentGrids = this.grids;
            let currentDecisions = [];
            
            // Milestone 5: 在人流模式下，單局模擬時算出目前的 Agent Decisions
            if (this.simulationMode === 'agentTraffic') {
                const { decisions, virtualGrids, totalAgentCost } = this.generateCurrentAgentDecisions(isBatch);
                currentDecisions = decisions;
                currentGrids = virtualGrids;
                
                // Milestone 6: 由 Agent Decision 獨立計算總成本 (包含他們各自的 Lightning)
                currentCost = totalAgentCost || 0;
            }

            this.currentRound++;
            
            let forcedDrops = null;
            let csvInfo = null;
            if (this.dataSourceMode === 'csv' && this.filteredCsvData.length > 0) {
                const dataIndex = this.csvDataIndex % this.filteredCsvData.length;
                const dropData = this.filteredCsvData[dataIndex];
                this.csvDataIndex++;
                csvInfo = { version: dropData.version, round: dropData.round, index: dataIndex + 1 };
                forcedDrops = dropData.balls;
            }

            const payload = {
                roundNum: this.currentRound,
                currentCost: currentCost,
                baseBetUnit: null, // 已由各格 betAmount 取代
                config: this.appConfig,
                grids: currentGrids,
                buyExtraLightning: this.simulationMode === 'agentTraffic' ? true : this.buyExtraLightning,
                bonusTargetLevel: this.simulationMode === 'agentTraffic' ? 'all' : this.bonusTargetLevel,
                bonusPositions: this.bonusPositions,
                forcedDrops: forcedDrops,
                currentJpPool: this.stats.totalJpPool
            };

            let result = simulateRound(payload);

            // Milestone 7 & 8: Agent Traffic 模式下，使用獨立結算引擎重新計算獎金
            if (this.simulationMode === 'agentTraffic') {
                const settlement = calculateBatchSettlement(result, currentDecisions, this.appConfig);
                
                // 替換 result 裡面的派彩數據 (保留 gridHits 等歷史紀錄數據)
                result = {
                    ...result,
                    totalWin: settlement.totalWin,
                    baseWin: settlement.baseWin,
                    lightningWin: settlement.lightningWin,
                    bonusWin: settlement.bonusWin,
                    jpWin: settlement.jpWin,
                    newJpPool: settlement.newJpPool,
                    netProfit: settlement.totalWin - result.cost,
                    agentDetails: settlement.agentDetails
                };
            }

            // 準備更新批次數據
            let cb = this.currentBatchStats;
            if (cb.roundsCount === 0) {
                cb.startRound = this.currentRound;
            }
            cb.endRound = this.currentRound;
            cb.roundsCount++;

            // 呼叫純函式累加統計
            accumulateStats(this.stats, result);
            accumulateStats(cb, result);

            this.balance += result.netProfit;

            if (cb.roundsCount >= this.batchSize) {
                this.batches.push(JSON.parse(JSON.stringify(cb))); 
                this.currentBatchStats = getEmptyStats(); 
            }

            return Object.freeze({
                round: result.round,
                cost: result.cost,
                totalWin: result.totalWin,
                netProfit: result.netProfit,
                details: result.details,
                bonusTriggered: result.bonusTriggered,
                bonusSuccess: result.bonusSuccess,
                bonusWin: result.bonusWin,
                jpWin: result.jpWin, 
                csvInfo: csvInfo, 
                bonusResultText: result.bonusResultText,
                bonusLevelHistory: result.bonusLevelHistory, 
                finalGridsState: result.finalGridsState,
                agentDetails: result.agentDetails
            });
        },

        applyResultToUI(result) {
            this.lastResult = result;
            for(let i=0; i<9; i++) {
                this.grids[i].balls = result.finalGridsState[i].balls;
                this.grids[i].baseLightning = result.finalGridsState[i].baseLightning;
                this.grids[i].purchasedLightning = result.finalGridsState[i].purchasedLightning;
            }
        },

        // --- Agent Traffic Actions ---
        async setSimulationMode(mode) {
            this.simulationMode = mode;
            this.agentTrafficEnabled = (mode === 'agentTraffic');
            
            // 如果切換到人流模式且目前沒有 Agent 資料，則嘗試自動載入
            if (mode === 'agentTraffic' && (!this.agentPool || this.agentPool.length === 0)) {
                await this.fetchDefaultAgents();
            }
        },

        async fetchDefaultAgents() {
            try {
                const response = await fetch(`${import.meta.env.BASE_URL}agents.json`);
                if (!response.ok) throw new Error('找不到預設 agents.json');
                
                const rawData = await response.json();
                const processedAgents = processAgentData(rawData);
                this.agentPool = markRaw(processedAgents);
                this.trafficPersonaStats = calculatePersonaStats(processedAgents);
                this.generateDayPlan();
                console.log("🤖 已自動載入預設 Agent 資料");
            } catch (e) {
                console.log("ℹ️ 無法自動載入預設 Agent (正常現象，可手動上傳)", e.message);
            }
        },

        resetAgentTrafficSimulation() {
            this.trafficCurrentDay = 0;
            this.trafficCurrentRoundInDay = 0;
            this.trafficHistory = [];
            this.trafficDaySummaries = [];
            this.trafficPersonaStats = {};
            this.trafficAgentStats = {};
        },

        async loadAgentPool(event) {
            const file = event.target.files[0];
            if (!file) return;

            try {
                const text = await file.text();
                const rawData = JSON.parse(text);
                
                // 1. 處理與標準化 DNA 資料
                const processedAgents = processAgentData(rawData);
                
                // 2. 存入 Store (使用 markRaw 避免效能問題)
                this.agentPool = markRaw(processedAgents);
                
                // 3. 計算並更新 Persona 統計
                this.trafficPersonaStats = calculatePersonaStats(processedAgents);
                
                // 4. Milestone 3: 產生 Day Plan
                this.generateDayPlan();
                
                console.log(`✅ 成功載入 ${processedAgents.length} 位 Agent`);
                console.log('📊 Persona 分佈:', this.trafficPersonaStats);
                
                alert(`✅ 成功載入 ${processedAgents.length} 位 Agent！`);
            } catch (e) {
                console.error("載入 Agent 資料失敗", e);
                alert("❌ 載入失敗，請確認檔案格式是否為正確的 Agent DNA JSON。");
            }
        },

        generateDayPlan() {
            if (this.simulationMode !== 'agentTraffic' || !this.agentPool || this.agentPool.length === 0) return;
            
            const roundsPerDay = this.trafficScenario.roundsPerDay || 1200;
            const runtimeMap = {};
            
            // 建立時間桶子：長度為 roundsPerDay 的陣列，每個元素都是一個裝著該局上線 agent 的陣列
            const buckets = Array.from({ length: roundsPerDay }, () => []);
            
            let dayActiveCount = 0;
            const roundActiveCounts = new Array(roundsPerDay).fill(0);

            // 輔助函數：加權隨機抽樣
            const weightedRandomSample = (weights) => {
                const totalWeight = weights.reduce((sum, w) => sum + w, 0);
                if (totalWeight <= 0) return Math.floor(Math.random() * weights.length);
                let random = Math.random() * totalWeight;
                for (let i = 0; i < weights.length; i++) {
                    if (random < weights[i]) return i;
                    random -= weights[i];
                }
                return weights.length - 1;
            };

            this.agentPool.forEach(agent => {
                runtimeMap[agent.Account] = [];

                // 1. 隨機請假：如果未命中 Daily_Login_Probability，則跳過
                const loginProb = agent.Daily_Login_Probability !== undefined ? Number(agent.Daily_Login_Probability) : 1;
                if (Math.random() > loginProb) return;

                // 2. 作息抽樣：抽出主要活躍小時
                let primaryHour = Number(agent.Primary_Play_Hour) || 0;
                if (Array.isArray(agent.Hourly_Activity_Vector) && agent.Hourly_Activity_Vector.length === 24) {
                    primaryHour = weightedRandomSample(agent.Hourly_Activity_Vector);
                }
                
                // 3. 多段遊玩設定
                const wakeupMinute = Number(agent.Wakeup_Minute) || 0;
                let startMinute = (primaryHour * 60) + wakeupMinute;
                
                const sessionsPerDay = Math.max(1, Math.round(Number(agent.Sessions_Per_Active_Day) || 1));
                const sessionLength = Number(agent.Micro_Session_Length) || 20; 
                const breakDuration = Number(agent.Break_Duration_Minutes) || 60; 
                
                const activeThisAgent = new Array(roundsPerDay).fill(false);

                for (let s = 0; s < sessionsPerDay; s++) {
                    const rawStartRound = Math.floor((startMinute / 1440) * roundsPerDay);
                    const normalizedStartRound = rawStartRound % roundsPerDay;
                    const normalizedEndRound = normalizedStartRound + sessionLength;

                    runtimeMap[agent.Account].push({
                        startRound: normalizedStartRound,
                        endRound: normalizedEndRound
                    });
                    
                    for (let r = normalizedStartRound; r < normalizedEndRound; r++) {
                        const roundIdx = r % roundsPerDay;
                        activeThisAgent[roundIdx] = true;
                        // 把 Agent 丟進對應局數的桶子裡
                        buckets[roundIdx].push(agent);
                    }

                    // 準備下一段 session 的時間 (休息時間過後)
                    const sessionMinutes = (sessionLength / roundsPerDay) * 1440;
                    startMinute += sessionMinutes + breakDuration; 
                }
                
                for (let r = 0; r < roundsPerDay; r++) {
                    if (activeThisAgent[r]) roundActiveCounts[r]++;
                }
                
                dayActiveCount++;
            });

            this.agentRuntimeMap = markRaw(runtimeMap);
            this.activeAgentsBucket = markRaw(buckets);
            this.plannedDayActiveCount = dayActiveCount;
            this.estimatedPeakActiveCount = Math.max(...roundActiveCounts, 0);
            
            console.log(`📅 Day Plan (v4.5) 產生完畢: 今日預計活躍人數 ${dayActiveCount}, 預估尖峰在線人數 ${this.estimatedPeakActiveCount}`);
        },

        generateCurrentAgentDecisions(isBatch = false) {
            if (this.simulationMode !== 'agentTraffic') return { decisions: [], virtualGrids: this.grids };
            
            const activeAgents = this.currentActiveAgents;
            if (!activeAgents || activeAgents.length === 0) {
                if (!isBatch) this.grids.forEach(g => g.betAmount = 0);
                const virtualGrids = this.grids.map(g => ({ ...g, betAmount: 0 }));
                return { decisions: [], virtualGrids };
            }

            const decisions = [];
            const scenario = this.trafficScenario;
            const appConfig = this.appConfig;
            
            // 初始化 Aggregate Legal Bet Map
            const aggregateBetMap = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0, 7: 0, 8: 0, 9: 0 };
            let totalAgentCost = 0;

            activeAgents.forEach(agentDNA => {
                const tempAgentState = {
                    agentId: agentDNA.Account,
                    persona: agentDNA.Player_Persona,
                    dna: agentDNA,
                    currentBetAmount: Number(agentDNA.Avg_Bet_Amount) || 1,
                    lastRoundNetProfit: 0
                };

                const decision = buildAgentRoundDecision(tempAgentState, scenario, appConfig);
                decisions.push(decision);
                
                // 累加 Legal Bet (Milestone 6)
                if (decision.legalBetMap) {
                    Object.entries(decision.legalBetMap).forEach(([gridId, amount]) => {
                        let finalAmount = amount;
                        if (decision.buyLightning) {
                            finalAmount += amount * (appConfig.mainGame.extraPurchaseCostPercent || 0.5);
                        }
                        aggregateBetMap[gridId] += finalAmount;
                    });
                }
                
                // 計算該名 Agent 的總成本 (包含 Lightning)，處理小數點第二位
                let agentCost = decision.legalTotalBetAmount || 0;
                if (decision.buyLightning) {
                    agentCost += agentCost * (appConfig.mainGame.extraPurchaseCostPercent || 0.5);
                }
                // 四捨五入到小數點第二位
                totalAgentCost += Math.round(agentCost * 100) / 100;
            });
            
            // 建立供本局模擬使用的虛擬 grids 陣列，避免在 batch 時觸發 Vue Reactivity
            const virtualGrids = this.grids.map(g => ({ ...g, betAmount: Math.round(aggregateBetMap[g.id] || 0) }));

            // 如果不是批次跑，才即時更新 UI 綁定的 this.grids
            if (!isBatch) {
                this.grids.forEach(g => {
                    g.betAmount = Math.round(aggregateBetMap[g.id] || 0);
                });
                this.currentTotalAgentCost = totalAgentCost;
                this.currentAgentDecisions = decisions; // 儲存供彈窗使用
                console.log(`🧠 已產生 ${decisions.length} 筆 Agent Decision (Legal Bet)`, decisions);
            }

            return { decisions, virtualGrids, totalAgentCost };
        }
    }
});
