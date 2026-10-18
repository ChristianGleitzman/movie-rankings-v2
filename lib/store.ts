"use client";
import { useSyncExternalStore } from "react";
import type { Film } from "./rank";

const KEY = "mr2:films";
const POSTERS = "mr2:posters";

let cache: Film[] | null = null;
const listeners = new Set<() => void>();

function read(): Film[] {
  if (cache === null) {
    try {
      cache = JSON.parse(localStorage.getItem(KEY) ?? "[]") as Film[];
    } catch {
      cache = [];
    }
  }
  return cache;
}

// Throws if storage is full or blocked, so callers never silently lose duel progress.
export function save(films: Film[]) {
  localStorage.setItem(KEY, JSON.stringify(films));
  cache = films;
  listeners.forEach((l) => l());
}

const subscribe = (cb: () => void) => {
  listeners.add(cb);
  return () => listeners.delete(cb);
};

/** null until loaded in the browser. */
export const useFilms = () => useSyncExternalStore(subscribe, read, () => null);

// Poster URLs are cached separately so fetching them doesn't change the films list.
export async function getPoster(film: Film): Promise<string | null> {
  let posters: Record<string, string | null> = {};
  try {
    posters = JSON.parse(localStorage.getItem(POSTERS) ?? "{}");
  } catch {}
  if (film.id in posters) return posters[film.id];
  const res = await fetch(`/api/tmdb?title=${encodeURIComponent(film.title)}&year=${film.year}`);
  if (!res.ok) return null;
  const { poster } = (await res.json()) as { poster: string | null };
  try {
    localStorage.setItem(POSTERS, JSON.stringify({ ...posters, [film.id]: poster }));
  } catch {}
  return poster;
}
