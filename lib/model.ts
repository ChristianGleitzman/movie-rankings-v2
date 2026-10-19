// Ranking model: Bradley–Terry with a Gaussian prior per film, fitted by MAP from the full duel log.
//
//   P(a beats b) = σ(θa − θb),   θi ~ N(mi, si²)
//
// The prior mean mi comes from where the film's star rating sits within *your own* ratings (a probit of its
// mid-quantile), so a generous rater's 5★ means "top x%" rather than "maximum". Crowd ratings from TMDB nudge ties
// within a star rating, and stand in for missing ratings. Duels then move each film away from its prior, and the
// posterior curvature gives each film an uncertainty, which drives both the matchmaking and the rank ranges.
import { recency, type Crowd, type Film, type Match } from "./rank";

export type Calibration = "habits" | "balanced" | "crowd";

export type Model = {
  theta: Map<string, number>;
  variance: Map<string, number>;
  priorVariance: Map<string, number>;
  games: Map<string, number>;
};

export type Ranked = {
  film: Film;
  rank: number;
  /** Likely rank range (about 68%), from the film's uncertainty. */
  range: [number, number];
  settled: boolean;
  theta: number;
  games: number;
  /** Stars your ranking gives this film under the chosen calibration. */
  says: number;
  /** Trusted public rating on the 0.5–5 scale, null when unknown. */
  crowd: number | null;
  /** How much higher you rank it than the crowd does, in percentile points among films with a crowd rating. */
  against: number | null;
};

const RATED_SD = 0.55; // how far duels can comfortably move a rated film
const UNRATED_SD = 1.0;
const CROWD_ONLY_SD = 0.85;
const CROWD_WEIGHT_RATED = 0.15; // breaks ties within a star rating
const CROWD_WEIGHT_UNRATED = 0.6; // your taste correlates with, but isn't, the crowd's
const MIN_VOTES = 25;
const RANGE_Z = 1;
export const HOT_TAKE = 0.3;

export const sigmoid = (x: number) => 1 / (1 + Math.exp(-x));
export const crowdRating = (c: Crowd | undefined) =>
  c && c.rating !== null && c.votes >= MIN_VOTES ? c.rating : null;

// Inverse standard normal CDF (Acklam's rational approximation, |error| < 1.2e-9).
export function probit(p: number): number {
  const a = [-39.69683028665376, 220.9460984245205, -275.9285104469687, 138.357751867269, -30.66479806614716, 2.506628277459239];
  const b = [-54.47609879822406, 161.5858368580409, -155.6989798598866, 66.80131188771972, -13.28068155288572];
  const c = [-0.007784894002430293, -0.3223964580411365, -2.400758277161838, -2.549732539343734, 4.374664141464968, 2.938163982698783];
  const d = [0.007784695709041462, 0.3224671290700398, 2.445134137142996, 3.754408661907416];
  const q = Math.min(1 - 1e-9, Math.max(1e-9, p));
  if (q < 0.02425) {
    const r = Math.sqrt(-2 * Math.log(q));
    return (((((c[0] * r + c[1]) * r + c[2]) * r + c[3]) * r + c[4]) * r + c[5]) / ((((d[0] * r + d[1]) * r + d[2]) * r + d[3]) * r + 1);
  }
  if (q > 1 - 0.02425) return -probit(1 - q);
  const r = q - 0.5;
  const s = r * r;
  return ((((((a[0] * s + a[1]) * s + a[2]) * s + a[3]) * s + a[4]) * s + a[5]) * r) / (((((b[0] * s + b[1]) * s + b[2]) * s + b[3]) * s + b[4]) * s + 1);
}

/** Share of the sample below v plus half the share equal to it. Ties get the middle of their band. */
function midQuantile(sample: number[]): (v: number) => number {
  const sorted = [...sample].sort((x, y) => x - y);
  const count = (v: number, orEqual: boolean) => {
    let lo = 0, hi = sorted.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (sorted[mid] < v || (orEqual && sorted[mid] === v)) lo = mid + 1;
      else hi = mid;
    }
    return lo;
  };
  return (v) => (count(v, false) + count(v, true)) / 2 / sorted.length;
}

