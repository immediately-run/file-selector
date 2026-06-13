// The pick-file controller (PICK_FILE_TASK_SPEC.md §3). Reads `useTaskInput()`,
// navigates the delegated chroots via the `fs` module, and returns a result with
// `completeTask()` / aborts with `cancelTask()`. It holds NO standing authority —
// the chroots the host mounted ARE its world. Hooks live here (not in a component
// file) to satisfy the Fast Refresh rule.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  cancelTask,
  completeTask,
  useFormFactor,
  useTaskInput,
  type FormFactor,
} from '@immediately-run/sdk';
import { listDir, makeDir } from '../fs';
import { isSafeRel, joinPath, matchesExt, segsOf } from '../lib/paths';
import type { CalleeParams, Entry, PickFilter, PickFileResult, PickMode, RootInfo } from '../lib/types';

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

export type LoadState = 'loading' | 'ok' | 'error';

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

  roots: RootInfo[];
  rootIdx: number;
  rootDisabled: (i: number) => boolean;
  selectRoot: (i: number) => void;

  path: string[];
  goTo: (segs: string[]) => void;

  entries: Entry[];
  loadState: LoadState;
  reload: () => void;
  matchesFilter: (e: Entry) => boolean;
  sel: string | null;
  pickEntry: (e: Entry) => void;
  enterDir: (name: string) => void;

  newFolderName: string | null;
  setNewFolderName: (s: string) => void;
  startNewFolder: () => void;
  submitNewFolder: () => void;
  cancelNewFolder: () => void;

  saveName: string;
  setSaveName: (s: string) => void;

  overwrite: string | null;
  doOverwrite: () => void;
  cancelOverwrite: () => void;

  // desktop tree
  expanded: Record<string, boolean>;
  treeChildren: Record<string, Entry[]>;
  toggleExpand: (segs: string[]) => void;
  treeKey: (segs: string[]) => string;

  canConfirm: boolean;
  primaryLabel: string;
  selectionLabel: string;
  confirm: () => void;
  cancel: () => void;

  busy: boolean;
  error: string | null;

  // mobile drill-down
  mobileView: 'roots' | 'dir';
  openRootMobile: (i: number) => void;
  backMobile: () => void;

  onListKeyDown: (e: React.KeyboardEvent) => void;
}

