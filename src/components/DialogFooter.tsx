import { useController } from '../lib/context';

// The save-name field (save-file only) + selection summary + Cancel / primary.
export default function DialogFooter() {
  const c = useController();
  return (
    <div className="fs-foot">
      {c.isSave && (
        <label className="fs-savefield">
          <span className="fs-savefield-label">Save as</span>
          <input
            className="fs-savefield-input"
            value={c.saveName}
            placeholder="filename"
            aria-label="File name"
            onChange={(e) => c.setSaveName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && c.canConfirm) c.confirm();
            }}
          />
        </label>
      )}
      <div className="fs-foot-row">
        <span className={`fs-selpath${c.error ? ' is-error' : ''}`}>{c.selectionLabel}</span>
        <button type="button" className="fs-btn fs-btn-quiet" onClick={c.cancel}>
          Cancel
        </button>
        <button
          type="button"
          className="fs-btn fs-btn-primary"
          disabled={!c.canConfirm || c.busy}
          onClick={c.confirm}
        >
          {c.primaryLabel}
        </button>
      </div>
    </div>
  );
}
