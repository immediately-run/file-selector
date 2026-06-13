// Root component — immediately.run renders the default export of THIS file.
// The pick-file task callee (PICK_FILE_TASK_SPEC.md): the caller delegates one or
// more directory roots; the host mints attenuated, task-scoped chroots and hands
// this app their mounted paths. It browses them and returns `{ root, relPath }` —
// it holds no standing authority; the chroots ARE its world (§2).
import { useEffect } from 'react';
import { useHostTheme } from '@immediately-run/sdk';
import './index.css';
import './components/FileSelector.css';
import FileSelector from './components/FileSelector';

function App() {
  // Render in step with the host chrome: mirror the host theme onto <html>, which
  // drives the `[data-theme="light"]` tokens in index.css.
  const theme = useHostTheme();
  useEffect(() => {
    const root = document.documentElement;
    if (theme === 'light') root.setAttribute('data-theme', 'light');
    else root.removeAttribute('data-theme');
  }, [theme]);

  return <FileSelector />;
}

export default App;
