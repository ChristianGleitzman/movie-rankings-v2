"use client";
import { useSyncExternalStore } from "react";
import { fit, type Model } from "./model";
import { migrateLegacy, type Crowd, type Film, type Match } from "./rank";

// Everything lives in this browser's localStorage, under three keys:
//   films   the catalogue from the Letterboxd export (+ "don't remember" marks)
//   matches the duel log; ratings are always recomputed from it, so undo is just dropping the last entry
//   crowd   TMDB poster + audience rating per film, fetched in the background
function createStore<T>(key: string, fallback: T, migrate?: (raw: T) => { value: T; changed: boolean }) {
  let cache: T | null = null;
  let pending: ReturnType<typeof setTimeout> | undefined;
  const listeners = new Set<() => void>();
  const emit = () => listeners.forEach((l) => l());
  const read = (): T => {
    if (cache === null) {
      try {
        const raw = localStorage.getItem(key);
        cache = raw ? (JSON.parse(raw) as T) : fallback;
      } catch {
        cache = fallback;
      }
      if (migrate) {
        const { value, changed } = migrate(cache);
        cache = value;
        if (changed)
          try {
            localStorage.setItem(key, JSON.stringify(value));
          } catch {}
      }
    }
    return cache;
  };
  const subscribe = (cb: () => void) => {
    listeners.add(cb);
    return () => listeners.delete(cb);
  };
  return {
    get: read,
    /** Throws if storage is full or blocked, so callers never silently lose progress. */
    set(value: T) {
      localStorage.setItem(key, JSON.stringify(value));
      cache = value;
      emit();
    },
    /** Updates now, persists shortly after; for frequent, re-fetchable data. */
    setSoon(value: T) {
      cache = value;
      emit();
      clearTimeout(pending);
      pending = setTimeout(() => {
        try {
          localStorage.setItem(key, JSON.stringify(cache));
        } catch {}
      }, 400);
    },
    clear() {
      localStorage.removeItem(key);
      cache = fallback;
      emit();
    },
    subscribe,
    use: () => useSyncExternalStore(subscribe, read, () => null),
  };
}

const filmsStore = createStore<Film[]>("mr2:films", [], (raw) => {
  const { films, changed } = migrateLegacy(raw);
  return { value: films, changed };
});
const matchesStore = createStore<Match[]>("mr2:matches", []);
const crowdStore = createStore<Record<string, Crowd>>("mr2:crowd", {});

/** null until loaded in the browser. */
export const useFilms = filmsStore.use;
export const useMatches = matchesStore.use;
export const useCrowd = crowdStore.use;

/** Writes films and the duel log together, rolling back both if either write fails. */
export function commit(next: { films?: Film[]; matches?: Match[] }) {
  const prev = { films: filmsStore.get(), matches: matchesStore.get() };
  try {
    if (next.matches) matchesStore.set(next.matches);
    if (next.films) filmsStore.set(next.films);
  } catch (err) {
    try {
      matchesStore.set(prev.matches);
      filmsStore.set(prev.films);
    } catch {}
    throw err;
  }
}

/** Removes every film, duel and cached TMDB result from this browser. */
export function clearAll() {
  filmsStore.clear();
  matchesStore.clear();
  crowdStore.clear();
  localStorage.removeItem("mr2:posters"); // v1 poster cache
  enrich.set({ status: "idle", done: 0, total: 0 });
}

// The fit is a pure function of (films, duels, crowd); memoise on identity and warm-start from the last solution.
export type Bundle = { films: Film[]; matches: Match[]; crowd: Record<string, Crowd>; model: Model };
let last: Bundle | null = null;
function bundle(films: Film[], matches: Match[], crowd: Record<string, Crowd>): Bundle {
  if (last && last.films === films && last.matches === matches && last.crowd === crowd) return last;
  last = { films, matches, crowd, model: fit(films, matches, crowd, last?.model.theta) };
  return last;
}
export const getModel = (films: Film[], matches: Match[], crowd: Record<string, Crowd>) => bundle(films, matches, crowd).model;

/** Films, duels, crowd data and the fitted model, as one referentially stable value. null until loaded. */
export function useModel(): Bundle | null {
  const films = useFilms();
  const matches = useMatches();
  const crowd = useCrowd();
  return films && matches && crowd ? bundle(films, matches, crowd) : null;
}

// ---- TMDB enrichment ------------------------------------------------------------------------------------------

export type EnrichState = { status: "idle" | "running" | "done" | "disabled" | "error"; done: number; total: number };
const enrich = (() => {
  let state: EnrichState = { status: "idle", done: 0, total: 0 };
  const listeners = new Set<() => void>();
  return {
    get: () => state,
    set(next: EnrichState) {
      state = next;
      listeners.forEach((l) => l());
    },
    subscribe(cb: () => void) {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
  };
})();
export const useEnrich = () => useSyncExternalStore(enrich.subscribe, enrich.get, enrich.get);

const BATCH = 25;
const inflight = new Set<string>();

async function request(films: Film[]): Promise<"ok" | "disabled"> {
  films.forEach((f) => inflight.add(f.id));
  try {
    const res = await fetch("/api/tmdb", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ items: films.map(({ id, title, year }) => ({ id, title, year })) }),
    });
    if (!res.ok) throw new Error(`TMDB proxy ${res.status}`);
    const data = (await res.json()) as { enabled: boolean; results: Record<string, Crowd> };
    if (!data.enabled) return "disabled";
    crowdStore.setSoon({ ...crowdStore.get(), ...data.results });
    return "ok";
  } finally {
    films.forEach((f) => inflight.delete(f.id));
  }
}

/** Looks up one film right away (posters on screen); no-op if known or already on its way. */
export function ensureCrowd(film: Film) {
  if (crowdStore.get()[film.id] !== undefined || inflight.has(film.id) || enrich.get().status === "disabled") return;
  request([film]).then(
    (r) => r === "disabled" && enrich.set({ ...enrich.get(), status: "disabled" }),
    () => {},
  );
}

/** Warms the browser cache so a poster is ready before its duel. */
export function prefetchPoster(film: Film) {
  const known = crowdStore.get()[film.id];
  if (known === undefined) ensureCrowd(film);
  else if (known?.poster) new Image().src = known.poster;
}

/** Fetches crowd data for every film that doesn't have it yet, in the background. One run at a time. */
export async function enrichAll() {
  const { status } = enrich.get();
  if (status === "running" || status === "disabled") return;
  const crowd = crowdStore.get();
  const todo = filmsStore.get().filter((f) => crowd[f.id] === undefined && !inflight.has(f.id));
  if (!todo.length) return enrich.set({ status: "done", done: 0, total: 0 });
  enrich.set({ status: "running", done: 0, total: todo.length });
  try {
    for (let i = 0; i < todo.length; i += BATCH) {
      if ((await request(todo.slice(i, i + BATCH))) === "disabled") return enrich.set({ status: "disabled", done: 0, total: 0 });
      enrich.set({ status: "running", done: Math.min(todo.length, i + BATCH), total: todo.length });
    }
    enrich.set({ status: "done", done: todo.length, total: todo.length });
  } catch {
    enrich.set({ ...enrich.get(), status: "error" });
  }
}
