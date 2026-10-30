import { useEffect, useRef, useState } from 'react';
import type { OperationStatus } from '../shared/operation';

/** The server owns operation lifetime, including across navigation and reload. */
export function useOperation(onSettled: () => void) {
  const [operation, setOperation] = useState<OperationStatus['active']>(null);
  const [unavailable, setUnavailable] = useState(false);
  const [failure, setFailure] = useState<OperationStatus['lastFinished']>(null);
  const dismissedFailure = useRef<string | null>(null);
  function dismissFailure() {
    dismissedFailure.current = failure?.id || null;
    try { if (failure) sessionStorage.setItem('payproof.dismissed-operation-failure', failure.id); } catch { /* Dismissal still works for this page. */ }
    setFailure(null);
  }
  const callback = useRef(onSettled);
  callback.current = onSettled;
  useEffect(() => {
    const controller = new AbortController();
    try { dismissedFailure.current = sessionStorage.getItem('payproof.dismissed-operation-failure'); } catch { /* Storage is optional. */ }
    let timer: ReturnType<typeof setTimeout>;
    let previous: OperationStatus | undefined;
    async function poll() {
      try {
        const response = await fetch('/api/operation', { signal: controller.signal, cache: 'no-store' });
        if (!response.ok) throw new Error('Operation status unavailable');
        const next: OperationStatus = await response.json();
        if (controller.signal.aborted) return;
        setUnavailable(false); setOperation(next.active);
        if (!previous || next.lastFinished?.id !== previous.lastFinished?.id) {
          const finished = next.lastFinished;
          // Short in-page validation errors keep their specific inline feedback.
          // Recover a failure when this page saw the job running, or reopened after it ended.
          setFailure(finished?.outcome === 'failed' && finished.id !== dismissedFailure.current && (!previous || previous.active?.id === finished.id) ? finished : null);
        }
        if (previous && (next.lastFinished?.id !== previous.lastFinished?.id || (previous.active && !next.active))) callback.current();
        previous = next;
      } catch {
        if (!controller.signal.aborted) setUnavailable(true);
      } finally {
        if (!controller.signal.aborted) timer = setTimeout(poll, 1500);
      }
    }
    void poll();
    return () => { controller.abort(); clearTimeout(timer); };
  }, []);
  return { operation, unavailable, failure, dismissFailure };
}
