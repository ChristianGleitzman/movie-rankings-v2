import { describe, expect, it } from "vitest";
import { merge, migrateLegacy, recency, setForgotten, type Film } from "./rank";

const film = (i: number, stars: number | null, extra: Partial<Film> = {}): Film => ({
  id: `f${i}`, title: `Film ${i}`, year: 2000, stars, watched: null, views: 0, ...extra,
});

describe("rank", () => {
  it("recency decays with age and floors for undated films", () => {
    const now = Date.parse("2026-01-01");
    expect(recency(film(0, 3, { watched: "2025-12-31" }), now)).toBeCloseTo(1, 1);
    expect(recency(film(0, 3, { watched: "2016-01-01" }), now)).toBeLessThan(0.3);
    expect(recency(film(0, 3), now)).toBe(0.25);
  });

  it("merge keeps don't-remember marks and carried-over progress", () => {
    const old = [film(0, 4, { forgotten: true }), film(1, 2, { legacy: { shift: 0.4, games: 3 } })];
    const merged = merge(old, [film(0, 4), film(1, 2), film(2, 3)]);
    expect(merged[0].forgotten).toBe(true);
    expect(merged[1].legacy).toEqual({ shift: 0.4, games: 3 });
    expect(merged[2]).toEqual(film(2, 3));
  });

  it("setForgotten toggles one film", () => {
    const films = setForgotten([film(0, 4), film(1, 3)], "f1", true);
    expect(films.map((f) => !!f.forgotten)).toEqual([false, true]);
    expect(setForgotten(films, "f1", false)[1].forgotten).toBeUndefined();
  });

  it("migrates v1 Elo into a logit shift on top of the old star seed", () => {
    // mean of rated stars = 3, so the old seeds were 1700 / 1300 / 1500.
    const v1 = [
      { ...film(0, 4), elo: 1700 + 400 / Math.LN10, games: 6 },
      { ...film(1, 2), elo: 1300, games: 0 },
      { ...film(2, null), elo: 1500, games: 0 },
    ];
    const { films, changed } = migrateLegacy(v1);
    expect(changed).toBe(true);
    expect(films[0].legacy!.shift).toBeCloseTo(1);
    expect(films[0].legacy!.games).toBe(6);
    expect(films[1].legacy).toBeUndefined();
    expect(films.every((f) => !("elo" in f))).toBe(true);
    expect(migrateLegacy(films).changed).toBe(false);
  });
});
