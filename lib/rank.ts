export type Film = {
  id: string; // `${title}|${year}`, stable across Letterboxd exports
  title: string;
  year: number;
  stars: number | null; // Letterboxd rating, 0.5–5, null if unrated
  watched: string | null; // last watch date (YYYY-MM-DD), null if unknown
  views: number; // diary entries; 0 when the film was only marked watched
  forgotten?: boolean; // "don't remember": left out of duels until restored
  legacy?: { shift: number; games: number }; // duel progress carried over from the v1 Elo model, in logits
};

/** One duel. `s` is film a's score: 1 = a won, 0.5 = too close to call. */
export type Match = { a: string; b: string; s: 1 | 0.5; t: number };

/** Public audience rating from TMDB (0.5–5 scale) plus its vote count, or null when TMDB has no match. */
export type Crowd = { poster: string | null; rating: number | null; votes: number } | null;

export type RawFilm = Omit<Film, "forgotten" | "legacy">;

// Re-importing a newer export keeps "don't remember" marks and carried-over progress. Duels live in their own log.
export function merge(old: Film[], fresh: RawFilm[]): Film[] {
  const byId = new Map(old.map((f) => [f.id, f]));
  return fresh.map((f) => {
    const prev = byId.get(f.id);
    return { ...f, ...(prev?.forgotten && { forgotten: true }), ...(prev?.legacy && { legacy: prev.legacy }) };
  });
}

export const setForgotten = (films: Film[], id: string, forgotten: boolean): Film[] =>
  films.map((f) => (f.id === id ? { ...f, forgotten: forgotten || undefined } : f));

const YEAR_MS = 365.25 * 24 * 3600 * 1000;

// How fresh a film is in memory: 1 for last week, ~0.5 after two years, a floor of 0.25 for long-ago or undated watches.
export function recency(f: Film, now = Date.now()): number {
  if (!f.watched) return 0.25;
  const years = Math.max(0, (now - Date.parse(f.watched)) / YEAR_MS);
  return 0.25 + 0.75 * Math.exp(-years / 2);
}

type LegacyFilm = Film & { elo?: number; games?: number };

// v1 stored a running Elo per film, seeded at 1500 + (stars - mean) * 200. Keep what the duels added on top of that
// seed as a logit shift, so the new model starts from the same place without the old duel log.
export function migrateLegacy(films: LegacyFilm[]): { films: Film[]; changed: boolean } {
  if (!films.some((f) => typeof f.elo === "number")) return { films, changed: false };
  const rated = films.filter((f) => f.stars !== null);
  const mean = rated.length ? rated.reduce((s, f) => s + f.stars!, 0) / rated.length : 0;
  return {
    changed: true,
    films: films.map(({ elo, games, ...f }) => {
      const seed = f.stars === null ? 1500 : 1500 + (f.stars - mean) * 200;
      const shift = ((elo ?? seed) - seed) * (Math.LN10 / 400);
      return games ? { ...f, legacy: { shift, games } } : f;
    }),
  };
}
