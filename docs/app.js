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

function scheduleDailyRefresh() {
  const now = new Date();
  const nextRefresh = new Date(now);
  nextRefresh.setHours(3, 0, 0, 0);
  if (nextRefresh <= now) nextRefresh.setDate(nextRefresh.getDate() + 1);
  window.setTimeout(() => window.location.reload(), nextRefresh.getTime() - now.getTime());
}
scheduleDailyRefresh();

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
    { title: '温度与湿度', unit: '°C · %RH', axes: { left: { dynamic: true }, right: { min: 0, max: 100, ticks: [0, 25, 50, 75, 100] } }, series: [{ name: '温度', unit: '°C', key: 'temperature_mean', sdKey: 'temperature_sd', color: '#ef8b43', axis: 'left' }, { name: '湿度', unit: '%RH', key: 'humidity_mean', sdKey: 'humidity_sd', color: '#25a9d6', axis: 'right' }] },
    { title: '风速与风向', unit: 'm/s · °', axes: { left: { dynamic: true, minFloor: 0 }, right: { min: 0, max: 360, ticks: [0, 90, 180, 270, 360] } }, series: [{ name: '风速', unit: 'm/s', key: 'wind_speed_mean', sdKey: 'wind_speed_sd', color: '#7568d8', axis: 'left' }, { name: '风向', unit: '°', key: 'wind_direction_mean', color: '#d65d7b', axis: 'right' }] },
    { title: 'O₃ 浓度', unit: 'ppb', axes: { left: { dynamic: true } }, series: [{ name: 'O₃', unit: 'ppb', key: 'O3_mean', sdKey: 'O3_sd', color: '#37b981', axis: 'left' }] }
  ]
};

let hourlyData = [];
const dataDateElement = document.querySelector('#data-date');
const chartTooltip = document.createElement('div');
chartTooltip.className = 'chart-tooltip';
chartTooltip.setAttribute('role', 'status');
document.body.appendChild(chartTooltip);

function parseCsv(text) {
  const lines = text.trim().split(/\r?\n/).filter(Boolean);
  const unquote = (value) => value.replace(/^"|"$/g, '').replace(/""/g, '"');
  const headers = lines.shift().split(',').map(unquote);
  return lines.map((line) => {
    const values = line.split(',').map(unquote);
    return headers.reduce((row, header, index) => {
      row[header] = values[index] ?? '';
      return row;
    }, {});
  });
}

async function loadHourlyData() {
  const response = await fetch(`data/hourly.csv?v=${Date.now()}`, { cache: 'no-store' });
  if (!response.ok) throw new Error(`hourly.csv 加载失败：${response.status}`);
  return parseCsv(await response.text());
}

