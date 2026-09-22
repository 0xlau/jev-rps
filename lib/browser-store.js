export const STORAGE_KEY = 'jev-duel:v1';
export const LOCK_KEY = 'jev-duel:operation';

export function freshState() {
  return { version: 1, revision: crypto.randomUUID(), series: crypto.randomUUID(),
    history: [], pending: null, archives: [] };
}

export function readState() {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return null;
  try {
    const value = JSON.parse(raw);
    if (value.version !== 1 || typeof value.series !== 'string' || typeof value.revision !== 'string'
      || !Array.isArray(value.history) || !Array.isArray(value.archives)
      || value.history.some(r => !r.record || typeof r.signature !== 'string')
      || value.archives.some(a => !Array.isArray(a.history))) throw new Error();
    return value;
  } catch { throw new Error('本机战绩无法读取。请先导出备份，再清除此网站的浏览器存储。'); }
}

export function writeState(value) {
  const next = { ...value, revision: crypto.randomUUID() };
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(next)); }
  catch { throw new Error('浏览器无法保存战绩，可能已满或禁止了存储。请先导出备份并检查浏览器设置。'); }
  return next;
}
