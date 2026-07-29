const themeToggle = document.querySelector('#theme-toggle');
const themeMeta = document.querySelector('meta[name="theme-color"]');
const savedTheme = window.localStorage.getItem('station-theme');

function applyTheme(theme) {
  document.body.dataset.theme = theme;
  const isLight = theme === 'light';
  themeToggle.setAttribute('aria-pressed', String(isLight));
  themeToggle.setAttribute('aria-label', isLight ? '切换到暗色主题' : '切换到浅色主题');
  if (themeMeta) themeMeta.setAttribute('content', isLight ? '#f3f6f2' : '#07131b');
}

applyTheme(savedTheme === 'light' ? 'light' : 'dark');
themeToggle.addEventListener('click', () => {
  const nextTheme = document.body.dataset.theme === 'light' ? 'dark' : 'light';
  applyTheme(nextTheme);
  window.localStorage.setItem('station-theme', nextTheme);
});

const clockElement = document.querySelector('#live-clock');
const instrumentViewport = document.querySelector('#instrument-viewport');
const instrumentTrack = document.querySelector('#instrument-track');
const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

function updateClock() {
  const now = new Date();
  const pad = (value) => String(value).padStart(2, '0');
  const stamp = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;
  clockElement.textContent = stamp;
  clockElement.dateTime = now.toISOString();
}
updateClock();
window.setInterval(updateClock, 1000);

let tableOffset = 0;
let tablePaused = false;
function animateInstrumentTable() {
  if (!tablePaused && !prefersReducedMotion) {
    tableOffset += 0.22;
    const limit = Math.max(0, instrumentTrack.scrollHeight - instrumentViewport.clientHeight);
    if (tableOffset > limit + 28) tableOffset = 0;
    instrumentTrack.style.transform = `translateY(${-tableOffset}px)`;
  }
  window.requestAnimationFrame(animateInstrumentTable);
}
['mouseenter', 'focusin'].forEach((eventName) => instrumentViewport.addEventListener(eventName, () => { tablePaused = true; }));
['mouseleave', 'focusout'].forEach((eventName) => instrumentViewport.addEventListener(eventName, () => { tablePaused = false; }));
animateInstrumentTable();

const projectViewport = document.querySelector('#project-text-viewport');
const projectTrack = document.querySelector('#project-text-track');
let projectOffset = 0;
let projectPaused = false;

function animateProjectText() {
  const limit = Math.max(0, projectTrack.scrollHeight - projectViewport.clientHeight);
  if (!projectPaused && !prefersReducedMotion && limit > 4) {
    projectOffset += 0.12;
    if (projectOffset > limit + 28) projectOffset = 0;
    projectTrack.style.transform = `translateY(${-projectOffset}px)`;
  } else if (limit <= 4) {
    projectTrack.style.transform = 'translateY(0)';
  }
  window.requestAnimationFrame(animateProjectText);
}

['mouseenter', 'focusin'].forEach((eventName) => {
  projectViewport.addEventListener(eventName, () => { projectPaused = true; });
});
['mouseleave', 'focusout'].forEach((eventName) => {
  projectViewport.addEventListener(eventName, () => { projectPaused = false; });
});
animateProjectText();

const chartConfigs = {
  everest: [
    { title: '温度与湿度', unit: '°C / %RH', series: [{ name: '温度', color: '#efb94a', base: -8, amplitude: 4 }, { name: '湿度', color: '#66d1ca', base: 48, amplitude: 12 }] },
    { title: '风速与风向', unit: 'm/s / °', series: [{ name: '风速', color: '#77a9e8', base: 8, amplitude: 3 }, { name: '风向', color: '#ef8b77', base: 180, amplitude: 55 }] },
    { title: 'O3 与 CO', unit: 'ppb', series: [{ name: 'O3', color: '#66d1ca', base: 41, amplitude: 10 }, { name: 'CO', color: '#efb94a', base: 0.28, amplitude: .08 }] },
    { title: 'ODS 与 CO2', unit: 'ppt / ppm', series: [{ name: 'ODS', color: '#ef8b77', base: 74, amplitude: 13 }, { name: 'CO2', color: '#77a9e8', base: 413, amplitude: 25 }] }
  ]
};

let currentWindow = '24h';
const chartTooltip = document.createElement('div');
chartTooltip.className = 'chart-tooltip';
chartTooltip.setAttribute('role', 'status');
document.body.appendChild(chartTooltip);

function makePoints(base, amplitude, count, phase, drift) {
  return Array.from({ length: count }, (_, index) => {
    const wave = Math.sin(index * .85 + phase) * amplitude * .62 + Math.cos(index * .31 + phase) * amplitude * .28;
    const pulse = index % 6 === 0 ? amplitude * .22 : 0;
    return base + wave + pulse + (drift * index / count);
  });
}

function niceRange(seriesList) {
  const values = seriesList.flatMap((series) => series.values);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const padding = (max - min || 1) * .18;
  return { min: min - padding, max: max + padding };
}

