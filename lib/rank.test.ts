import { describe, expect, it } from "vitest";
import { eloToStars, expected, merge, pickPair, seed, update } from "./rank";

const raw = (stars: (number | null)[]) =>
  stars.map((s, i) => ({ id: `f${i}`, title: `Film ${i}`, year: 2000, stars: s }));

describe("rank", () => {
  it("expected score is symmetric", () => {
    expect(expected(1600, 1400) + expected(1400, 1600)).toBeCloseTo(1);
    expect(expected(1500, 1500)).toBe(0.5);
  });

  it("update conserves points and counts games", () => {
    const films = seed(raw([4, 2, 3]));
    const after = update(films, "f1", "f0");
    const sum = (fs: typeof films) => fs.reduce((s, f) => s + f.elo, 0);
    expect(sum(after)).toBeCloseTo(sum(films));
    expect(after[1].elo).toBeGreaterThan(films[1].elo);
    expect(after.map((f) => f.games)).toEqual([1, 1, 0]);
  });

  it("seeds higher stars with higher elo, unrated at 1500", () => {
    const [a, b, c] = seed(raw([5, 1, null]));
    expect(a.elo).toBeGreaterThan(b.elo);
    expect(c.elo).toBe(1500);
  });

  it("eloToStars reproduces the star histogram when elo order matches stars", () => {
    const stars = [5, 4.5, 4.5, 4, 3, 3, 3, 2, 0.5];
    const mapped = eloToStars(seed(raw(stars)));
    expect([...mapped.values()]).toEqual(stars);
  });

  it("predicts stars for unrated films", () => {
    const films = seed(raw([5, 3, 1, null]));
    films[3].elo = 9999;
    expect(eloToStars(films).get("f3")).toBe(5);
  });

  it("merge keeps duel progress for existing films", () => {
    const old = update(seed(raw([4, 2])), "f1", "f0");
    const fresh = seed(raw([4, 2, 3]));
    const merged = merge(old, fresh);
    expect(merged[1].elo).toBe(old[1].elo);
    expect(merged[2]).toEqual(fresh[2]);
  });

  it("pickPair returns two distinct films, starting with an unplayed one", () => {
    const films = update(seed(raw([4, 3, 2, 1])), "f0", "f1");
    for (let i = 0; i < 20; i++) {
      const [a, b] = pickPair(films);
      expect(a.id).not.toBe(b.id);
      expect([a, b].some((f) => f.games === 0)).toBe(true);
    }
  });
});
