"use client";
import * as React from "react";

// 250ms debounce per spec (search)
export function useDebouncedValue<T>(value: T, delay = 250): T {
  const [debounced, setDebounced] = React.useState(value);
  React.useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return debounced;
}

export function useDebouncedCallback<F extends (...args: unknown[]) => void>(fn: F, delay = 250): F {
  const ref = React.useRef(fn);
  ref.current = fn;
  const timer = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const debounced = React.useCallback(
    (...args: Parameters<F>) => {
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => ref.current(...args), delay);
    },
    [delay]
  ) as F;
  React.useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);
  return debounced;
}
