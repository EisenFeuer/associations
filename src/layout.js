/**
 * Degree-centered force layout.
 * Affiliation hubs are down-weighted so a religion node cannot steal the center.
 */
export function layoutBoard(nodes, edges, { iterations = 520 } = {}) {
  const n = nodes.length;
  const ids = nodes.map((nd) => nd.id);
  const deg = Object.fromEntries(nodes.map((nd) => [nd.id, nd.degree || 0]));
  const kind = Object.fromEntries(nodes.map((nd) => [nd.id, nd.kind]));

  const weight = (id) => {
    const d = deg[id] || 0;
    if (kind[id] === 'affiliation') return 0.12 * d;
    if (kind[id] === 'event') return 0.45 * d;
    if (kind[id] === 'work') return 0.55 * d;
    return d;
  };

  const ranked = [...ids].sort((a, b) => weight(b) - weight(a));
  const pos = {};
  ranked.forEach((id, i) => {
    if (i === 0) {
      pos[id] = { x: 0, y: 0 };
      return;
    }
    const angle = i * 2.399963229728653;
    const r = 3.4 + Math.sqrt(i) * 3.15 + (kind[id] === 'affiliation' ? 6 : 0);
    pos[id] = { x: Math.cos(angle) * r, y: Math.sin(angle) * r };
  });

  const k = 2.2;
  for (let t = 0; t < iterations; t++) {
    const cool = Math.max(0.05, 1 - t / iterations);
    const disp = Object.fromEntries(ids.map((id) => [id, { x: 0, y: 0 }]));

    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        const a = ids[i];
        const b = ids[j];
        let dx = pos[a].x - pos[b].x;
        let dy = pos[a].y - pos[b].y;
        const d2 = dx * dx + dy * dy + 0.05;
        const d = Math.sqrt(d2);
        const extra = kind[a] === 'affiliation' || kind[b] === 'affiliation' ? 1.15 : 1;
        const f = ((k * k) / d) * cool * extra;
        dx /= d;
        dy /= d;
        disp[a].x += dx * f;
        disp[a].y += dy * f;
        disp[b].x -= dx * f;
        disp[b].y -= dy * f;
      }
    }

    for (const e of edges) {
      const a = e.source;
      const b = e.target;
      if (!pos[a] || !pos[b]) continue;
      let dx = pos[b].x - pos[a].x;
      let dy = pos[b].y - pos[a].y;
      const d = Math.sqrt(dx * dx + dy * dy) + 0.02;
      const rest = e.type === 'ancestry' ? 3.1 : e.type === 'religion' ? 5.4 : 3.8;
      const f = (d - rest) * 0.07 * cool;
      dx /= d;
      dy /= d;
      disp[a].x += dx * f;
      disp[a].y += dy * f;
      disp[b].x -= dx * f;
      disp[b].y -= dy * f;
    }

    const maxW = Math.max(...ids.map(weight), 1);
    for (const id of ids) {
      const g = 0.022 * (weight(id) / maxW);
      const pull = kind[id] === 'affiliation' ? 0.012 : 0.018 + g;
      disp[id].x -= pos[id].x * pull * cool;
      disp[id].y -= pos[id].y * pull * cool;
      const m = 2.2 * cool;
      pos[id].x += clamp(disp[id].x, -m, m);
      pos[id].y += clamp(disp[id].y, -m, m);
    }
  }

  // Center on the highest-weight node, then normalize so the graph
  // always fits a comfortable corkboard regardless of force blow-up.
  const cx = pos[ranked[0]].x;
  const cy = pos[ranked[0]].y;
  let maxR = 0.001;
  for (const id of ids) {
    pos[id].x -= cx;
    pos[id].y -= cy;
    maxR = Math.max(maxR, Math.hypot(pos[id].x, pos[id].y));
  }
  const target = 16;
  const s = target / maxR;
  for (const id of ids) {
    pos[id].x *= s;
    pos[id].y *= s;
  }
  return { pos, maxR: target, centerId: ranked[0] };
}

function clamp(v, a, b) {
  return Math.max(a, Math.min(b, v));
}

export function yearToZ(year, axisMin, axisMax, depth) {
  const t = (year - axisMin) / Math.max(0.001, axisMax - axisMin);
  return (t - 0.5) * depth;
}

export function zToYear(z, axisMin, axisMax, depth) {
  const t = z / depth + 0.5;
  return axisMin + t * (axisMax - axisMin);
}
