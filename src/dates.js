/** September 2026 — living / still-extant nodes run to here. */
export const NOW = 2026 + 8 / 12;

/**
 * Founding / dissolving years for org and place nodes that the seed JSON
 * left undated. Ends of `null` mean still extant (clipped to NOW).
 */
export const DATE_HINTS = {
  'org:mpaa': [1922, null],
  'org:huac': [1938, 1975],
  'org:cpusa': [1919, null],
  'org:sag': [1933, null],
  'org:ampas': [1927, null],
  'org:zoetrope': [1969, null],
  'org:cfa': [1947, 1948],
  'org:cedar-tavern': [1866, 2006],
  'org:the-club': [1949, 1970],
  'org:art-students-league': [1875, null],
  'org:betty-parsons-gallery': [1946, 1983],
  'org:art-of-this-century': [1942, 1947],
  'org:met': [1870, null],
  'place:springs': [1945, null],
  'place:14th-st-studio': [1950, 2010],
  'org:zip2': [1995, 1999],
  'org:paypal': [1998, null],
  'org:spacex': [2002, null],
  'org:tesla': [2003, null],
  'org:neuralink': [2016, null],
  'org:openai': [2015, null],
  'org:x-corp': [2006, null],
  'org:xai': [2023, null],
  'org:solarcity': [2006, 2016],
  'org:america-pac': [2024, null],
  'org:doge': [2025, 2025.4],
  'org:aclu': [1920, null],
  'org:technocracy': [1933, 1941],
  'org:queens': [1841, null],
};

export function parseYearToken(token) {
  if (token == null) return null;
  const s = String(token).trim();
  if (!s) return null;
  if (/^\d{4}s$/i.test(s)) return Number(s.slice(0, 4)) + 5;
  const iso = s.match(/^(\d{4})(?:-(\d{2}))?(?:-(\d{2}))?$/);
  if (iso) {
    const y = Number(iso[1]);
    const m = iso[2] ? Number(iso[2]) : 1;
    const d = iso[3] ? Number(iso[3]) : 1;
    return y + (m - 1) / 12 + (d - 1) / 365;
  }
  return null;
}

function splitSpan(s) {
  if (/[–—]/.test(s)) return s.split(/[–—]/);
  if (/^\d{4}-\d{4}$/.test(s)) return s.split('-');
  if (/^\d{4}-$/.test(s)) return [s.slice(0, 4), ''];
  return [s];
}

export function parseSpan(dates) {
  const empty = { start: null, end: null, open: false, moment: false };
  if (dates == null || dates === '') return empty;
  let s = String(dates).trim();
  s = s.replace(/^claimed\s+/i, '').replace(/^c\.\s*/i, '');

  const deathOnly = s.match(/^d\.\s*(\d{4})/i);
  if (deathOnly) {
    return { start: null, end: Number(deathOnly[1]), open: false, moment: false, deathOnly: true };
  }

  if (/^\d{4}-\d{2}/.test(s) && !/[–—]/.test(s)) {
    const y = parseYearToken(s);
    return { start: y, end: y, open: false, moment: true };
  }

  const parts = splitSpan(s).map((p) => p.trim());
  const start = parseYearToken(parts[0]);
  const endTok = parts.length > 1 ? parts[1] : '';
  if (!endTok) {
    return { start, end: null, open: start != null, moment: false };
  }
  const end = parseYearToken(endTok);
  const moment = start != null && end != null && Math.abs(end - start) < 0.08;
  return { start, end, open: false, moment };
}

export function formatYear(y) {
  if (y == null || Number.isNaN(y)) return '—';
  const year = Math.floor(y);
  const frac = y - year;
  if (frac < 0.02) return String(year);
  const month = Math.min(12, Math.round(frac * 12) + 1);
  if (month <= 1) return String(year);
  return `${year}.${String(month).padStart(2, '0')}`;
}

export function formatSpan(start, end, open) {
  const a = start == null ? '?' : String(Math.round(start));
  if (open || end == null) return `${a}–`;
  const b = String(Math.round(end));
  return a === b ? a : `${a}–${b}`;
}