export function useFileSelector(): Controller {
  const input = useTaskInput();
  const formFactor = useFormFactor();

  const [params, setParams] = useState<CalleeParams | null>(null);
  const [invalid, setInvalid] = useState(false);
  const [rootIdx, setRootIdx] = useState(0);
  const [path, setPath] = useState<string[]>([]);
  const [entries, setEntries] = useState<Entry[]>([]);
  const [loadState, setLoadState] = useState<LoadState>('loading');
  const [sel, setSel] = useState<string | null>(null);
  const [filterIdx, setFilterIdx] = useState(0);
  const [saveName, setSaveName] = useState('');
  const [newFolderName, setNewFolderName] = useState<string | null>(null);
  const [overwrite, setOverwrite] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [treeChildren, setTreeChildren] = useState<Record<string, Entry[]>>({});
  const [mobileView, setMobileView] = useState<'roots' | 'dir'>('roots');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reloadTick, setReloadTick] = useState(0);

  const createdPaths = useRef<Set<string>>(new Set());
  const typeahead = useRef<{ buf: string; at: number }>({ buf: '', at: 0 });

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
      setRootIdx(parsed.startIn.root);
      setPath(segsOf(parsed.startIn.relPath));
      setMobileView('dir');
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

  const mode: PickMode = params?.mode ?? 'open-file';
  const isSave = mode === 'save-file';
  const filters = params?.filters ?? [];
  const hasFilters = mode === 'open-file' && filters.length > 0;
  const activeFilter = hasFilters ? (filters[filterIdx] ?? filters[0]) : null;
  const dest = roots[rootIdx];
  const destWritable = !!dest && dest.mode === 'rw';
  const allowCreateFolder =
    (params?.allowCreateFolder ?? mode === 'save-file') && destWritable && loadState !== 'error';

  const curDir = useMemo(
    () => (dest ? joinPath(dest.path, ...path) : null),
    [dest, path],
  );

  // ── load the current directory ───────────────────────────────────────────
  useEffect(() => {
    if (!curDir) return;
    let live = true;
    setLoadState('loading');
    setError(null);
    listDir(curDir)
      .then((e) => {
        if (!live) return;
        setEntries(e);
        setLoadState('ok');
      })
      .catch(() => {
        if (!live) return;
        setEntries([]);
        setLoadState('error');
      });
    return () => {
      live = false;
    };
  }, [curDir, reloadTick]);

  const matchesFilter = useCallback(
    (e: Entry): boolean => {
      if (e.isDir) return true;
      if (!activeFilter) return true;
      return matchesExt(e.name, activeFilter.extensions);
    },
    [activeFilter],
  );

  const sortedEntries = useMemo(
    () =>
      entries
        .slice()
        .sort((a, b) => (a.isDir === b.isDir ? a.name.localeCompare(b.name) : a.isDir ? -1 : 1)),
    [entries],
  );

  // Entries the user can actually act on (for keyboard navigation).
  const selectable = useMemo(
    () =>
      sortedEntries.filter((e) => (mode === 'open-folder' ? e.isDir : e.isDir || matchesFilter(e))),
    [sortedEntries, mode, matchesFilter],
  );

  const treeKey = useCallback((segs: string[]) => `${rootIdx}/${segs.join('/')}`, [rootIdx]);

  const loadTreeChildren = useCallback(
    async (segs: string[]) => {
      if (!dest) return;
      const key = treeKey(segs);
      try {
        const all = await listDir(joinPath(dest.path, ...segs));
        setTreeChildren((m) => ({ ...m, [key]: all.filter((e) => e.isDir) }));
      } catch {
        setTreeChildren((m) => ({ ...m, [key]: [] }));
      }
    },
    [dest, treeKey],
  );

  // Load the active root's top-level folders for the desktop tree.
  useEffect(() => {
    if (!dest || loadState === 'error') return;
    if (formFactor.class === 'mobile') return;
    void loadTreeChildren([]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rootIdx, dest, formFactor.class]);

  const goTo = useCallback((segs: string[]) => {
    setPath(segs.slice());
    setSel(null);
    setNewFolderName(null);
  }, []);

  const enterDir = useCallback((name: string) => {
    setPath((p) => p.concat(name));
    setSel(null);
    setNewFolderName(null);
  }, []);

  const selectRoot = useCallback(
    (i: number) => {
      if (isSave && roots[i]?.mode === 'ro') return; // greyed destination
      setRootIdx(i);
      setPath([]);
      setSel(null);
      setNewFolderName(null);
    },
    [isSave, roots],
  );

  const rootDisabled = useCallback(
    (i: number) => isSave && roots[i]?.mode === 'ro',
    [isSave, roots],
  );

  const pickEntry = useCallback(
    (e: Entry) => {
      if (e.isDir) {
        if (mode === 'open-folder') setSel((s) => (s === e.name ? null : e.name));
        else enterDir(e.name);
        return;
      }
      if (mode === 'open-folder') return;
      if (!matchesFilter(e)) return;
      setSel(e.name);
      if (isSave) setSaveName(e.name);
    },
    [mode, matchesFilter, isSave, enterDir],
  );

  const toggleExpand = useCallback(
    (segs: string[]) => {
      const key = treeKey(segs);
      setExpanded((m) => {
        const next = !m[key];
        if (next && !treeChildren[key]) void loadTreeChildren(segs);
        return { ...m, [key]: next };
      });
    },
    [treeKey, treeChildren, loadTreeChildren],
  );

  const reload = useCallback(() => setReloadTick((t) => t + 1), []);

  const cancel = useCallback(() => cancelTask(), []);

  const finish = useCallback(
    (relSegs: string[], created: boolean) => {
      const relPath = relSegs.join('/');
      if (!isSafeRel(relPath)) {
        setError('That name is not allowed.');
        return;
      }
      const result: PickFileResult = { root: rootIdx, relPath };
      if (created) result.created = true;
      completeTask(result);
    },
    [rootIdx],
  );

  const startNewFolder = useCallback(() => {
    if (!allowCreateFolder) return;
    setNewFolderName('');
  }, [allowCreateFolder]);

  const cancelNewFolder = useCallback(() => setNewFolderName(null), []);

  const submitNewFolder = useCallback(async () => {
    if (newFolderName == null || !curDir) return;
    const name = newFolderName.trim();
    if (!name || name.includes('/') || name.includes('\\') || name === '.' || name === '..') {
      setError('Invalid folder name.');
      return;
    }
    setBusy(true);
    setError(null);
    const abs = joinPath(curDir, name);
    try {
      await makeDir(abs);
      createdPaths.current.add(abs);
      const refreshed = await listDir(curDir);
      setEntries(refreshed);
      setNewFolderName(null);
      if (mode === 'open-folder') setSel(name); // the new folder IS the choice
      else enterDir(name); // save-file: drop into the new folder
    } catch (err) {
      // A forced create against a `ro` chroot lands here as EROFS — never data loss.
      setError(`Couldn't create folder: ${(err as Error)?.message ?? 'read-only'}.`);
    } finally {
      setBusy(false);
    }
  }, [newFolderName, curDir, mode, enterDir]);

  const confirm = useCallback(() => {
    if (!params || !dest || loadState === 'error') return;
    if (isSave) {
      const name = saveName.trim();
      if (!name || !destWritable) return;
      const exists = entries.some((e) => !e.isDir && e.name === name);
      if (exists && overwrite !== name) {
        setOverwrite(name);
        return;
      }
      finish(path.concat(name), !exists);
      return;
    }
    if (mode === 'open-folder') {
      const rel = sel ? path.concat(sel) : path.slice();
      if (rel.length === 0) return; // can't return the root itself (empty relPath)
      const abs = joinPath(dest.path, ...rel);
      finish(rel, createdPaths.current.has(abs));
      return;
    }
    // open-file
    if (!sel) return;
    finish(path.concat(sel), false);
  }, [params, dest, loadState, isSave, saveName, destWritable, entries, overwrite, finish, path, mode, sel]);

  const doOverwrite = useCallback(() => {
    if (overwrite == null) return;
    const name = overwrite;
    setOverwrite(null);
    finish(path.concat(name), false);
  }, [overwrite, finish, path]);

  const cancelOverwrite = useCallback(() => setOverwrite(null), []);

  const cycleFilter = useCallback(() => {
    setFilterIdx((i) => (i + 1) % Math.max(1, filters.length));
    setSel(null);
  }, [filters.length]);

  const openRootMobile = useCallback(
    (i: number) => {
      if (isSave && roots[i]?.mode === 'ro') return;
      selectRoot(i);
      setMobileView('dir');
    },
    [isSave, roots, selectRoot],
  );

  const backMobile = useCallback(() => {
    if (path.length > 0) goTo(path.slice(0, -1));
    else setMobileView('roots');
  }, [path, goTo]);

  // ── keyboard nav over the entry list ─────────────────────────────────────
  const onListKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (!selectable.length) return;
      const idx = sel ? selectable.findIndex((x) => x.name === sel) : -1;
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        const next = selectable[Math.min(selectable.length - 1, idx + 1)] ?? selectable[0];
        if (next) setSel(next.name);
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        const prev = selectable[Math.max(0, idx - 1)] ?? selectable[0];
        if (prev) setSel(prev.name);
        return;
      }
      if (e.key === 'Enter') {
        e.preventDefault();
        const cur = selectable.find((x) => x.name === sel);
        if (cur && cur.isDir && mode !== 'open-folder') enterDir(cur.name);
        else confirm();
        return;
      }
      if (e.key.length === 1 && !e.metaKey && !e.ctrlKey && !e.altKey) {
        const now = Date.now();
        const buf = now - typeahead.current.at < 700 ? typeahead.current.buf + e.key : e.key;
        typeahead.current = { buf: buf.toLowerCase(), at: now };
        const hit = selectable.find((x) => x.name.toLowerCase().startsWith(typeahead.current.buf));
        if (hit) setSel(hit.name);
      }
    },
    [selectable, sel, mode, enterDir, confirm],
  );

  const primaryLabel =
    mode === 'open-file' ? 'Open' : mode === 'open-folder' ? 'Choose folder' : 'Save';

  const canConfirm = useMemo(() => {
    if (!dest || loadState === 'error') return false;
    if (isSave) return destWritable && saveName.trim().length > 0;
    if (mode === 'open-folder') return sel != null || path.length > 0;
    return sel != null;
  }, [dest, loadState, isSave, destWritable, saveName, mode, sel, path]);

  const selectionLabel = useMemo(() => {
    if (error) return error;
    if (!dest) return '';
    const rel = isSave
      ? path.concat(saveName).filter(Boolean).join('/')
      : sel
        ? path.concat(sel).join('/')
        : mode === 'open-folder' && path.length
          ? path.join('/')
          : '';
    if (!rel) return mode === 'open-file' ? 'Select a file.' : 'Choose a folder.';
    return `${dest.label} / ${rel}`;
  }, [error, dest, isSave, path, saveName, sel, mode]);

  return {
    ready: !!params,
    invalid,
    formFactor,
    mode,
    title: params?.title ?? (mode === 'save-file' ? 'Save file' : mode === 'open-folder' ? 'Choose folder' : 'Open file'),
    isSave,
    hasFilters,
    filterLabel: activeFilter?.label ?? 'All files',
    cycleFilter,
    allowCreateFolder,
    roots,
    rootIdx,
    rootDisabled,
    selectRoot,
    path,
    goTo,
    entries: sortedEntries,
    loadState,
    reload,
    matchesFilter,
    sel,
    pickEntry,
    enterDir,
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
    expanded,
    treeChildren,
    toggleExpand,
    treeKey,
    canConfirm,
    primaryLabel,
    selectionLabel,
    confirm,
    cancel,
    busy,
    error,
    mobileView,
    openRootMobile,
    backMobile,
    onListKeyDown,
  };
}
