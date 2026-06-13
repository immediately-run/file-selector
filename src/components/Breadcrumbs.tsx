import { useController } from '../lib/context';
import Icon, { type IconName } from './Icon';

const rootIcon = (mode: 'ro' | 'rw'): IconName => (mode === 'ro' ? 'lock' : 'folder');

// The path trail for the active root: root label, then one crumb per segment.
export default function Breadcrumbs() {
  const c = useController();
  const root = c.roots[c.rootIdx];
  if (!root) return null;
  return (
    <nav className="fs-crumbs" aria-label="Breadcrumb">
      <button
        type="button"
        className={`fs-crumb${c.path.length === 0 ? ' is-here' : ''}`}
        onClick={() => c.goTo([])}
      >
        <Icon name={rootIcon(root.mode)} size={14} />
        <span className="fs-crumb-label">{root.label}</span>
      </button>
      {c.path.map((seg, i) => (
        <span key={`${seg}-${i}`} className="fs-crumb-sep-wrap">
          <Icon name="chevR" size={13} strokeWidth={2} className="fs-crumb-sep" />
          <button
            type="button"
            className={`fs-crumb${i === c.path.length - 1 ? ' is-here' : ''}`}
            onClick={() => c.goTo(c.path.slice(0, i + 1))}
          >
            {seg}
          </button>
        </span>
      ))}
    </nav>
  );
}
