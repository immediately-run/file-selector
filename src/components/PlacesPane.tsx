import { useController } from '../lib/context';
import type { Entry } from '../lib/types';
import Icon, { type IconName } from './Icon';

const rootIcon = (mode: 'ro' | 'rw'): IconName => (mode === 'ro' ? 'lock' : 'folder');

// Recursive directory tree under the active root (desktop left pane).
function TreeNodes({ base }: { base: string[] }) {
  const c = useController();
  const key = c.treeKey(base);
  const kids: Entry[] = c.treeChildren[key] ?? [];
  return (
    <div className="fs-tree-group">
      {kids.map((n) => {
        const segs = base.concat(n.name);
        const k = c.treeKey(segs);
        const exp = !!c.expanded[k];
        const onPath = c.path.slice(0, segs.length).join('/') === segs.join('/') && c.path.length >= segs.length;
        return (
          <div key={k}>
            <button
              type="button"
              className={`fs-tnode${onPath ? ' is-onpath' : ''}`}
              onClick={() => {
                c.goTo(segs);
                c.toggleExpand(segs);
              }}
            >
              <span className={`fs-tnode-twisty${exp ? ' is-open' : ''}`}>
                <Icon name="chevR" size={12} strokeWidth={2} />
              </span>
              <Icon name={exp ? 'folderOpen' : 'folder'} size={15} strokeWidth={1.6} className="fs-tnode-ico" />
              <span className="fs-tnode-label">{n.name}</span>
            </button>
            {exp && <div className="fs-tree-indent"><TreeNodes base={segs} /></div>}
          </div>
        );
      })}
    </div>
  );
}

// "Places": the delegated roots, plus the active root's folder tree.
export default function PlacesPane() {
  const c = useController();
  return (
    <aside className="fs-places fs-scroll" aria-label="Locations">
      <div className="fs-places-head">Places</div>
      {c.roots.map((r, i) => {
        const active = c.rootIdx === i;
        const greyed = c.rootDisabled(i);
        return (
          <div key={r.path}>
            <button
              type="button"
              className={`fs-root${active ? ' is-active' : ''}${greyed ? ' is-greyed' : ''}`}
              disabled={greyed}
              aria-current={active ? 'true' : undefined}
              onClick={() => c.selectRoot(i)}
            >
              <Icon name={rootIcon(r.mode)} size={16} className="fs-root-ico" />
              <span className="fs-root-text">
                <span className="fs-root-label">{r.label}</span>
                <span className="fs-root-sub">{r.mode === 'ro' ? 'read-only' : 'can edit'}</span>
              </span>
              {r.mode === 'ro' && <Icon name="lock" size={13} strokeWidth={2} className="fs-root-badge" />}
            </button>
            {active && c.loadState !== 'error' && (
              <div className="fs-tree">
                <TreeNodes base={[]} />
              </div>
            )}
          </div>
        );
      })}
    </aside>
  );
}
