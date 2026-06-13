// The controller is shared down the tree via context so the presentational
// components stay thin (no prop-drilling the whole picker state).
import { createContext, useContext } from 'react';
import type { Controller } from '../hooks/useFileSelector';

export const FileSelectorContext = createContext<Controller | null>(null);

export function useController(): Controller {
  const c = useContext(FileSelectorContext);
  if (!c) throw new Error('useController must be used within a FileSelector provider');
  return c;
}