export function priors(films: Film[], crowd: Record<string, Crowd>) {
  const rated = films.flatMap((f) => (f.stars === null ? [] : [f.stars]));
  const crowdVals = films.flatMap((f) => {
    const c = crowdRating(crowd[f.id]);
    return c === null ? [] : [c];
  });
  const userQ = rated.length ? midQuantile(rated) : null;
  const crowdQ = crowdVals.length >= 10 ? midQuantile(crowdVals) : null;
  return films.map((f) => {
    const zu = f.stars !== null && userQ ? probit(userQ(f.stars)) : null;
    const c = crowdRating(crowd[f.id]);
    const zc = c !== null && crowdQ ? probit(crowdQ(c)) : null;
    let mean: number, sd: number;
    if (zu !== null) [mean, sd] = [zc === null ? zu : (1 - CROWD_WEIGHT_RATED) * zu + CROWD_WEIGHT_RATED * zc, RATED_SD];
    else if (zc !== null) [mean, sd] = [CROWD_WEIGHT_UNRATED * zc, CROWD_ONLY_SD];
    else [mean, sd] = [0, UNRATED_SD];
    if (f.legacy) [mean, sd] = [mean + f.legacy.shift, sd / Math.sqrt(1 + f.legacy.games / 2)];
    return { mean, sd };
  });
}

/** MAP fit by Gauss–Seidel Newton steps; the objective is strictly concave, so this converges from any start. */
export function fit(films: Film[], matches: Match[], crowd: Record<string, Crowd>, warm?: Map<string, number>): Model {
  const idx = new Map(films.map((f, i) => [f.id, i]));
  const pr = priors(films, crowd);
  const n = films.length;
  const theta = Float64Array.from(films, (f, i) => warm?.get(f.id) ?? pr[i].mean);
  const prec = Float64Array.from(pr, (p) => 1 / (p.sd * p.sd));
  const adj: [number, number][][] = Array.from({ length: n }, () => []);
  for (const m of matches) {
    const i = idx.get(m.a), j = idx.get(m.b);
    if (i === undefined || j === undefined || i === j) continue;
    adj[i].push([j, m.s]);
    adj[j].push([i, 1 - m.s]);
  }
  const active = adj.flatMap((a, i) => (a.length ? [i] : []));
  for (let sweep = 0; sweep < 200; sweep++) {
    let moved = 0;
    for (const i of active) {
      let g = (pr[i].mean - theta[i]) * prec[i], h = prec[i];
      for (const [j, y] of adj[i]) {
        const p = sigmoid(theta[i] - theta[j]);
        g += y - p;
        h += p * (1 - p);
      }
      const step = Math.max(-1, Math.min(1, g / h));
      theta[i] += step;
      moved = Math.max(moved, Math.abs(step));
    }
    if (moved < 1e-6) break;
  }
  const model: Model = { theta: new Map(), variance: new Map(), priorVariance: new Map(), games: new Map() };
  films.forEach((f, i) => {
    let info = prec[i];
    for (const [j] of adj[i]) {
      const p = sigmoid(theta[i] - theta[j]);
      info += p * (1 - p);
    }
    model.theta.set(f.id, theta[i]);
    model.variance.set(f.id, 1 / info);
    model.priorVariance.set(f.id, 1 / prec[i]);
    model.games.set(f.id, adj[i].length + (f.legacy?.games ?? 0));
  });
  return model;
}

export const winChance = (model: Model, a: string, b: string) => sigmoid((model.theta.get(a) ?? 0) - (model.theta.get(b) ?? 0));

const pairKey = (a: string, b: string) => (a < b ? `${a}\n${b}` : `${b}\n${a}`);

function weighted<T>(items: T[], weight: (x: T) => number, rand: () => number): T {
  const ws = items.map(weight);
  let r = rand() * ws.reduce((s, w) => s + w, 0);
  for (let i = 0; i < items.length; i++) if ((r -= ws[i]) <= 0) return items[i];
  return items[items.length - 1];
}

export type PickOptions = { rand?: () => number; now?: number; recent?: string[]; matches?: Match[] };

// Active learning: A is drawn by uncertainty × memory freshness; B is the opponent that would teach the model the most
// about A, i.e. maximal p(1−p)·(σa² + σb²), again weighted by freshness. Films seen in the last few duels sit out,
// and pairs already decided recently are heavily discounted so the same matchup doesn't keep coming back.
export function pickPair(films: Film[], model: Model, opts: PickOptions = {}): [Film, Film] | null {
  const { rand = Math.random, now = Date.now(), recent = [], matches = [] } = opts;
  const pool = films.filter((f) => !f.forgotten);
  if (pool.length < 2) return null;
  const cool = new Set(recent.slice(-6));
  const seen = new Set(matches.slice(-200).map((m) => pairKey(m.a, m.b)));
  const v = (f: Film) => model.variance.get(f.id) ?? 1;
  const th = (f: Film) => model.theta.get(f.id) ?? 0;
  const rest = (f: Film) => (cool.has(f.id) && pool.length > 8 ? 0.03 : 1);

  const a = weighted(pool, (f) => recency(f, now) * v(f) * rest(f), rand);
  const scored = pool
    .filter((f) => f.id !== a.id)
    .map((f) => {
      const p = sigmoid(th(a) - th(f));
      const score = p * (1 - p) * (v(a) + v(f)) * Math.sqrt(recency(f, now)) * rest(f) * (seen.has(pairKey(a.id, f.id)) ? 0.1 : 1);
      return { f, score };
    })
    .sort((x, y) => y.score - x.score)
    .slice(0, 10);
  // Squared so a clearly better matchup wins most of the time, while near-equals still share the draws.
  const b = weighted(scored, (s) => s.score * s.score, rand).f;
  return rand() < 0.5 ? [a, b] : [b, a];
}