function renderChart(container, config, station, chartIndex) {
  const count = currentWindow === '24h' ? 24 : 14;
  const labels = currentWindow === '24h' ? Array.from({ length: 24 }, (_, index) => String(index)) : ['7/01', '7/02', '7/03', '7/04', '7/05', '7/06', '7/07', '7/08', '7/09', '7/10', '7/11', '7/12', '7/13', '7/14'];
  const prepared = config.series.map((series, seriesIndex) => ({ ...series, values: makePoints(series.base, series.amplitude, count, chartIndex * .9 + seriesIndex * 1.4, seriesIndex % 2 ? .7 : -.35) }));
  const range = niceRange(prepared);
  const width = 360;
  const height = 95;
  const plot = { left: 25, right: 6, top: 9, bottom: 19 };
  const x = (index) => plot.left + (index / (count - 1)) * (width - plot.left - plot.right);
  const y = (value) => plot.top + ((range.max - value) / (range.max - range.min)) * (height - plot.top - plot.bottom);
  const formatValue = (value) => Math.abs(value) < 1 ? value.toFixed(2) : value.toFixed(1);
  const grid = [0, 1, 2].map((step) => {
    const gy = plot.top + step * ((height - plot.top - plot.bottom) / 2);
    const label = formatValue(range.max - step * (range.max - range.min) / 2);
    return `<line class="grid-line" x1="${plot.left}" y1="${gy}" x2="${width - plot.right}" y2="${gy}"></line><text class="axis-label" x="0" y="${gy + 3}">${label}</text>`;
  }).join('') + labels.map((label, index) => {
    if (count === 24) {
      const isMajor = [0, 6, 12, 18].includes(index);
      const axisY = height - plot.bottom;
      const tickY = axisY + (isMajor ? 4 : 2);
      const majorGrid = isMajor ? `<line class="grid-line major-x-grid" x1="${x(index)}" y1="${plot.top}" x2="${x(index)}" y2="${axisY}"></line>` : '';
      const tick = `<line class="axis-tick axis-tick--${isMajor ? 'major' : 'minor'}" x1="${x(index)}" y1="${axisY}" x2="${x(index)}" y2="${tickY}"></line>`;
      const tickLabel = isMajor ? `<text class="axis-label axis-label--x" x="${x(index)}" y="${height - 3}" text-anchor="middle">${label}</text>` : '';
      return `${majorGrid}${tick}${tickLabel}`;
    }
    const showTick = !(count > 12 && index % 2 !== 0);
    return showTick ? `<text class="axis-label axis-label--x" x="${x(index)}" y="${height - 3}" text-anchor="middle">${label}</text>` : '';
  }).join('');
  const paths = prepared.map((series) => {
    const points = series.values.map((value, index) => `${x(index).toFixed(1)},${y(value).toFixed(1)}`).join(' ');
    return `<polyline class="line" data-series="${series.name}" points="${points}" stroke="${series.color}"></polyline>`;
  }).join('');
  const circles = prepared.map((series) => series.values.map((value, index) => `<circle class="point" tabindex="0" role="img" aria-label="${series.name} ${labels[index]}点 ${formatValue(value)} ${config.unit}" data-series="${series.name}" data-label="${labels[index]}" data-value="${formatValue(value)}" data-color="${series.color}" cx="${x(index).toFixed(1)}" cy="${y(value).toFixed(1)}" r="2.7" fill="${series.color}"></circle>`).join('')).join('');
  const legends = prepared.map((series) => `<button type="button" class="legend-button" data-series-toggle="${station}-${chartIndex}-${series.name}" data-series-name="${series.name}" aria-pressed="true"><i class="legend-swatch" style="--series-color:${series.color}"></i>${series.name}</button>`).join('');
  container.insertAdjacentHTML('beforeend', `<div class="chart-card"><div class="chart-head"><div class="chart-legend">${legends}</div><span class="chart-unit">${config.unit}</span></div><svg class="chart-svg" viewBox="0 0 ${width} ${height}" preserveAspectRatio="xMidYMid meet" role="img" aria-label="${station} ${config.title}虚拟监测趋势图"><title>${station} ${config.title}</title><desc>当前为虚拟演示数据，支持鼠标悬停查看采样点。</desc>${grid}${paths}${circles}</svg></div>`);
  const card = container.lastElementChild;
  card.querySelectorAll('.point').forEach((point) => {
    const showTooltip = () => {
      chartTooltip.innerHTML = `<strong>${config.title} · ${point.dataset.label}:00</strong><span>${point.dataset.series} ${point.dataset.value} ${config.unit}</span>`;
      chartTooltip.style.display = 'block';
      const box = point.getBoundingClientRect();
      const left = Math.min(window.innerWidth - 140, Math.max(8, box.left + box.width / 2 - 60));
      const top = Math.max(8, box.top - 49);
      chartTooltip.style.left = `${left}px`;
      chartTooltip.style.top = `${top}px`;
    };
    point.addEventListener('mouseenter', showTooltip);
    point.addEventListener('focus', showTooltip);
    point.addEventListener('mouseleave', () => { chartTooltip.style.display = 'none'; });
    point.addEventListener('blur', () => { chartTooltip.style.display = 'none'; });
  });
  card.querySelectorAll('[data-series-toggle]').forEach((button) => {
    button.addEventListener('click', () => {
      const seriesName = button.dataset.seriesName;
      const muted = button.classList.toggle('is-muted');
      button.setAttribute('aria-pressed', String(!muted));
      card.querySelectorAll(`[data-series="${seriesName}"]`).forEach((mark) => { mark.style.opacity = muted ? '.12' : '1'; });
    });
  });
}

function renderAllCharts() {
  document.querySelectorAll('.chart-grid').forEach((grid) => {
    const station = grid.dataset.station;
    const cameraCards = Array.from(grid.querySelectorAll('.camera-card')).map((card) => card.outerHTML).join('');
    grid.innerHTML = '';
    chartConfigs[station].forEach((config, index) => renderChart(grid, config, '珠峰站', index));
    grid.insertAdjacentHTML('beforeend', cameraCards);
  });
}
renderAllCharts();

document.querySelectorAll('[data-window]').forEach((button) => {
  button.addEventListener('click', () => {
    currentWindow = button.dataset.window;
    document.querySelectorAll('[data-window]').forEach((item) => {
      const active = item === button;
      item.classList.toggle('is-active', active);
      item.setAttribute('aria-pressed', String(active));
    });
    renderAllCharts();
  });
});
