export type Film = {
  id: string; // `${title}|${year}`, stable across Letterboxd exports
  title: string;
  year: number;
  stars: number | null; // Letterboxd rating, 0.5–5, null if unrated
  elo: number;
  games: number;
};

const BASE = 1500;
const ELO_PER_STAR = 200;

export function seed(films: Omit<Film, "elo" | "games">[]): Film[] {
  const rated = films.filter((f) => f.stars !== null);
  const mean = rated.length ? rated.reduce((s, f) => s + f.stars!, 0) / rated.length : 0;
  return films.map((f) => ({
    ...f,
    elo: f.stars === null ? BASE : BASE + (f.stars - mean) * ELO_PER_STAR,
    games: 0,
  }));
}

// Re-importing a newer export keeps duel progress for films already ranked.
export function merge(old: Film[], fresh: Film[]): Film[] {
  const byId = new Map(old.map((f) => [f.id, f]));
  return fresh.map((f) => {
    const prev = byId.get(f.id);
    return prev && prev.games > 0 ? { ...f, elo: prev.elo, games: prev.games } : f;
  });
}

export const expected = (a: number, b: number) => 1 / (1 + Math.pow(10, (b - a) / 400));

// 64 for a new film, decaying to 16 as it settles.
export const kFactor = (games: number) => Math.max(16, 64 / (1 + games / 10));

export function update(films: Film[], winnerId: string, loserId: string): Film[] {
  const w = films.find((f) => f.id === winnerId)!;
  const l = films.find((f) => f.id === loserId)!;
  const delta = kFactor((w.games + l.games) / 2) * (1 - expected(w.elo, l.elo));
  return films.map((f) =>
    f.id === winnerId ? { ...f, elo: f.elo + delta, games: f.games + 1 }
    : f.id === loserId ? { ...f, elo: f.elo - delta, games: f.games + 1 }
    : f,
  );
}

// A = least-compared film, B = a random one of its nearest neighbours by Elo.
export function pickPair(films: Film[], rand = Math.random): [Film, Film] {
  const minGames = Math.min(...films.map((f) => f.games));
  const fresh = films.filter((f) => f.games === minGames);
  const a = fresh[Math.floor(rand() * fresh.length)];
  const near = films
    .filter((f) => f.id !== a.id)
    .sort((x, y) => Math.abs(x.elo - a.elo) - Math.abs(y.elo - a.elo))
    .slice(0, 10);
  const b = near[Math.floor(rand() * near.length)];
  return rand() < 0.5 ? [a, b] : [b, a];
}

// Quantile mapping: hand out stars by Elo order so the counts match the user's own star histogram.
export function eloToStars(films: Film[]): Map<string, number> {
  let pool = films.map((f) => f.stars).filter((s): s is number => s !== null);
  if (!pool.length) pool = [0.5, 1, 1.5, 2, 2.5, 3, 3.5, 4, 4.5, 5];
  pool.sort((a, b) => b - a);
  const ranked = [...films].sort((a, b) => b.elo - a.elo);
  return new Map(ranked.map((f, i) => [f.id, pool[Math.floor((i / ranked.length) * pool.length)]]));
}
