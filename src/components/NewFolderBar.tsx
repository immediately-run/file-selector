import { useController } from '../lib/context';
import Icon from './Icon';

// The inline "new folder" name editor (picker chrome). Shown above the library's
// browse area when the user starts a new folder; on submit the controller calls
// `fs.makeDir` and drops the library into the new directory.
export default function NewFolderBar() {
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
