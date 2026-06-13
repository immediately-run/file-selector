// Shared types for the pick-file callee (PICK_FILE_TASK_SPEC.md §1, §3).

export type PickMode = 'open-file' | 'open-folder' | 'save-file';

/** A named extension filter (spec §1.1). `extensions` are like `.png` / `png`. */
export interface PickFilter {
  label: string;
  extensions: string[];
}

/**
 * The params THIS app receives as a task callee — the host has already rewritten
 * the caller's `roots: FileCap[]` into concrete mounted chroot PATHS (one per
 * root, at `/task/<slot>/roots/<i>`), the same way `edit-file` receives a path
 * string instead of a `capFile`. Everything else passes through as plain data.
 *
 * `rootModes` / `rootLabels` travel as plain params because the picker cannot
 * resolve mount ids (spec §1.2). `rootModes` is caller-asserted and used ONLY to
 * grey read-only destinations — the host `ro` wall (EROFS) is the real boundary.
 */
export interface CalleeParams {
  mode: PickMode;
  roots: string[];
  rootLabels?: string[];
  rootModes?: ('ro' | 'rw')[];
  title?: string;
  filters?: PickFilter[];
  defaultName?: string;
  startIn?: { root: number; relPath: string };
  allowCreateFolder?: boolean;
}

/** The result returned to the caller (spec §1.3). Data, never authority. */
export interface PickFileResult {
  root: number;
  relPath: string;
  created?: boolean;
}

/** A delegated root, resolved for display. */
export interface RootInfo {
  /** The mounted chroot absolute path the app reads under. */
  path: string;
  label: string;
  mode: 'ro' | 'rw';
}

/** One filesystem entry in the current directory. */
export interface Entry {
  name: string;
  isDir: boolean;
  size: number;
  mtimeMs: number;
}
