// The pick-file controller (PICK_FILE_TASK_SPEC.md §3). Reads `useTaskInput()`,
// then hands the whole browse experience (entry list, breadcrumb, folder tree,
// root list, navigation) to the shared `@immediately-run/file-explorer-ui`
// `FileExplorerView`. This controller keeps only the PICKER CHROME: mode/params
// parse, the Open/Cancel footer, save-name, ext filters, new-folder, overwrite
// confirm, mobile framing, and the `completeTask()` / `cancelTask()` mapping to
// the `{ root, relPath, created? }` result. It holds NO standing authority — the
// delegated chroots ARE its world. Hooks live here (not in a component file) to
// satisfy the Fast Refresh rule.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  cancelTask,
  completeTask,
  useFormFactor,
  useTaskInput,
  type FormFactor,
} from '@immediately-run/sdk';
import type { ExplorerRoot } from '@immediately-run/file-explorer-ui';
import { listDir, makeDir } from '../fs';
import { cleanRel, rootIndexOf, toExplorerRoots } from '../lib/explorerAdapter';
import { isSafeRel, joinPath, matchesExt, segsOf } from '../lib/paths';
import type { CalleeParams, PickFilter, PickFileResult, PickMode, RootInfo } from '../lib/types';

const isMode = (v: unknown): v is PickMode =>
  v === 'open-file' || v === 'open-folder' || v === 'save-file';

function parseFilters(v: unknown): PickFilter[] | undefined {
  if (!Array.isArray(v)) return undefined;
  const out: PickFilter[] = [];
  for (const f of v) {
    const o = f as { label?: unknown; extensions?: unknown };
    if (typeof o?.label === 'string' && Array.isArray(o.extensions)) {
      out.push({ label: o.label, extensions: o.extensions.filter((e) => typeof e === 'string') });
    }
  }
  return out.length ? out : undefined;
}

/** Validate the (host-rewritten) callee params; null ⇒ caller bug ⇒ cancel. */
function parseParams(raw: Record<string, unknown> | undefined): CalleeParams | null {
  if (!raw) return null;
  const roots = raw.roots;
  if (!Array.isArray(roots) || roots.length === 0) return null;
  if (!roots.every((r) => typeof r === 'string' && r.length > 0)) return null;
  if (!isMode(raw.mode)) return null;
  const startInRaw = raw.startIn as { root?: unknown; relPath?: unknown } | undefined;
  const startIn =
    startInRaw &&
    typeof startInRaw.root === 'number' &&
    startInRaw.root >= 0 &&
    startInRaw.root < roots.length &&
    typeof startInRaw.relPath === 'string'
      ? { root: startInRaw.root, relPath: startInRaw.relPath }
      : undefined;
  return {
    mode: raw.mode,
    roots: roots as string[],
    rootLabels: Array.isArray(raw.rootLabels) ? (raw.rootLabels as unknown[]).map(String) : undefined,
    rootModes: Array.isArray(raw.rootModes)
      ? (raw.rootModes as unknown[]).map((m) => (m === 'ro' ? 'ro' : 'rw'))
      : undefined,
    title: typeof raw.title === 'string' ? raw.title : undefined,
    filters: parseFilters(raw.filters),
    defaultName: typeof raw.defaultName === 'string' ? raw.defaultName : undefined,
    startIn,
    allowCreateFolder: typeof raw.allowCreateFolder === 'boolean' ? raw.allowCreateFolder : undefined,
  };
}

/** The file the user has highlighted (via the library's `onSelect`), if any. */
interface Selection {
  rootIdx: number;
  /** Clean mount-relative path (no leading slash). */
  rel: string;
  name: string;
}

export interface Controller {
  ready: boolean;
  invalid: boolean;
  formFactor: FormFactor;

  mode: PickMode;
  title: string;
  isSave: boolean;
  hasFilters: boolean;
  filterLabel: string;
  cycleFilter: () => void;
  allowCreateFolder: boolean;

  // ── what the library needs ──
  roots: RootInfo[];
  explorerRoots: ExplorerRoot[];
  cwd: string | null;
  onNavigate: (root: ExplorerRoot, relPath: string) => void;
  onSelect: (root: ExplorerRoot, relPath: string) => void;
  onActivate: (root: ExplorerRoot, relPath: string, isDir: boolean) => void;