const roundHalf = (x: number) => Math.min(5, Math.max(0.5, Math.round(x * 2) / 2));
const FALLBACK = [5, 4.5, 4, 3.5, 3, 2.5, 2, 1.5, 1, 0.5];
const quantileDesc = (sortedDesc: number[], p: number) => sortedDesc[Math.min(sortedDesc.length - 1, Math.floor(p * sortedDesc.length))];

/**
 * Turns a position in the ranking (0 = top) into stars.
 * - habits: hand out each rating as often as you do.
 * - crowd: as the crowd rates the films you've watched, stretched to an individual's spread (crowd averages bunch up).
 * - balanced: halfway between the two, which keeps your generosity in check without assuming you watch bad films.
 */
export function starScale(films: Film[], crowd: Record<string, Crowd>, mode: Calibration) {
  const mine = films.flatMap((f) => (f.stars === null ? [] : [f.stars])).sort((x, y) => y - x);
  const user = mine.length ? mine : FALLBACK;
  const crowdVals = films.flatMap((f) => {
    const c = crowdRating(crowd[f.id]);
    return c === null ? [] : [c];
  });
  const available = crowdVals.length >= 20;
  if (mode === "habits" || !available) return { scale: (p: number) => quantileDesc(user, p), available };

  const mean = (xs: number[]) => xs.reduce((s, x) => s + x, 0) / xs.length;
  const sd = (xs: number[], m: number) => Math.sqrt(mean(xs.map((x) => (x - m) ** 2))) || 1;
  const mc = mean(crowdVals);
  const spread = Math.max(0.75, sd(user, mean(user))) / sd(crowdVals, mc);
  const stretched = crowdVals.map((x) => Math.min(5, Math.max(0.5, mc + (x - mc) * spread))).sort((x, y) => y - x);
  return {
    available,
    scale: (p: number) =>
      mode === "crowd" ? roundHalf(quantileDesc(stretched, p)) : roundHalf((quantileDesc(user, p) + quantileDesc(stretched, p)) / 2),
  };
}

export function rankAll(films: Film[], model: Model, crowd: Record<string, Crowd>, mode: Calibration): Ranked[] {
  const th = (f: Film) => model.theta.get(f.id) ?? 0;
  const sorted = [...films].sort((x, y) => th(y) - th(x));
  const desc = sorted.map(th);
  const n = sorted.length;
  // Count of films strictly above x, on the descending theta list.
  const above = (x: number) => {
    let lo = 0, hi = n;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (desc[mid] > x) lo = mid + 1;
      else hi = mid;
    }
    return lo;
  };
  const { scale } = starScale(films, crowd, mode);

  // "Against the crowd": your position vs the crowd's, among films that have a trusted crowd rating.
  const withCrowd = sorted.filter((f) => crowdRating(crowd[f.id]) !== null);
  const crowdQ = withCrowd.length >= 20 ? midQuantile(withCrowd.map((f) => crowdRating(crowd[f.id])!)) : null;
  const yourPos = new Map(withCrowd.map((f, i) => [f.id, (i + 0.5) / withCrowd.length]));

  return sorted.map((f, i) => {
    const sd = Math.sqrt(model.variance.get(f.id) ?? 1);
    const best = above(desc[i] + RANGE_Z * sd) + 1;
    const worst = Math.max(i + 1, above(desc[i] - RANGE_Z * sd));
    const c = crowdRating(crowd[f.id]);
    const crowdPos = c !== null && crowdQ ? 1 - crowdQ(c) : null;
    return {
      film: f,
      rank: i + 1,
      range: [Math.min(best, i + 1), worst],
      settled: worst - best + 1 <= Math.max(4, Math.round(n * 0.12)),
      theta: desc[i],
      games: model.games.get(f.id) ?? 0,
      says: scale((i + 0.5) / n),
      crowd: c,
      against: crowdPos === null ? null : crowdPos - yourPos.get(f.id)!,
    };
  });
}
