import { useController } from '../lib/context';
import type { Entry } from '../lib/types';
import { extOf, formatMtime, formatSize } from '../lib/paths';
import Icon, { type IconName } from './Icon';

const IMG_EXT = ['.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg', '.avif'];
const VID_EXT = ['.mp4', '.webm', '.mov', '.mkv'];

function entryIcon(e: Entry): IconName {
  if (e.isDir) return 'folder';
  const ext = extOf(e.name);
  if (IMG_EXT.includes(ext)) return 'image';
  if (VID_EXT.includes(ext)) return 'video';
  if (ext === '.zip') return 'archive';
  return 'file';
}

// The inline "new folder" name editor, shown at the top of the list.
function NewFolderRow() {
  const c = useController();
  if (c.newFolderName == null) return null;
  return (
    <div className="fs-newfolder">
      <Icon name="folderPlus" size={18} strokeWidth={1.7} className="fs-newfolder-ico" />
      <input
        autoFocus
        className="fs-newfolder-input"
        value={c.newFolderName}
        placeholder="New folder name"
        aria-label="New folder name"
        onChange={(e) => c.setNewFolderName(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') c.submitNewFolder();
          if (e.key === 'Escape') c.cancelNewFolder();
        }}
      />
      <button type="button" className="fs-btn fs-btn-quiet" onClick={c.cancelNewFolder}>
        Cancel
      </button>
      <button type="button" className="fs-btn fs-btn-create" disabled={c.busy} onClick={c.submitNewFolder}>
        Create
      </button>
    </div>
  );
}

export default function EntryList() {
  const c = useController();

  if (c.loadState === 'error') {
    return (
      <div className="fs-entries fs-scroll">
        <div className="fs-errrow" role="alert">
          <Icon name="alert" size={20} className="fs-errrow-ico" />
          <div className="fs-errrow-body">
            <div className="fs-errrow-title">Can&apos;t read this location.</div>
            <div className="fs-errrow-sub">It may be offline, or your access was revoked.</div>
          </div>
          <button type="button" className="fs-btn fs-btn-quiet" onClick={c.reload}>
            <Icon name="refresh" size={14} />
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div
      className="fs-entries fs-scroll"
      role="listbox"
      aria-label="Files and folders"
      tabIndex={0}
      onKeyDown={c.onListKeyDown}
    >
      <NewFolderRow />
      {c.loadState === 'loading' ? (
        <div className="fs-empty">Loading…</div>
      ) : c.entries.length === 0 && c.newFolderName == null ? (
        <div className="fs-empty">
          <Icon name="folderOpen" size={34} strokeWidth={1.4} />
          <div>This folder is empty.</div>
        </div>
      ) : (
        c.entries.map((e) => {
          const allowed = e.isDir || c.matchesFilter(e);
          const dimmed = !e.isDir && !c.matchesFilter(e);
          const selected = c.sel === e.name;
          return (
            <button
              key={e.name}
              type="button"
              role="option"
              aria-selected={selected}
              disabled={dimmed}
              className={`fs-entry${selected ? ' is-selected' : ''}${dimmed ? ' is-dim' : ''}`}
              onClick={() => allowed && c.pickEntry(e)}
              onDoubleClick={() => e.isDir && c.enterDir(e.name)}
            >
              <Icon
                name={entryIcon(e)}
                size={18}
                strokeWidth={1.7}
                className={e.isDir ? 'fs-entry-ico is-dir' : 'fs-entry-ico'}
              />
              <span className="fs-entry-name">{e.name}</span>
              {e.isDir ? (
                <Icon name="chevR" size={15} strokeWidth={1.75} className="fs-entry-chev" />
              ) : (
                <span className="fs-entry-meta">
                  {[formatSize(e.size), formatMtime(e.mtimeMs)].filter(Boolean).join(' · ')}
                </span>
              )}
            </button>
          );
        })
      )}
    </div>
  );
}
