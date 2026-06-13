// Pure path helpers. All paths inside the picker are POSIX, '/'-separated.

/** Split a relative path into non-empty segments. */
export const segsOf = (rel: string): string[] => rel.split('/').filter(Boolean);

/** Join a base mount path with relative segments. */
export const joinPath = (base: string, ...segs: string[]): string => {
  const tail = segs.filter(Boolean).join('/');
  if (!tail) return base;
  return base.endsWith('/') ? base + tail : `${base}/${tail}`;
};

/** The last segment of a path. */
export const basename = (p: string): string => segsOf(p).pop() ?? p;

/** The lowercased extension WITH leading dot (`.png`), or '' when there is none. */
export const extOf = (name: string): string => {
  const i = name.lastIndexOf('.');
  return i > 0 ? name.slice(i).toLowerCase() : '';
};

/** True when `name` matches one of `exts` (each `.png` or `png`). [] ⇒ matches all. */
export const matchesExt = (name: string, exts: string[]): boolean => {
  if (!exts.length) return true;
  const e = extOf(name);
  return exts.some((x) => {
    const norm = x.startsWith('.') ? x.toLowerCase() : `.${x.toLowerCase()}`;
    return e === norm;
  });
};

/**
 * Mirror of the host's `validateResult` rules (spec §1.3) — used as the picker's
 * own last line of defense before returning: a relPath must be non-empty and
 * carry no traversal, backslash, leading slash, or NUL. The host re-checks this;
 * we just refuse to ever emit a value we know it would reject.
 */
export const isSafeRel = (rel: string): boolean =>
  rel.length > 0 &&
  !rel.includes('\0') &&
  !rel.includes('\\') &&
  !rel.startsWith('/') &&
  !segsOf(rel).some((s) => s === '..');

/** Human-readable byte size. */
export const formatSize = (bytes: number): string => {
  if (!bytes) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let n = bytes;
  let i = 0;
  while (n >= 1024 && i < units.length - 1) {
    n /= 1024;
    i += 1;
  }
  const v = i === 0 ? n : n < 10 ? n.toFixed(1) : Math.round(n);
  return `${v} ${units[i]}`;
};

/** Compact relative time, falling back to a short date. '' for unknown. */
export const formatMtime = (ms: number): string => {
  if (!ms) return '';
  const diff = Date.now() - ms;
  if (diff < 60_000) return 'just now';
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  if (diff < 7 * 86_400_000) return `${Math.floor(diff / 86_400_000)}d ago`;
  return new Date(ms).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
};
