import { describe, expect, it } from "vitest";
import { fit, pickPair, priors, probit, rankAll, starScale, winChance } from "./model";
import type { Crowd, Film, Match } from "./rank";

const film = (i: number, stars: number | null, extra: Partial<Film> = {}): Film => ({
  id: `f${i}`, title: `Film ${i}`, year: 2000, stars, watched: null, views: 0, ...extra,
});
const films = (stars: (number | null)[]) => stars.map((s, i) => film(i, s));
const duel = (a: string, b: string, s: 1 | 0.5 = 1, t = 0): Match => ({ a, b, s, t });
const crowdOf = (ratings: number[]): Record<string, Crowd> =>
  Object.fromEntries(ratings.map((r, i) => [`f${i}`, { poster: null, rating: r, votes: 1000 }]));

// A seeded generator so the statistical tests are deterministic.
const lcg = (seed = 1) => () => ((seed = (seed * 1664525 + 1013904223) % 2 ** 32) / 2 ** 32);

describe("probit", () => {
  it("inverts the normal CDF", () => {
    expect(probit(0.5)).toBeCloseTo(0, 6);
    expect(probit(0.975)).toBeCloseTo(1.96, 2);
    expect(probit(0.01)).toBeCloseTo(-2.326, 2);
  });
});

describe("priors", () => {
  it("orders films by stars, unrated in the middle with more doubt", () => {
    const p = priors(films([5, 3, 1, null]), {});
    expect(p[0].mean).toBeGreaterThan(p[1].mean);
    expect(p[1].mean).toBeGreaterThan(p[2].mean);
    expect(p[3].sd).toBeGreaterThan(p[0].sd);
  });

  it("reads a generous rater's 5★ as 'top share' rather than 'maximum'", () => {
    const generous = priors(films([5, 5, 5, 5, 5, 5, 4.5, 4.5, 4, 3]), {});
    const strict = priors(films([5, 4, 3.5, 3.5, 3, 3, 3, 2.5, 2, 1]), {});
    expect(generous[0].mean).toBeLessThan(strict[0].mean);
  });

  it("uses the crowd to break ties within a star rating and to place unrated films", () => {
    const p = priors(films([4, 4, 4, 4, 4, 4, 4, 4, 4, 4, null]), crowdOf([4.4, 3, 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7, 3.8, 2.5]));
    expect(p[0].mean).toBeGreaterThan(p[1].mean);
    expect(p[10].mean).toBeLessThan(0);
  });
});

describe("fit", () => {
  it("with no duels, sits on the priors", () => {
    const fs = films([5, 3, 1]);
    const m = fit(fs, [], {});
    const p = priors(fs, {});
    fs.forEach((f, i) => expect(m.theta.get(f.id)).toBeCloseTo(p[i].mean, 6));
  });

  it("lets consistent duels overturn the stars, and shrinks uncertainty", () => {
    const fs = films([4, 4, 2, 3, 5]);
    const log = Array.from({ length: 8 }, (_, t) => duel("f2", "f0", 1, t));
    const m = fit(fs, log, {});
    expect(m.theta.get("f2")!).toBeGreaterThan(m.theta.get("f0")!);
    expect(m.variance.get("f2")!).toBeLessThan(m.priorVariance.get("f2")!);
    expect(m.games.get("f2")).toBe(8);
  });

  it("a draw pulls the favourite down and the underdog up", () => {
    const fs = films([5, 1, 3]);
    const before = fit(fs, [], {});
    const after = fit(fs, [duel("f0", "f1", 0.5)], {});
    expect(after.theta.get("f0")!).toBeLessThan(before.theta.get("f0")!);
    expect(after.theta.get("f1")!).toBeGreaterThan(before.theta.get("f1")!);
  });

  it("gives the same answer from a warm start", () => {
    const fs = films([5, 4, 3, 2, 1]);
    const log = [duel("f4", "f0"), duel("f3", "f1"), duel("f2", "f3", 0.5)];
    const cold = fit(fs, log, {});
    const warm = fit(fs, log, {}, new Map(fs.map((f) => [f.id, 3])));
    fs.forEach((f) => expect(warm.theta.get(f.id)).toBeCloseTo(cold.theta.get(f.id)!, 5));
  });

  it("ignores duels for films that are no longer in the export", () => {
    expect(() => fit(films([3, 4]), [duel("f0", "gone")], {})).not.toThrow();
  });
});

