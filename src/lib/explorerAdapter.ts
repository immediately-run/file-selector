// Adapters that bridge the picker's world onto the shared file-explorer library.
// The library owns the entry list, breadcrumb, folder navigation and root list;
// this file maps the picker's `RootInfo` + `fs` module onto the library's
// injected `ExplorerRoot` / `FsSource` shapes. Kept out of a component file so it
// exports only data/helpers (Fast Refresh rule).
import type { DirEntry, ExplorerRoot, FsSource } from '@immediately-run/file-explorer-ui';
import { listDir } from '../fs';
import type { RootInfo } from './types';

/**
 * Wrap the sandbox `fs` module (via `listDir`) as the library's {@link FsSource}.
 * The library only ever calls `readdir` for the list layout; `readFile` is unused
 * by the picker, so we omit it (the picker never reads bytes).
 */
export const explorerFs: FsSource = {
  async readdir(path: string): Promise<DirEntry[]> {
    const entries = await listDir(path);
    return entries.map((e) => ({
      name: e.name,
      isDir: e.isDir,
      size: e.size,
      mtimeMs: e.mtimeMs,
    }));
  },
};

/**
 * Map the delegated roots onto the library's {@link ExplorerRoot}. The `id`
 * carries the root INDEX as a string so a returned root resolves straight back to
 * the `pick-file` result's numeric `root`. `kind: 'space'` picks the neutral
 * scope header; writability drives the library's (unused-here) write affordances
 * and the breadcrumb's read-only chip.
 */
export const toExplorerRoots = (roots: RootInfo[]): ExplorerRoot[] =>
  roots.map((r, i) => ({
    id: String(i),
    path: r.path,
    label: r.label,
    kind: 'other',
    writable: r.mode === 'rw',
    scopes: [{ subtree: '/', mode: r.mode }],
  }));

/** The numeric root index encoded in an {@link ExplorerRoot.id}. */
export const rootIndexOf = (root: ExplorerRoot): number => Number(root.id);

/**
 * The library reports mount-relative paths with a leading slash ("/foo/bar", or
 * "/" for the root itself). The `pick-file` result wants a clean POSIX relPath
 * with no leading slash ("" for the root). Normalize here.
 */
export const cleanRel = (mountRel: string): string =>
  mountRel === '/' ? '' : mountRel.replace(/^\/+/, '');
