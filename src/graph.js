import { DATE_HINTS, NOW, parseSpan, parseYearToken } from './dates.js';
import { EDGE_COLORS, MOMENT_SUBTYPES, TRACE_SUBTYPES } from './constants.js';

export function isMomentary(edge) {
  if (edge.type === 'documented_communications') return true;
  if (MOMENT_SUBTYPES.has(edge.subtype)) return true;
  if (edge.start != null && edge.end != null && edge.end - edge.start < 1.05) return true;
  if (edge.moment) return true;
  return false;
}

export function isTrace(edge) {
  if (isMomentary(edge)) return false;
  if (TRACE_SUBTYPES.has(edge.subtype)) return true;
  if (edge.type === 'romantic' || edge.type === 'ancestry' || edge.type === 'religion') return true;
  if (edge.start != null && edge.end != null && edge.end - edge.start >= 1.05) return true;
  if (edge.start != null && edge.end == null && (edge.type === 'organization' || edge.type === 'political_ideology')) {
    return true;
  }
  return false;
}

function hintSpan(id) {
  const h = DATE_HINTS[id];
  if (!h) return null;
  return { start: h[0], end: h[1] == null ? NOW : h[1], open: h[1] == null };
}

export function prepare(raw) {
  const nodes = raw.nodes.map((n) => {
    const parsed = parseSpan(n.dates);
    const hint = hintSpan(n.id);
    let start = parsed.start ?? hint?.start ?? null;
    let end = parsed.end ?? hint?.end ?? null;
    let open = parsed.open || (hint?.open ?? false);
    if (parsed.deathOnly && start == null) start = end - 8;
    if (n.kind === 'event' && start != null && (end == null || parsed.moment)) {
      end = start + 0.12;
      open = false;
    }
    if (n.kind === 'work' && start != null && (end == null || parsed.moment || parsed.open)) {
      end = start + 1.2;
      open = false;
    }
    if (open && end == null) end = NOW;
    return {
      ...n,
      start,
      end,
      open: open && (end == null || Math.abs(end - NOW) < 0.2),
    };
  });

  const byId = new Map(nodes.map((n) => [n.id, n]));

  const edges = raw.edges
    .filter((e) => byId.has(e.source) && byId.has(e.target))
    .map((e) => {
      const start = parseYearToken(e.start);
      const end = parseYearToken(e.end);
      return {
        ...e,
        color: raw.color_legend?.[e.type] || EDGE_COLORS[e.type] || '#888',
        start,
        end,
      };
    });

  // Second pass: infer missing node spans from incident edges.
  for (const node of nodes) {
    const incident = edges.filter((e) => e.source === node.id || e.target === node.id);
    const years = [];
    if (node.start != null) years.push(node.start);
    if (node.end != null) years.push(node.end);
    for (const e of incident) {
      if (e.start != null) years.push(e.start);
      if (e.end != null) years.push(e.end);
    }
    if (node.start == null && years.length) node.start = Math.min(...years);
    if (node.end == null && years.length) {
      const last = Math.max(...years);
      node.end = node.kind === 'person' || node.kind === 'org' || node.kind === 'place' ? Math.max(last, NOW * 0.999) : last;
      if (node.kind === 'person' && node.dates && String(node.dates).endsWith('–')) {
        node.end = NOW;
        node.open = true;
      }
    }
  }

  // Affiliation pillars span their members.
  for (const node of nodes) {
    if (node.kind !== 'affiliation') continue;
    const members = edges
      .filter((e) => e.source === node.id || e.target === node.id)
      .map((e) => (e.source === node.id ? byId.get(e.target) : byId.get(e.source)))
      .filter(Boolean);
    const starts = members.map((m) => m.start).filter((y) => y != null);
    const ends = members.map((m) => m.end).filter((y) => y != null);
    if (starts.length) node.start = Math.min(...starts);
    if (ends.length) node.end = Math.max(...ends);
  }

  // Fill remaining holes so every node has a pillar. Do not let a
  // 19th-century org founding leak onto undated people (that stretched
  // the Musk time axis back to Queen's University, 1841).
  const datedPeople = nodes.filter((n) => n.kind === 'person' && parseSpan(n.dates).start != null);
  const peopleMin = datedPeople.length ? Math.min(...datedPeople.map((n) => n.start)) : 1900;
  const peopleMax = datedPeople.length ? Math.max(...datedPeople.map((n) => n.end ?? NOW)) : NOW;
  const known = nodes.filter((n) => n.start != null);
  const globalMax = known.length ? Math.max(...known.map((n) => n.end ?? NOW), peopleMax) : NOW;
  for (const node of nodes) {
    if (node.start == null) {
      node.start = node.kind === 'person' || node.kind === 'affiliation' ? peopleMin : peopleMin;
    }
    if (node.end == null) {
      node.end = node.kind === 'event' || node.kind === 'work' ? node.start + 0.4 : globalMax;
    }
    if (node.end < node.start) node.end = node.start + 0.2;
  }

  const axisMin = peopleMin - 2;
  const axisMax = NOW + 0.4;

  for (const edge of edges) {
    const a = byId.get(edge.source);
    const b = byId.get(edge.target);
    const span = edgeSpan(edge, a, b);
    edge.zStart = span.start;
    edge.zEnd = span.end;
    edge.momentary = isMomentary(edge);
    edge.trace = isTrace(edge) || (!edge.momentary && span.end - span.start >= 1);
    if (edge.momentary) {
      edge.zEnd = edge.zStart;
      edge.trace = false;
    }
  }

  const degree = new Map(nodes.map((n) => [n.id, 0]));
  for (const e of edges) {
    degree.set(e.source, (degree.get(e.source) || 0) + 1);
    degree.set(e.target, (degree.get(e.target) || 0) + 1);
  }
  for (const n of nodes) n.degree = degree.get(n.id) || 0;

  return {
    id: raw.id,
    title: raw.title,
    summary: raw.summary,
    uncertainties: raw.uncertainties || [],
    colorLegend: { ...EDGE_COLORS, ...(raw.color_legend || {}) },
    nodes,
    edges,
    byId,
    axisMin,
    axisMax,
  };
}

function edgeSpan(edge, a, b) {
  const fallbackStart = Math.max(a.start, b.start);
  const fallbackEnd = Math.min(a.end, b.end);

  if (edge.subtype === 'parent' || edge.subtype === 'twin' || edge.subtype === 'nephew-uncle' || edge.subtype === 'aunt-nephew') {
    // Parent → child in the seed data.
    const child = edge.subtype === 'parent' ? b : (a.start >= b.start ? a : b);
    const other = child === a ? b : a;
    return {
      start: child.start,
      end: Math.max(child.start + 0.2, Math.min(other.end, child.end)),
    };
  }

  if (isMomentary(edge)) {
    const t = edge.start ?? edge.end ?? fallbackStart;
    return { start: t, end: t };
  }

  let start = edge.start ?? fallbackStart;
  let end = edge.end ?? (edge.start != null ? fallbackEnd : fallbackEnd);
  if (end == null) end = fallbackEnd;
  if (end < start) end = start;
  return { start, end };
}
