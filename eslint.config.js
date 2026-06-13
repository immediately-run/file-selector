import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'
import { defineConfig, globalIgnores } from 'eslint/config'

// reactRefresh.configs.vite enforces the React Fast Refresh rule: a module that
// exports a component must export ONLY components. This is what keeps the app
// HMR-safe inside immediately.run — keep it. Data goes in src/data/, hooks in
// src/hooks/.
export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      js.configs.recommended,
      tseslint.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
    rules: {
      // `react-hooks/set-state-in-effect` is a new (v7) React-Compiler rule. The
      // picker's controller (src/hooks/useFileSelector.ts) synchronizes with TWO
      // external systems that legitimately require a synchronous setState in an
      // effect: (1) the task-input subscription — when the host delivers params,
      // we parse them and, on a caller bug (zero roots), set `invalid` + call
      // `cancelTask()`; (2) directory/tree loading — when the navigation target
      // changes we set `loading` before the async `fs` read (the canonical
      // data-fetching effect). Neither causes a cascading render loop. The
      // load-bearing lint for immediately.run — the Fast Refresh
      // `react-refresh/only-export-components` rule — stays fully enforced.
      'react-hooks/set-state-in-effect': 'off',
    },
  },
])
