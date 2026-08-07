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

function setupTextScroller(viewportId, trackId) {
  const viewport = document.querySelector(`#${viewportId}`);
  const track = document.querySelector(`#${trackId}`);
  if (!viewport || !track) return;
  let offset = 0;
  let paused = false;
  const animate = () => {
    const limit = Math.max(0, track.scrollHeight - viewport.clientHeight);
    if (!paused && !prefersReducedMotion && limit > 4) {
      offset += 0.12;
      if (offset > limit + 28) offset = 0;
      track.style.transform = `translateY(${-offset}px)`;
    } else if (limit <= 4) {
      track.style.transform = 'translateY(0)';
    }
    window.requestAnimationFrame(animate);
  };
  ['mouseenter', 'focusin'].forEach((eventName) => viewport.addEventListener(eventName, () => { paused = true; }));
  ['mouseleave', 'focusout'].forEach((eventName) => viewport.addEventListener(eventName, () => { paused = false; }));
  animate();
}

setupTextScroller('project-text-viewport', 'project-text-track');
setupTextScroller('publication-text-viewport', 'publication-text-track');

const chartConfigs = {
  everest: [
    { source: 'qxy', title: '温度与湿度', unit: '°C · %RH', axes: { left: { dynamic: true }, right: { min: 0, max: 100, ticks: [0, 25, 50, 75, 100] } }, series: [{ name: '温度', unit: '°C', key: 'temperature_mean', sdKey: 'temperature_sd', color: '#ef8b43', axis: 'left' }, { name: '湿度', unit: '%RH', key: 'humidity_mean', sdKey: 'humidity_sd', color: '#25a9d6', axis: 'right' }] },
    { source: 'qxy', title: '风速与风向', unit: 'm/s · °', axes: { left: { dynamic: true, minFloor: 0 }, right: { min: 0, max: 360, ticks: [0, 90, 180, 270, 360] } }, series: [{ name: '风速', unit: 'm/s', key: 'wind_speed_mean', sdKey: 'wind_speed_sd', color: '#7568d8', axis: 'left' }, { name: '风向', unit: '°', key: 'wind_direction_mean', color: '#d65d7b', axis: 'right' }] },
    { source: 'o3', title: 'O₃ 浓度', unit: 'ppb', axes: { left: { dynamic: true } }, series: [{ name: 'O₃', unit: 'ppb', key: 'O3_mean', sdKey: 'O3_sd', color: '#37b981', axis: 'left' }] }
  ]
};

let hourlyData = { o3: [], qxy: [] };
const chartTooltip = document.createElement('div');
chartTooltip.className = 'chart-tooltip';
chartTooltip.setAttribute('role', 'status');
document.body.appendChild(chartTooltip);

function parseCsv(text) {
  const rows = [];
  let row = [];
  let cell = '';
  let quoted = false;
  const source = String(text).replace(/^\uFEFF/, '');
  for (let index = 0; index < source.length; index += 1) {
    const character = source[index];
    const next = source[index + 1];
    if (character === '"') {
      if (quoted && next === '"') {
        cell += '"';
        index += 1;
      } else {
        quoted = !quoted;
      }
    } else if (character === ',' && !quoted) {
      row.push(cell);
      cell = '';
    } else if ((character === '\n' || character === '\r') && !quoted) {
      if (character === '\r' && next === '\n') index += 1;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
    } else {
      cell += character;
    }
  }
  if (cell !== '' || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }
  const headers = (rows.shift() || []).map((header) => header.trim());
  return rows.filter((values) => values.some((value) => value.trim() !== '')).map((values) => headers.reduce((result, header, index) => {
    result[header] = (values[index] ?? '').trim();
    return result;
  }, {}));
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[character]));
}

async function fetchContentFile(fileName, type = 'text') {
  const response = await fetch(`content/${fileName}?v=${Date.now()}`, { cache: 'no-store' });
  if (!response.ok) throw new Error(`${fileName} 加载失败：${response.status}`);
  return type === 'json' ? response.json() : response.text();
}

async function loadContent() {
  const [intro, metrics, stations, instruments, projects, publications, photos] = await Promise.all([
    fetchContentFile('intro.txt'),
    fetchContentFile('intro_metrics.csv').then(parseCsv),
    fetchContentFile('stations.csv').then(parseCsv),
    fetchContentFile('instruments.csv').then(parseCsv),
    fetchContentFile('projects.csv').then(parseCsv),
    fetchContentFile('publications.csv').then(parseCsv),
    fetchContentFile('photos.json', 'json')
  ]);
  return { intro: intro.trim(), metrics, stations, instruments, projects, publications, photos };
}

function renderTableHead(elementId, labels) {
  const target = document.querySelector(`#${elementId}`);
  if (target) target.innerHTML = `<tr>${labels.map((label) => `<th>${escapeHtml(label)}</th>`).join('')}</tr>`;
}

function renderTableRows(elementId, rows, fields) {
  const target = document.querySelector(`#${elementId}`);
  if (!target) return;
  target.innerHTML = rows.map((row) => `<tr>${fields.map((field) => `<td>${escapeHtml(row[field])}</td>`).join('')}</tr>`).join('');
}