function formatValue(value) {
  if (Math.abs(value) < Number.EPSILON) return '0';
  if (Math.abs(value) < 1) return value.toFixed(2);
  return value.toFixed(1).replace(/\.0$/, '');
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function buildDynamicAxis(seriesList, minFloor = null) {
  const bounds = seriesList.flatMap((series) => series.values.flatMap((value, index) => {
    if (!Number.isFinite(value)) return [];
    const error = Number.isFinite(series.errors[index]) ? series.errors[index] : 0;
    return [value - error, value + error];
  }));
  if (bounds.length === 0) return { min: 0, max: 4, ticks: [0, 1, 2, 3, 4] };

  const rawMin = Math.min(...bounds);
  const rawMax = Math.max(...bounds);
  const padding = Math.max((rawMax - rawMin) * 0.12, 0.01);
  const paddedMin = rawMin - padding;
  const paddedMax = rawMax + padding;
  let step = Math.max(1, Math.ceil((paddedMax - paddedMin) / 4));
  let min = Number.isFinite(minFloor) ? minFloor : Math.floor(paddedMin / step) * step;
  let max = min + step * 4;
  while (max < paddedMax) {
    step += 1;
    max = min + step * 4;
  }
  return { min, max, ticks: Array.from({ length: 5 }, (_, index) => min + step * index) };
}

function renderChart(container, config, station, chartIndex) {
  const sourceCount = hourlyData.length;
  const labels = hourlyData.map((row, index) => {
    const match = String(row.time || '').match(/\s(\d{2}):/);
    return match ? String(Number(match[1])) : String(index);
  });
  const isFullDay = sourceCount === 24 && labels[0] === '0' && labels.at(-1) === '23';
  const displayLabels = isFullDay ? [...labels, '24'] : labels;
  const prepared = config.series.map((series) => {
    const values = hourlyData.map((row) => {
      const value = Number(row[series.key]);
      return Number.isFinite(value) ? value : null;
    });
    const errors = hourlyData.map((row) => {
      const value = Number(row[series.sdKey]);
      return Number.isFinite(value) ? value : null;
    });
    if (isFullDay) {
      values.push(values.at(-1));
      errors.push(errors.at(-1));
    }
    return { ...series, values, errors };
  });
  const axes = Object.fromEntries(Object.entries(config.axes).map(([axisName, axis]) => {
    if (!axis.dynamic) return [axisName, axis];
    return [axisName, buildDynamicAxis(prepared.filter((series) => series.axis === axisName), axis.minFloor)];
  }));
  const width = 360;
  const height = 142;
  const hasRightAxis = Boolean(axes.right);
  const plot = { left: 33, right: hasRightAxis ? 31 : 9, top: 9, bottom: 23 };
  const axisY = height - plot.bottom;
  const x = (index) => plot.left + (index / Math.max(1, displayLabels.length - 1)) * (width - plot.left - plot.right);
  const y = (value, axisName) => {
    const axis = axes[axisName];
    const boundedValue = clamp(value, axis.min, axis.max);
    return plot.top + ((axis.max - boundedValue) / (axis.max - axis.min)) * (axisY - plot.top);
  };
  const leftAxis = axes.left;
  const leftSeries = prepared.find((series) => series.axis === 'left');
  const rightSeries = prepared.find((series) => series.axis === 'right');
  const horizontalGrid = leftAxis.ticks.map((tick) => {
    const gy = y(tick, 'left');
    return `<line class="grid-line" x1="${plot.left}" y1="${gy}" x2="${width - plot.right}" y2="${gy}"></line><text class="axis-label" style="fill:${leftSeries?.color || 'var(--axis)'}" x="${plot.left - 4}" y="${gy + 3}" text-anchor="end">${formatValue(tick)}</text>`;
  }).join('');
  const rightAxisLabels = hasRightAxis ? axes.right.ticks.map((tick) => {
    const gy = y(tick, 'right');
    return `<text class="axis-label axis-label--right" style="fill:${rightSeries?.color || 'var(--axis)'}" x="${width - plot.right + 4}" y="${gy + 3}" text-anchor="start">${formatValue(tick)}</text>`;
  }).join('') : '';
  const timeAxis = displayLabels.map((label, index) => {
    if (isFullDay) {
      const isMajor = [0, 6, 12, 18, 24].includes(index);
      const tickY = axisY + (isMajor ? 4 : 2);
      const majorGrid = isMajor ? `<line class="grid-line major-x-grid" x1="${x(index)}" y1="${plot.top}" x2="${x(index)}" y2="${axisY}"></line>` : '';
      const tick = `<line class="axis-tick axis-tick--${isMajor ? 'major' : 'minor'}" x1="${x(index)}" y1="${axisY}" x2="${x(index)}" y2="${tickY}"></line>`;
      const tickLabel = isMajor ? `<text class="axis-label axis-label--x" x="${x(index)}" y="${height - 4}" text-anchor="middle">${label} 时</text>` : '';
      return `${majorGrid}${tick}${tickLabel}`;
    }
    return `<text class="axis-label axis-label--x" x="${x(index)}" y="${height - 4}" text-anchor="middle">${label} 时</text>`;
  }).join('');
  const bands = prepared.map((series) => {
    if (!series.sdKey) return '';
    const upper = [];
    const lower = [];
    series.values.forEach((value, index) => {
      const error = series.errors[index];
      if (!Number.isFinite(value) || !Number.isFinite(error)) return;
      upper.push(`${x(index).toFixed(1)},${y(value + error, series.axis).toFixed(1)}`);
      lower.push(`${x(index).toFixed(1)},${y(value - error, series.axis).toFixed(1)}`);
    });
    if (upper.length < 2) return '';
    return `<polygon class="uncertainty-band" data-series="${series.name}" points="${upper.concat(lower.reverse()).join(' ')}" fill="${series.color}"></polygon>`;
  }).join('');
  const paths = prepared.map((series) => {
    const points = series.values.map((value, index) => Number.isFinite(value) ? `${x(index).toFixed(1)},${y(value, series.axis).toFixed(1)}` : '').filter(Boolean).join(' ');
    return `<polyline class="line" data-series="${series.name}" points="${points}" stroke="${series.color}"></polyline>`;
  }).join('');
  const circles = prepared.map((series) => series.values.map((value, index) => {
    if (!Number.isFinite(value)) return '';
    const error = series.errors[index];
    return `<circle class="point" tabindex="0" role="img" aria-label="${series.name} ${displayLabels[index]} 时 ${formatValue(value)} ${series.unit}" data-series="${series.name}" data-label="${displayLabels[index]}" data-value="${formatValue(value)}" data-sd="${Number.isFinite(error) ? formatValue(error) : ''}" data-unit="${series.unit}" cx="${x(index).toFixed(1)}" cy="${y(value, series.axis).toFixed(1)}" r="2.5" fill="${series.color}"></circle>`;
  }).join('')).join('');
  const legends = prepared.map((series) => `<button type="button" class="legend-button" data-series-toggle="${station}-${chartIndex}-${series.name}" data-series-name="${series.name}" aria-pressed="true"><i class="legend-swatch" style="--series-color:${series.color}"></i>${series.name} (${series.unit})</button>`).join('');
  container.insertAdjacentHTML('beforeend', `<div class="chart-card"><div class="chart-head"><div class="chart-legend">${legends}</div></div><svg class="chart-svg" viewBox="0 0 ${width} ${height}" preserveAspectRatio="xMidYMid meet" role="img" aria-label="${station} ${config.title}小时监测趋势图"><title>${station} ${config.title}</title><desc>实线为小时平均值，半透明阴影为正负一个标准差。</desc>${horizontalGrid}${rightAxisLabels}${timeAxis}${bands}${paths}${circles}</svg></div>`);
  const card = container.lastElementChild;
  card.querySelectorAll('.point').forEach((point) => {
    const showTooltip = () => {
      const uncertainty = point.dataset.sd ? ` ± ${point.dataset.sd}` : '';
      chartTooltip.innerHTML = `<strong>${config.title} · ${point.dataset.label} 时</strong><span>${point.dataset.series} ${point.dataset.value}${uncertainty} ${point.dataset.unit}</span>`;
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
    const emptySlots = Math.max(0, 4 - chartConfigs[station].length);
    for (let index = 0; index < emptySlots; index += 1) {
      grid.insertAdjacentHTML('beforeend', '<div class="chart-placeholder" aria-hidden="true"></div>');
    }
    grid.insertAdjacentHTML('beforeend', cameraCards);
  });
}

async function initializeCharts() {
  try {
    hourlyData = await loadHourlyData();
    if (hourlyData.length === 0) throw new Error('hourly.csv 没有数据');
    const dataDate = String(hourlyData[0]?.time || '').slice(0, 10);
    if (dataDate && dataDateElement) {
      dataDateElement.textContent = dataDate;
      dataDateElement.dateTime = dataDate;
    }
    renderAllCharts();
  } catch (error) {
    console.error(error);
    document.querySelectorAll('.chart-grid').forEach((grid) => {
      const cameraCards = Array.from(grid.querySelectorAll('.camera-card')).map((card) => card.outerHTML).join('');
      grid.innerHTML = `<div class="chart-fallback">暂时无法读取 hourly.csv</div>${cameraCards}`;
    });
  }
}

initializeCharts();