describe("pickPair", () => {
  it("returns two distinct films and never a forgotten one", () => {
    const fs = films([4, 3, 2, 1, 5]).map((f) => (f.id === "f2" ? { ...f, forgotten: true } : f));
    const m = fit(fs, [], {});
    const rand = lcg(7);
    for (let i = 0; i < 100; i++) {
      const [a, b] = pickPair(fs, m, { rand })!;
      expect(a.id).not.toBe(b.id);
      expect([a.id, b.id]).not.toContain("f2");
    }
    expect(pickPair([film(0, 3), film(1, 3, { forgotten: true })], m)).toBeNull();
  });

  it("prefers close, uncertain matchups over foregone conclusions", () => {
    const fs = films([5, 5, 0.5, 0.5, 3, 3]);
    const m = fit(fs, [], {});
    const rand = lcg(3);
    let lopsided = 0;
    for (let i = 0; i < 300; i++) {
      const [a, b] = pickPair(fs, m, { rand })!;
      if (Math.abs((a.stars ?? 3) - (b.stars ?? 3)) >= 4) lopsided++;
    }
    expect(lopsided / 300).toBeLessThan(0.1);
  });

  it("favours recently watched films", () => {
    const now = Date.parse("2026-01-01");
    const fs = films([3, 3, 3, 3, 3, 3]).map((f, i) => ({ ...f, watched: i === 0 ? "2025-12-20" : "2012-01-01" }));
    const m = fit(fs, [], {});
    const rand = lcg(11);
    let hits = 0;
    for (let i = 0; i < 400; i++) if (pickPair(fs, m, { rand, now })!.some((f) => f.id === "f0")) hits++;
    expect(hits / 400).toBeGreaterThan(0.5);
  });

  it("rests films that were just on screen", () => {
    const fs = films([3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3]);
    const m = fit(fs, [], {});
    const rand = lcg(5);
    let repeats = 0;
    for (let i = 0; i < 200; i++) if (pickPair(fs, m, { rand, recent: ["f0", "f1"] })!.some((f) => f.id === "f0" || f.id === "f1")) repeats++;
    expect(repeats / 200).toBeLessThan(0.1);
  });
});

describe("starScale", () => {
  const generous = films([5, 5, 5, 5, 4.5, 4.5, 4.5, 4, 4, 4, 4, 3.5, 3.5, 3, 3, 3, 2.5, 2, 5, 4, 4.5, 3.5]);
  const crowd = crowdOf([4.2, 4.1, 3.9, 3.8, 3.8, 3.7, 3.6, 3.6, 3.5, 3.5, 3.4, 3.4, 3.3, 3.2, 3.2, 3.1, 3, 2.8, 4, 3.6, 3.7, 3.3]);
  const count5 = (scale: (p: number) => number) => generous.filter((_, i) => scale((i + 0.5) / generous.length) === 5).length;

  it("habits reproduces your own histogram", () => {
    const { scale } = starScale(generous, {}, "habits");
    const out = generous.map((_, i) => scale((i + 0.5) / generous.length)).sort((a, b) => b - a);
    expect(out).toEqual(generous.map((f) => f.stars).sort((a, b) => b! - a!));
  });

  it("balanced hands out fewer 5★ than a generous rater, but still some", () => {
    const habits = count5(starScale(generous, crowd, "habits").scale);
    const balanced = count5(starScale(generous, crowd, "balanced").scale);
    expect(balanced).toBeLessThan(habits);
    expect(balanced).toBeGreaterThan(0);
  });

  it("falls back to your habits without enough crowd data", () => {
    const { scale, available } = starScale(generous, {}, "balanced");
    expect(available).toBe(false);
    expect(scale(0)).toBe(5);
  });
});

describe("rankAll", () => {
  it("ranks by the fit, with honest ranges and stars", () => {
    const fs = films([5, 4, 3, 2, 1]);
    const ranked = rankAll(fs, fit(fs, [], {}), {}, "habits");
    expect(ranked.map((r) => r.film.id)).toEqual(["f0", "f1", "f2", "f3", "f4"]);
    ranked.forEach((r) => {
      expect(r.range[0]).toBeLessThanOrEqual(r.rank);
      expect(r.range[1]).toBeGreaterThanOrEqual(r.rank);
    });
    expect(ranked.map((r) => r.says)).toEqual([5, 4, 3, 2, 1]);
  });

  it("flags films you rank far from the crowd", () => {
    const fs = films(Array.from({ length: 24 }, (_, i) => 5 - (i % 10) * 0.5));
    const ratings = fs.map((_, i) => 4.5 - i * 0.1);
    ratings[0] = 2; // you love it, the crowd doesn't
    const ranked = rankAll(fs, fit(fs, [], crowdOf(ratings)), crowdOf(ratings), "habits");
    const top = ranked.find((r) => r.film.id === "f0")!;
    expect(top.against!).toBeGreaterThan(0.3);
  });
});

it("winChance is symmetric", () => {
  const fs = films([5, 2]);
  const m = fit(fs, [], {});
  expect(winChance(m, "f0", "f1") + winChance(m, "f1", "f0")).toBeCloseTo(1);
  expect(winChance(m, "f0", "f1")).toBeGreaterThan(0.5);
});
