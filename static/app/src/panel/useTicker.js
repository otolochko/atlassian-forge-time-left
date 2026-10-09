import { useEffect, useState } from 'react';

/**
 * Returns the current time (epoch ms), refreshed every `intervalMs`.
 * Stops while the tab is hidden and recomputes immediately on return.
 */
export function useTicker(intervalMs) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    let timer = null;
    const stop = () => {
      clearInterval(timer);
      timer = null;
    };
    const start = () => {
      stop();
      timer = setInterval(() => setNow(Date.now()), intervalMs);
    };
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') {
        stop();
      } else {
        setNow(Date.now());
        start();
      }
    };

    if (document.visibilityState !== 'hidden') start();
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      stop();
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [intervalMs]);

  return now;
}
