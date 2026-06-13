// Sandbox filesystem access (mirrors the `edit-file` reference callee). The host
// mounts each delegated, task-scoped chroot into this iframe; app code reaches it
// through `module.evaluation.module.bundler.fs` — a node-compatible ZenFS exposed
// by the sandbox runtime. Outside the delegated chroots nothing is nameable, and
// a `ro` delegation makes any write throw `EROFS` host-side (§8.7).
/* eslint-disable @typescript-eslint/no-explicit-any */
import { joinPath } from './lib/paths';
import type { Entry } from './lib/types';

function sandboxFs(): any | null {
  try {
    // @ts-expect-error - `module` is injected by the sandbox runtime
    return module?.evaluation?.module?.bundler?.fs ?? null;
  } catch {
    return null;
  }
}

function promisesApi(): any {
  const fs = sandboxFs();
  if (!fs) throw new Error('sandbox filesystem unavailable');
  return fs.promises ?? fs;
}

export const fsAvailable = (): boolean => sandboxFs() != null;

/** Read a directory's children with their stats. Throws if `dir` is unreadable. */
export async function listDir(dir: string): Promise<Entry[]> {
  const fs = promisesApi();
  const names: string[] = await fs.readdir(dir);
  const out: Entry[] = [];
  for (const name of names) {
    if (name === '.' || name === '..') continue;
    let isDir = false;
    let size = 0;
    let mtimeMs = 0;
    try {
      const st = await fs.stat(joinPath(dir, name));
      isDir = typeof st.isDirectory === 'function' ? st.isDirectory() : !!st.isDirectory;
      size = Number(st.size ?? 0);
      mtimeMs = Number(st.mtimeMs ?? (st.mtime ? new Date(st.mtime).getTime() : 0));
    } catch {
      // An entry we can read in the listing but not stat — surface it as a plain
      // file with no stats rather than failing the whole directory.
    }
    out.push({ name, isDir, size, mtimeMs });
  }
  return out;
}

/** Create a directory. On a `ro` chroot this throws `EROFS` (the host wall). */
export async function makeDir(path: string): Promise<void> {
  await promisesApi().mkdir(path);
}

/** True when a path exists (stat succeeds). */
export async function pathExists(path: string): Promise<boolean> {
  try {
    await promisesApi().stat(path);
    return true;
  } catch {
    return false;
  }
}