  // ── new folder (picker chrome) ──
  newFolderName: string | null;
  setNewFolderName: (s: string) => void;
  startNewFolder: () => void;
  submitNewFolder: () => void;
  cancelNewFolder: () => void;

  // ── save-name (picker chrome) ──
  saveName: string;
  setSaveName: (s: string) => void;

  // ── overwrite confirm (picker chrome) ──
  overwrite: string | null;
  doOverwrite: () => void;
  cancelOverwrite: () => void;

  // ── footer ──
  canConfirm: boolean;
  primaryLabel: string;
  selectionLabel: string;
  confirm: () => void;
  cancel: () => void;

  busy: boolean;
  error: string | null;

  // ── mobile framing ──
  showBack: boolean;
  backMobile: () => void;
}

export function useFileSelector(): Controller {
  const input = useTaskInput();
  const formFactor = useFormFactor();

  const [params, setParams] = useState<CalleeParams | null>(null);
  const [invalid, setInvalid] = useState(false);
  // The current directory the library is browsing (absolute chroot path), or null
  // for the synthetic roots-root (the library's root list). Controlled so we know
  // the save destination / new-folder target / overwrite scope at all times.
  const [cwd, setCwd] = useState<string | null>(null);
  const [sel, setSel] = useState<Selection | null>(null);
  const [filterIdx, setFilterIdx] = useState(0);
  const [saveName, setSaveName] = useState('');
  const [newFolderName, setNewFolderName] = useState<string | null>(null);
  const [overwrite, setOverwrite] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const createdPaths = useRef<Set<string>>(new Set());

  // ── init from task input (once) ──────────────────────────────────────────
  useEffect(() => {
    if (!input || params || invalid) return;
    const parsed = parseParams(input.params);
    if (!parsed) {
      // Caller bug (zero/garbled roots) — dismiss immediately (spec §3).
      setInvalid(true);
      cancelTask();
      return;
    }
    setParams(parsed);
    setSaveName(parsed.defaultName ?? '');
    if (parsed.startIn) {
      const base = parsed.roots[parsed.startIn.root];
      setCwd(joinPath(base, ...segsOf(parsed.startIn.relPath)));
    }
  }, [input, params, invalid]);

  const roots: RootInfo[] = useMemo(() => {
    if (!params) return [];
    return params.roots.map((p, i) => ({
      path: p,
      label: params.rootLabels?.[i] ?? `Location ${i + 1}`,
      mode: params.rootModes?.[i] ?? 'rw',
    }));
  }, [params]);

  const explorerRoots = useMemo(() => toExplorerRoots(roots), [roots]);

  const mode: PickMode = params?.mode ?? 'open-file';
  const isSave = mode === 'save-file';
  const filters = params?.filters ?? [];
  const hasFilters = mode === 'open-file' && filters.length > 0;
  const activeFilter = hasFilters ? (filters[filterIdx] ?? filters[0]) : null;

  // The root that owns the current directory (null at the roots-root). Its index
  // is the `root` field of the returned result; its writability gates create/save.
  const curRootIdx = useMemo(() => {
    if (!cwd) return null;
    const i = roots.findIndex((r) => cwd === r.path || cwd.startsWith(r.path + '/'));
    return i >= 0 ? i : null;
  }, [cwd, roots]);
  const curRoot = curRootIdx != null ? roots[curRootIdx] : null;
  const destWritable = !!curRoot && curRoot.mode === 'rw';

  const allowCreateFolder =
    (params?.allowCreateFolder ?? mode === 'save-file') && !!cwd && destWritable;

  const matchesFilter = useCallback(
    (name: string): boolean => (activeFilter ? matchesExt(name, activeFilter.extensions) : true),
    [activeFilter],
  );

  // ── library callbacks ────────────────────────────────────────────────────
  // `onNavigate` fires from the library's flat list when the browsed directory
  // changes (breadcrumb / opening a folder / opening a root). Adopt it as our
  // controlled cwd — this is the save destination / open-folder choice / the
  // new-folder target. `onActivate(dir)` reports the same transition, so keeping
  // both in sync is idempotent.
  const onNavigate = useCallback((root: ExplorerRoot, relPath: string) => {
    const rel = cleanRel(relPath);
    setCwd(rel ? joinPath(root.path, ...segsOf(rel)) : root.path);
    setSel(null);
    setNewFolderName(null);
  }, []);

  // `onActivate` fires for both a directory (the library navigates into it and
  // reports the NEW directory) and a file (a click/Enter). For directories we
  // adopt the new cwd; for files we record the highlight (save-file also fills the
  // name field). We never auto-complete here — the footer's primary button is the
  // single commit path, so filter/writability gating stays meaningful.
  const onActivate = useCallback(
    (root: ExplorerRoot, relPath: string, isDir: boolean) => {
      setError(null);
      if (isDir) {
        const rel = cleanRel(relPath);
        setCwd(rel ? joinPath(root.path, ...segsOf(rel)) : root.path);
        setSel(null);
        setNewFolderName(null);
        return;
      }
      const rel = cleanRel(relPath);
      const name = segsOf(rel).pop() ?? rel;
      setSel({ rootIdx: rootIndexOf(root), rel, name });
      if (isSave) setSaveName(name);
    },
    [isSave],
  );

  // The library's single-cursor highlight. Same effect as a file activation's
  // highlight; directories don't fire `onSelect`.
  const onSelect = useCallback(
    (root: ExplorerRoot, relPath: string) => {
      setError(null);
      const rel = cleanRel(relPath);
      const name = segsOf(rel).pop() ?? rel;
      setSel({ rootIdx: rootIndexOf(root), rel, name });
      if (isSave) setSaveName(name);
    },
    [isSave],
  );

  // ── filters ──────────────────────────────────────────────────────────────
  const cycleFilter = useCallback(() => {
    setFilterIdx((i) => (i + 1) % Math.max(1, filters.length));
    setSel(null);
  }, [filters.length]);

  // ── result mapping ─────────────────────────────────────────────────────────
  const finish = useCallback((rootIdx: number, rel: string, created: boolean) => {
    if (!isSafeRel(rel)) {
      setError('That name is not allowed.');
      return;
    }
    const result: PickFileResult = { root: rootIdx, relPath: rel };
    if (created) result.created = true;
    completeTask(result);
  }, []);

  const cancel = useCallback(() => cancelTask(), []);

  // ── new folder ─────────────────────────────────────────────────────────────
  const startNewFolder = useCallback(() => {
    if (!allowCreateFolder) return;
    setNewFolderName('');
  }, [allowCreateFolder]);

  const cancelNewFolder = useCallback(() => setNewFolderName(null), []);

  const submitNewFolder = useCallback(async () => {
    if (newFolderName == null || !cwd || curRoot == null) return;
    const name = newFolderName.trim();
    if (!name || name.includes('/') || name.includes('\\') || name === '.' || name === '..') {
      setError('Invalid folder name.');
      return;
    }
    setBusy(true);
    setError(null);
    const abs = joinPath(cwd, name);
    try {
      await makeDir(abs);
      createdPaths.current.add(abs);
      setNewFolderName(null);
      // Drop into the new folder (save-file) / make it the browsed dir; the
      // library re-reads this directory on its next render.
      setCwd(abs);
      setSel(null);
    } catch (err) {
      // A forced create against a `ro` chroot lands here as EROFS — never data loss.
      setError(`Couldn't create folder: ${(err as Error)?.message ?? 'read-only'}.`);
    } finally {
      setBusy(false);
    }
  }, [newFolderName, cwd, curRoot]);

  // ── confirm (the footer's primary button) ───────────────────────────────────
  const confirm = useCallback(() => {
    if (!params) return;
    if (isSave) {
      const name = saveName.trim();
      if (!name || !cwd || curRootIdx == null || !destWritable) return;
      const relSegs = curRoot ? segsOf(cwd.slice(curRoot.path.length)).concat(name) : [name];
      const rel = relSegs.join('/');
      // Overwrite confirm: check the current directory for a same-named file.
      listDir(cwd)
        .then((entries) => {
          const exists = entries.some((e) => !e.isDir && e.name === name);
          if (exists && overwrite !== name) {
            setOverwrite(name);
            return;
          }
          finish(curRootIdx, rel, !exists);
        })
        .catch(() => {
          // Can't stat the dir — attempt the save; the host is the real boundary.
          finish(curRootIdx, rel, false);
        });
      return;
    }
    if (mode === 'open-folder') {
      // The chosen folder is the current directory (the library navigates into
      // folders; you drill to the one you want, then Choose folder).
      if (!cwd || curRootIdx == null || !curRoot) return;
      const rel = segsOf(cwd.slice(curRoot.path.length)).join('/');
      if (rel.length === 0) return; // can't return the root itself (empty relPath)
      const abs = joinPath(curRoot.path, ...segsOf(rel));
      finish(curRootIdx, rel, createdPaths.current.has(abs));
      return;
    }
    // open-file — a highlighted, filter-matching file.
    if (!sel) return;
    if (!matchesFilter(sel.name)) return;
    finish(sel.rootIdx, sel.rel, false);
  }, [params, isSave, saveName, cwd, curRootIdx, curRoot, destWritable, overwrite, finish, mode, sel, matchesFilter]);

  const doOverwrite = useCallback(() => {
    if (overwrite == null || !cwd || curRootIdx == null || !curRoot) return;
    const name = overwrite;
    setOverwrite(null);
    const rel = segsOf(cwd.slice(curRoot.path.length)).concat(name).join('/');
    finish(curRootIdx, rel, false);
  }, [overwrite, cwd, curRootIdx, curRoot, finish]);

  const cancelOverwrite = useCallback(() => setOverwrite(null), []);

  // ── footer state ─────────────────────────────────────────────────────────
  const primaryLabel =
    mode === 'open-file' ? 'Open' : mode === 'open-folder' ? 'Choose folder' : 'Save';

  const canConfirm = useMemo(() => {
    if (isSave) return destWritable && saveName.trim().length > 0;
    if (mode === 'open-folder') return curRootIdx != null && !!cwd && cwd !== curRoot?.path;
    // open-file: a highlighted file that matches the active filter.
    return !!sel && matchesFilter(sel.name);
  }, [isSave, destWritable, saveName, mode, curRootIdx, cwd, curRoot, sel, matchesFilter]);

  const selectionLabel = useMemo(() => {
    if (error) return error;
    const label = curRoot?.label ?? (sel != null ? roots[sel.rootIdx]?.label : undefined);
    if (isSave) {
      const dirRel = curRoot && cwd ? segsOf(cwd.slice(curRoot.path.length)).join('/') : '';
      const full = [dirRel, saveName].filter(Boolean).join('/');
      if (!full || !label) return 'Choose a folder and file name.';
      return `${label} / ${full}`;
    }
    if (mode === 'open-folder') {
      const rel = curRoot && cwd ? segsOf(cwd.slice(curRoot.path.length)).join('/') : '';
      if (!rel || !label) return 'Open a folder to choose it.';
      return `${label} / ${rel}`;
    }
    if (!sel) return 'Select a file.';
    return `${roots[sel.rootIdx]?.label ?? ''} / ${sel.rel}`;
  }, [error, curRoot, cwd, isSave, saveName, mode, sel, roots]);

  // ── "back to locations" ────────────────────────────────────────────────
  // The library's list drills DOWN via its own breadcrumb, but under a CONTROLLED
  // `cwd` its "roots-root" breadcrumb link can't report the null transition back to
  // us (library gap — see report). We own that affordance instead: a header Back
  // button that returns to the root list (`cwd = null`), so multi-root switching
  // works on every form factor. Shown whenever we're inside a root.
  const showBack = cwd != null;
  const backMobile = useCallback(() => {
    setCwd(null);
    setSel(null);
    setNewFolderName(null);
  }, []);

  return {
    ready: !!params,
    invalid,
    formFactor,
    mode,
    title:
      params?.title ??
      (mode === 'save-file' ? 'Save file' : mode === 'open-folder' ? 'Choose folder' : 'Open file'),
    isSave,
    hasFilters,
    filterLabel: activeFilter?.label ?? 'All files',
    cycleFilter,
    allowCreateFolder,
    roots,
    explorerRoots,
    cwd,
    onNavigate,
    onSelect,
    onActivate,
    newFolderName,
    setNewFolderName,
    startNewFolder,
    submitNewFolder,
    cancelNewFolder,
    saveName,
    setSaveName,
    overwrite,
    doOverwrite,
    cancelOverwrite,
    canConfirm,
    primaryLabel,
    selectionLabel,
    confirm,
    cancel,
    busy,
    error,
    showBack,
    backMobile,
  };
}
