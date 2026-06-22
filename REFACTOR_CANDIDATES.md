# FINDINGS — file-selector

Recorded by the 2026-06 code-verification pass (R3-124; plan `08-system-apps.md`).
**Record / verify only.** Gates green (`npm run build` + `npm run lint`).

## Spec-refs (Phase 1)

`provides: pick-file@1.0`. ~11 spec-refs across `FileSelector.tsx`,
`hooks/useFileSelector.ts`, `lib/`. Cited specs: the **pick-file task**
(`PICK_FILE_TASK_SPEC`, which lives in the whiteboard-app docs subdir — NOT in the
main `docs/specs/` checkout, so not fully resolvable here) and `UI_AS_APPS` tasks
§5.7. Verify at execution that any opaque `plan Phase N` pointers are replaced with
the real `PICK_FILE_TASK_SPEC §` where one exists. The app uses
`useTaskInput`/`completeTask`/`cancelTask` and handles cancellation/absence —
Done-spec ↔ code mapping checks out (dev-fs + MDX wired).

## SDK-version skew (record only)

Pins `@immediately-run/sdk` at **`0.8.1`** (fleet spread: `0.2.8` / `0.8.1` /
`0.11.0` / `^0.12.0`). Coordinated bump owed; do not bump here.

## Vocabulary (Phase 2)

No `kernel` / `principal`-as-grantee found in `src/`. `main.tsx` dev-only.
Conformant. (file-selector has a vitest suite for its hooks — `npm test` applies.)
