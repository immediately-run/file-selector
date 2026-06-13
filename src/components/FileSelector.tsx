import { useFileSelector } from '../hooks/useFileSelector';
import { FileSelectorContext } from '../lib/context';
import Breadcrumbs from './Breadcrumbs';
import DialogFooter from './DialogFooter';
import EntryList from './EntryList';
import Icon, { type IconName } from './Icon';
import OverwriteConfirm from './OverwriteConfirm';
import PlacesPane from './PlacesPane';

const rootIcon = (mode: 'ro' | 'rw'): IconName => (mode === 'ro' ? 'lock' : 'folder');

// The toolbar above the entry list: breadcrumbs + new-folder + filter cycler.
// Takes the controller directly (the FileSelector root owns it).
function Toolbar({ c }: { c: ReturnType<typeof useFileSelector> }) {
  return (
    <div className="fs-toolbar">
      <Breadcrumbs />
      {c.allowCreateFolder && (
        <button type="button" className="fs-btn fs-btn-quiet fs-toolbar-btn" onClick={c.startNewFolder}>
          <Icon name="folderPlus" size={14} strokeWidth={1.7} />
          New folder
        </button>
      )}
      {c.hasFilters && (
        <button type="button" className="fs-btn fs-btn-quiet fs-toolbar-btn" onClick={c.cycleFilter}>
          {c.filterLabel}
          <Icon name="chevD" size={14} strokeWidth={2} />
        </button>
      )}
    </div>
  );
}

export default function FileSelector() {
  const c = useFileSelector();

  if (c.invalid) {
    return <div className="fs fs-blank">No location to browse.</div>;
  }
  if (!c.ready) {
    return <div className="fs fs-blank">Loading…</div>;
  }

  const mobile = c.formFactor.class === 'mobile';

  return (
    <FileSelectorContext.Provider value={c}>
      <div className={`fs${mobile ? ' fs-mobile' : ''}`}>
        <header className="fs-head">
          {mobile && c.mobileView === 'dir' && (
            <button type="button" className="fs-back" aria-label="Back" onClick={c.backMobile}>
              <Icon name="chevL" size={18} />
            </button>
          )}
          <h1 className="fs-title">{c.title}</h1>
        </header>

        {mobile ? (
          c.mobileView === 'roots' ? (
            <div className="fs-mroots fs-scroll">
              {c.roots.map((r, i) => {
                const greyed = c.rootDisabled(i);
                return (
                  <button
                    key={r.path}
                    type="button"
                    className={`fs-root${greyed ? ' is-greyed' : ''}`}
                    disabled={greyed}
                    onClick={() => c.openRootMobile(i)}
                  >
                    <Icon name={rootIcon(r.mode)} size={18} className="fs-root-ico" />
                    <span className="fs-root-text">
                      <span className="fs-root-label">{r.label}</span>
                      <span className="fs-root-sub">{r.mode === 'ro' ? 'read-only' : 'can edit'}</span>
                    </span>
                    {r.mode === 'ro' ? (
                      <Icon name="lock" size={14} strokeWidth={2} className="fs-root-badge" />
                    ) : (
                      <Icon name="chevR" size={16} className="fs-root-badge" />
                    )}
                  </button>
                );
              })}
            </div>
          ) : (
            <div className="fs-pane">
              <Toolbar c={c} />
              <EntryList />
              <DialogFooter />
            </div>
          )
        ) : (
          <div className="fs-body">
            <PlacesPane />
            <div className="fs-pane">
              <Toolbar c={c} />
              <EntryList />
              <DialogFooter />
            </div>
          </div>
        )}

        <OverwriteConfirm />
      </div>
    </FileSelectorContext.Provider>
  );
}
