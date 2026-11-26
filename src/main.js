import entertainment from '../data/webs/entertainment.json';
import musk from '../data/webs/musk.json';
import kligman from '../data/webs/kligman.json';
import { prepare } from './graph.js';
import { AssociationScene } from './scene.js';
import { initChrome, nodeCard, edgeCard } from './ui.js';
import { NOW } from './dates.js';

const RAWS = {
  entertainment,
  musk,
  kligman,
};

const WEBS = [
  { id: 'entertainment', short: 'Hollywood' },
  { id: 'musk', short: 'Musk' },
  { id: 'kligman', short: 'Kligman' },
];

const params = new URLSearchParams(location.search);
const startWeb = RAWS[params.get('web')] ? params.get('web') : 'kligman';
const startView = params.get('view') === 'time' ? 'time' : 'board';
const startBg = localStorage.getItem('associations.bg') || '#1c1814';

const ui = initChrome(document.getElementById('app'), {
  webs: WEBS,
  bg: startBg,
  onWeb: (id) => loadWeb(id),
  onView: (view) => setView(view),
  onFilter: (types) => scene.setFilters(types),
  onScrub: (y) => scene.setScrubYear(y),
  onBg: (hex) => {
    localStorage.setItem('associations.bg', hex);
    scene.setBackground(hex);
  },
});

const scene = new AssociationScene(ui.canvas, ui.labels);
scene.setBackground(startBg);
scene.onTimeTravel = (year) => ui.setYear(year);
scene.onSelect = (sel) => {
  const g = current;
  if (!sel) {
    ui.showInspect(null);
    return;
  }
  if (sel.kind === 'node') {
    const node = g.byId.get(sel.id);
    ui.showInspect(nodeCard(node, g.edges, g.byId));
  } else {
    const edge = g.edges.find((e) => e.id === sel.id);
    ui.showInspect(edgeCard(edge, g.byId));
  }
};

ui.inspect.addEventListener('click', (e) => {
  if (e.target.closest('[data-close]')) {
    scene.select(null);
    ui.showInspect(null);
  }
});

let current = null;
let view = startView;

function loadWeb(id) {
  current = prepare(RAWS[id]);
  scene.load(current);
  scene.setView(view);
  ui.setWeb(id);
  ui.setView(view);
  ui.setAxis(current.axisMin, current.axisMax, NOW);
  scene.setScrubYear(NOW);
  ui.showInspect(null);
  const url = new URL(location.href);
  url.searchParams.set('web', id);
  url.searchParams.set('view', view);
  history.replaceState(null, '', url);
}

function setView(next) {
  view = next;
  scene.setView(view);
  ui.setView(view);
  const url = new URL(location.href);
  url.searchParams.set('view', view);
  history.replaceState(null, '', url);
}

window.addEventListener('resize', () => scene.resize());
new ResizeObserver(() => scene.resize()).observe(ui.canvas.parentElement);
window.addEventListener('keydown', (e) => {
  if (e.target.matches('input, textarea, a')) return;
  if (e.key === 'b') setView('board');
  if (e.key === 't') setView('time');
  if (e.key === '1') loadWeb('entertainment');
  if (e.key === '2') loadWeb('musk');
  if (e.key === '3') loadWeb('kligman');
  if (e.key === 'Escape') {
    scene.select(null);
    ui.showInspect(null);
  }
  if (e.key === '[' || e.key === ']') {
    const bar = document.getElementById('scrub');
    const min = Number(bar.dataset.min);
    const max = Number(bar.dataset.max);
    const step = (max - min) / 80;
    let y = min + (Number(bar.value) / 1000) * (max - min);
    y += e.key === ']' ? step : -step;
    y = Math.max(min, Math.min(max, y));
    bar.value = String(Math.round(((y - min) / (max - min)) * 1000));
    document.getElementById('year-readout').textContent = String(Math.round(y));
    scene.setScrubYear(y);
  }
});

function frame() {
  scene.tick();
  requestAnimationFrame(frame);
}

loadWeb(startWeb);
setView(startView);
frame();