function formatPublicationReference(publication) {
  const authors = escapeHtml(publication.authors).replace(/;\s*/g, ', ');
  const title = escapeHtml(publication.title);
  const journal = escapeHtml(publication.journal);
  const year = escapeHtml(publication.year);
  const volume = escapeHtml(publication.volume);
  const pages = escapeHtml(publication.pages);
  const publicationDetails = [year, volume].filter(Boolean).join(', ');
  const pageDetails = pages ? `${publicationDetails ? ': ' : ''}${pages}` : '';
  const details = publicationDetails || pageDetails ? `, ${publicationDetails}${pageDetails}` : '';
  return `${authors}. ${title}[J]. <em>${journal}</em>${details}.`;
}

function renderContent(content) {
  const introCopy = document.querySelector('#intro-copy');
  if (introCopy) introCopy.textContent = content.intro;

  const metrics = document.querySelector('#intro-metrics');
  if (metrics) {
    metrics.innerHTML = content.metrics.map((metric) => `<div><strong>${escapeHtml(metric.value)}${metric.suffix ? `<span>${escapeHtml(metric.suffix)}</span>` : ''}</strong><span>${escapeHtml(metric.label)}</span></div>`).join('');
  }

  renderTableHead('station-head', ['中文全称', '中文简称', '英文全称']);
  renderTableRows('station-track', content.stations, ['name', 'short_name', 'english_name']);
  renderTableHead('instrument-head', ['仪器名称', '型号', '所属站点', '监测要素']);
  renderTableRows('instrument-track', content.instruments, ['name', 'model', 'station', 'elements']);

  const photoGrid = document.querySelector('#photo-grid');
  if (photoGrid) {
    photoGrid.innerHTML = content.photos.map((photo) => `<figure class="field-photo"><img src="${escapeHtml(photo.src)}" alt="${escapeHtml(photo.alt || photo.title)}" /><figcaption>${escapeHtml(photo.title)}</figcaption></figure>`).join('');
  }

  const projectTrack = document.querySelector('#project-text-track');
  if (projectTrack) {
    const projects = content.projects.map((project) => `<li><span class="project-index">${escapeHtml(project.index)}</span><div class="project-detail"><span>${escapeHtml(project.title)}</span><small>项目编号：${escapeHtml(project.code || '—')}　项目负责人：${escapeHtml(project.leader)}　项目经费：${escapeHtml(project.funding)}　执行状态：${escapeHtml(project.status)}</small></div></li>`).join('');
    projectTrack.innerHTML = `<ol class="project-list">${projects}</ol>`;
  }

  const publicationTrack = document.querySelector('#publication-text-track');
  if (publicationTrack) {
    const publications = content.publications
      .map((publication, originalIndex) => ({ publication, originalIndex }))
      .sort((left, right) => Number(right.publication.year || 0) - Number(left.publication.year || 0) || left.originalIndex - right.originalIndex)
      .map(({ publication }) => `<div class="publication"><p class="publication-reference" title="${escapeHtml(publication.title)}">${formatPublicationReference(publication)}</p></div>`)
      .join('');
    publicationTrack.innerHTML = publications;
  }
}

async function loadHourlyData() {
  const version = Date.now();
  const loadFile = async (fileName) => {
    const response = await fetch(`data/${fileName}?v=${version}`, { cache: 'no-store' });
    if (!response.ok) throw new Error(`${fileName} 加载失败：${response.status}`);
    return parseCsv(await response.text());
  };
  const [o3, qxy] = await Promise.all([
    loadFile('hourly_O3.csv'),
    loadFile('hourly_qxy.csv')
  ]);
  return { o3, qxy };
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
  const sourceData = hourlyData[config.source] || [];
  const sourceCount = sourceData.length;
  const labels = sourceData.map((row, index) => {
    const match = String(row.time || '').match(/\s(\d{2}):/);
    return match ? String(Number(match[1])) : String(index);
  });
  const isFullDay = sourceCount === 24 && labels[0] === '0' && labels.at(-1) === '23';
  const displayLabels = isFullDay ? [...labels, '24'] : labels;
  const prepared = config.series.map((series) => {
    const values = sourceData.map((row) => {
      const value = Number(row[series.key]);
      return Number.isFinite(value) ? value : null;
    });
    const errors = sourceData.map((row) => {
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
  const dataDate = String(sourceData[0]?.time || '').slice(0, 10);
  container.insertAdjacentHTML('beforeend', `<div class="chart-card"><div class="chart-head"><div class="chart-legend">${legends}</div><time class="chart-date" datetime="${dataDate}">${dataDate || '----'}</time></div><svg class="chart-svg" viewBox="0 0 ${width} ${height}" preserveAspectRatio="xMidYMid meet" role="img" aria-label="${station} ${config.title}小时监测趋势图"><title>${station} ${config.title}</title><desc>实线为小时平均值，半透明阴影为正负一个标准差。</desc>${horizontalGrid}${rightAxisLabels}${timeAxis}${bands}${paths}${circles}</svg></div>`);
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
    if (hourlyData.o3.length === 0 || hourlyData.qxy.length === 0) throw new Error('hourly_O3.csv 或 hourly_qxy.csv 没有数据');
    renderAllCharts();
  } catch (error) {
    console.error(error);
    document.querySelectorAll('.chart-grid').forEach((grid) => {
      const cameraCards = Array.from(grid.querySelectorAll('.camera-card')).map((card) => card.outerHTML).join('');
      grid.innerHTML = `<div class="chart-fallback">暂时无法读取 hourly_O3.csv 或 hourly_qxy.csv</div>${cameraCards}`;
    });
  }
}

async function initializeContent() {
  try {
    renderContent(await loadContent());
  } catch (error) {
    console.error(error);
  }
}

initializeContent();
initializeCharts();
