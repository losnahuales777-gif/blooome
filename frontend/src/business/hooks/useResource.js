import { useCallback, useEffect, useState } from 'react';

// Carga datos asincronos y expone { data, error, loading, reload }.
export function useResource(loader, deps) {
  const [state, setState] = useState({ data: null, error: '', loading: true });
  const [version, setVersion] = useState(0);

  useEffect(() => {
    let active = true;
    setState((prev) => ({ ...prev, loading: true, error: '' }));
    loader()
      .then((data) => active && setState({ data, error: '', loading: false }))
      .catch((err) => active && setState({ data: null, error: err.message, loading: false }));
    return () => {
      active = false;
    };
  }, [...deps, version]);

  const reload = useCallback(() => setVersion((v) => v + 1), []);
  return { ...state, reload };
}
