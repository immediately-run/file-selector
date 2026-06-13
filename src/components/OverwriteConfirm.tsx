import { useController } from '../lib/context';

// In-dialog overwrite confirmation for save-file (spec §1.1: overwrite requires
// an explicit confirm). Rendered inside the picker's own region — not host chrome.
export default function OverwriteConfirm() {
  const c = useController();
  if (c.overwrite == null) return null;
  return (
    <div className="fs-overlay" role="dialog" aria-modal="true" aria-label="Confirm overwrite">
      <div className="fs-confirm">
        <div className="fs-confirm-title">Replace {c.overwrite}?</div>
        <div className="fs-confirm-body">
          A file with this name already exists in this folder. Saving will overwrite it.
        </div>
        <div className="fs-confirm-actions">
          <button type="button" className="fs-btn fs-btn-quiet" onClick={c.cancelOverwrite}>
            Keep both
          </button>
          <button type="button" className="fs-btn fs-btn-primary" onClick={c.doOverwrite}>
            Replace
          </button>
        </div>
      </div>
    </div>
  );
}
