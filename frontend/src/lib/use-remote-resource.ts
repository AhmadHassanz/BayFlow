'use client';
import { useCallback, useEffect, useState } from 'react';

export type RemoteResource<T> = { kind: 'loading' } | { kind: 'success'; data: T } | { kind: 'error'; error: unknown };

// Callers stabilize load with useCallback; changing the resource key remounts the view.
export function useRemoteResource<T>(load: (signal: AbortSignal) => Promise<T>, initial?: T, refreshOnFocus = false) {
  const [state, setState] = useState<RemoteResource<T>>(initial === undefined ? { kind: 'loading' } : { kind: 'success', data: initial });
  const [attempt, setAttempt] = useState(0);
  const retry = useCallback(() => { setState({ kind: 'loading' }); setAttempt(value => value + 1); }, []);
  useEffect(() => {
    if (initial !== undefined && attempt === 0) return;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);
    let active = true;
    load(controller.signal).then(data => {
      if (active) setState({ kind: 'success', data });
    }).catch(error => {
      if (active) setState({ kind: 'error', error });
    }).finally(() => clearTimeout(timeout));
    return () => { active = false; controller.abort(); clearTimeout(timeout); };
  }, [load, initial, attempt]);
  useEffect(() => {
    if (!refreshOnFocus) return;
    window.addEventListener('focus', retry);
    return () => window.removeEventListener('focus', retry);
  }, [refreshOnFocus, retry]);
  return { state, retry };
}
