import { FileExplorerView } from '@immediately-run/file-explorer-ui';
import '@immediately-run/file-explorer-ui/styles.css';
import { useFileSelector } from '../hooks/useFileSelector';
import { FileSelectorContext } from '../lib/context';
import { explorerFs } from '../lib/explorerAdapter';
import DialogFooter from './DialogFooter';
import Icon from './Icon';
import NewFolderBar from './NewFolderBar';
import OverwriteConfirm from './OverwriteConfirm';

// The toolbar above the browse area: the new-folder + filter chrome the library
// doesn't provide. Breadcrumb + root list + entry rows are the library's.
function Toolbar({ c }: { c: ReturnType<typeof useFileSelector> }) {
  if (!c.allowCreateFolder && !c.hasFilters) return null;
  return (
    <div className="fs-toolbar">
      <span className="fs-toolbar-spacer" />
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
          {c.showBack && (
            <button type="button" className="fs-back" aria-label="Locations" onClick={c.backMobile}>
              <Icon name="chevL" size={18} />
            </button>
          )}
          <h1 className="fs-title">{c.title}</h1>
        </header>

        <div className="fs-pane">
          <Toolbar c={c} />
          <NewFolderBar />
          <div className="fs-browse">
            <FileExplorerView
              roots={c.explorerRoots}
              fs={explorerFs}
              cwd={c.cwd}
              selectionMode="single"
              onSelect={c.onSelect}
              onActivate={c.onActivate}
              onNavigate={c.onNavigate}
              layout="list"
            />
          </div>
          <DialogFooter />
        </div>

        <OverwriteConfirm />
      </div>
    </FileSelectorContext.Provider>
  );
}
