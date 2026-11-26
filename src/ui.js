import { EDGE_COLORS, EDGE_LABELS, KIND_LABELS } from './constants.js';
import { formatSpan, formatYear } from './dates.js';

export function initChrome(el, { webs, onWeb, onView, onFilter, onScrub, onBg, bg }) {
  el.innerHTML = `
    <header class="top">
      <div class="brand">
        <span class="mark" aria-hidden="true"></span>
        <div>
          <h1>Associations</h1>
          <p class="tag">Documented ties, not a plot</p>
        </div>
      </div>
      <nav class="webs" role="tablist" aria-label="Webs"></nav>
      <div class="view-toggle" role="group" aria-label="View">
        <button type="button" data-view="board" class="on">Board</button>
        <button type="button" data-view="time">Time</button>
      </div>
    </header>
    <div class="stage">
      <canvas id="scene"></canvas>
      <div id="labels"></div>
      <aside class="legend" id="legend"></aside>
      <aside class="inspect" id="inspect" hidden></aside>
      <div class="hint" id="hint">Middle-drag pan · scroll zoom · drag a pin to move it</div>
      <div class="timebar" id="timebar" hidden>
        <span id="year-min"></span>
        <input id="scrub" type="range" min="0" max="1000" value="1000" />
        <span id="year-readout"></span>
      </div>
    </div>
  `;

  const websNav = el.querySelector('.webs');
  for (const w of webs) {
    const b = document.createElement('button');
    b.type = 'button';
    b.dataset.web = w.id;
    b.textContent = w.short;
    b.setAttribute('role', 'tab');
    websNav.appendChild(b);
  }
  websNav.addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    onWeb(b.dataset.web);
  });

  el.querySelector('.view-toggle').addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    onView(b.dataset.view);
  });

  const legend = el.querySelector('#legend');
  legend.innerHTML =
    `<p class="legend-title">Strings</p>` +
    Object.keys(EDGE_LABELS)
      .map(
        (type) => `
      <label class="swatch">
        <input type="checkbox" data-type="${type}" checked />
        <i style="background:${EDGE_COLORS[type]}"></i>
        ${EDGE_LABELS[type]}
      </label>`,
      )
      .join('') +
    `<label class="bg-pick">Background <input type="color" id="bg" value="${bg || '#1c1814'}" /></label>`;
  legend.addEventListener('change', (e) => {
    if (e.target.id === 'bg') {
      onBg(e.target.value);
      return;
    }
    const types = [...legend.querySelectorAll('input[data-type]:checked')].map((i) => i.dataset.type);
    onFilter(types);
  });

  const scrub = el.querySelector('#scrub');
  scrub.addEventListener('input', () => {
    const min = Number(scrub.dataset.min);
    const max = Number(scrub.dataset.max);
    const y = min + (Number(scrub.value) / 1000) * (max - min);
    el.querySelector('#year-readout').textContent = String(Math.round(y));
    onScrub(y);
  });

  return {
    canvas: el.querySelector('#scene'),
    labels: el.querySelector('#labels'),
    inspect: el.querySelector('#inspect'),
    timebar: el.querySelector('#timebar'),
    hint: el.querySelector('#hint'),
    setWeb(id) {
      for (const b of websNav.querySelectorAll('button')) {
        b.classList.toggle('on', b.dataset.web === id);
        b.setAttribute('aria-selected', b.dataset.web === id ? 'true' : 'false');
      }
    },
    setView(view) {
      for (const b of el.querySelectorAll('.view-toggle button')) {
        b.classList.toggle('on', b.dataset.view === view);
      }
      el.querySelector('#timebar').hidden = view !== 'time';
      el.querySelector('#hint').textContent =
        view === 'board'
          ? 'Middle-drag pan XY · scroll zoom · drag a pin to move it'
          : 'Middle-drag pan XY · scroll moves in Z (time) · ctrl-scroll zoom · drag a pin';
    },
    setAxis(min, max, year) {
      scrub.dataset.min = String(min);
      scrub.dataset.max = String(max);
      el.querySelector('#year-min').textContent = String(Math.round(min));
      const y = year ?? max;
      scrub.value = String(Math.round(((y - min) / (max - min)) * 1000));
      el.querySelector('#year-readout').textContent = String(Math.round(y));
    },
    setYear(year) {
      const min = Number(scrub.dataset.min);
      const max = Number(scrub.dataset.max);
      if (!Number.isFinite(min) || max === min) return;
      const y = Math.max(min, Math.min(max, year));
      scrub.value = String(Math.round(((y - min) / (max - min)) * 1000));
      el.querySelector('#year-readout').textContent = String(Math.round(y));
    },
    showInspect(html) {
      const pane = el.querySelector('#inspect');
      if (!html) {
        pane.hidden = true;
        pane.innerHTML = '';
        return;
      }
      pane.hidden = false;
      pane.innerHTML = html;
    },
  };
}

export function nodeCard(node, edges, byId) {
  const incident = edges.filter((e) => e.source === node.id || e.target === node.id);
  const ties = incident
    .map((e) => {
      const other = byId.get(e.source === node.id ? e.target : e.source);
      return `<li><span class="dot" style="background:${e.color}"></span><b>${escapeHtml(other?.name || e.target)}</b> — ${escapeHtml(e.fact)}</li>`;
    })
    .join('');
  return `
    <button class="close" type="button" data-close>×</button>
    <p class="kicker">${KIND_LABELS[node.kind] || node.kind}</p>
    <h2>${escapeHtml(node.name)}</h2>
    <p class="dates">${formatSpan(node.start, node.end, node.open)}</p>
    ${node.summary ? `<p class="sum">${escapeHtml(node.summary)}</p>` : ''}
    ${node.religion ? `<p class="meta">Religion: ${escapeHtml(node.religion)}</p>` : ''}
    ${node.politics ? `<p class="meta">Politics: ${escapeHtml(node.politics)}</p>` : ''}
    <p class="meta">${node.degree} ties</p>
    <ul class="ties">${ties}</ul>
  `;
}

export function edgeCard(edge, byId) {
  const a = byId.get(edge.source);
  const b = byId.get(edge.target);
  const sources = (edge.sources || [])
    .map((s) => `<li><a href="${escapeHtml(s.url)}" target="_blank" rel="noopener">${escapeHtml(s.title)}</a></li>`)
    .join('');
  const when = edge.momentary
    ? formatYear(edge.zStart)
    : formatSpan(edge.zStart, edge.zEnd, false);
  return `
    <button class="close" type="button" data-close>×</button>
    <p class="kicker">${EDGE_LABELS[edge.type] || edge.type}${edge.subtype ? ' · ' + edge.subtype : ''}</p>
    <h2>${escapeHtml(a?.name || edge.source)} <span class="amp">↔</span> ${escapeHtml(b?.name || edge.target)}</h2>
    <p class="dates">${when}${edge.trace ? ' · trace in Z' : ' · moment'}</p>
    <p class="sum">${escapeHtml(edge.fact)}</p>
    <p class="meta">Confidence: ${edge.confidence}</p>
    <ul class="sources">${sources}</ul>
  `;
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
