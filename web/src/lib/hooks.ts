import { useEffect, useState } from 'react';
import { useParams, useSearchParams } from 'react-router';

/** Paramètre d'URL avec valeur par défaut (les filtres restent dans l'URL, partageables). */
export function useSearchParam<T extends string>(name: string, fallback: T, allowed?: readonly T[]) {
  const [params, setParams] = useSearchParams();
  const raw = params.get(name) as T | null;
  const value = raw !== null && (!allowed || allowed.includes(raw)) ? raw : fallback;
  const setValue = (next: T | null) => {
    setParams(
      (current) => {
        const copy = new URLSearchParams(current);
        if (next === null || next === fallback) copy.delete(name);
        else copy.set(name, next);
        return copy;
      },
      { replace: true },
    );
  };
  return [value, setValue] as const;
}

export function usePlayerSlug(): string {
  return useParams().tag ?? '';
}

/** Horloge qui se met à jour régulièrement (temps relatifs, comptes à rebours). */
export function useNow(intervalMs = 30_000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(timer);
  }, [intervalMs]);
  return now;
}

export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(() => window.matchMedia(query).matches);
  useEffect(() => {
    const media = window.matchMedia(query);
    const listener = () => setMatches(media.matches);
    media.addEventListener('change', listener);
    return () => media.removeEventListener('change', listener);
  }, [query]);
  return matches;
}
