const fs = require('fs');

const content = fs.readFileSync('TG001_FinalCheck_V2.backup.html', 'utf8');

// Extract template
const templateStart = content.indexOf('<div id="app"');
const templateEnd = content.lastIndexOf('</div>') + '</div>'.length; // Find the last </div> before script
let templateContent = content.substring(templateStart, templateEnd).trim();

// Extract script
const scriptStart = content.indexOf('createApp({') + 'createApp({'.length;
const scriptEnd = content.lastIndexOf('}).mount(\'#app\')');
let vueOptions = content.substring(scriptStart, scriptEnd);

// Prepare App.vue script
let scriptContent = `
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

export default {
${vueOptions}
};
`;

let appVue = `<template>\n${templateContent}\n</template>\n\n<script>\n${scriptContent}\n</script>\n`;

// create dir if not exists
if (!fs.existsSync('src')) fs.mkdirSync('src');

fs.writeFileSync('src/App.vue', appVue);
console.log('src/App.vue generated successfully.');
