// Proxies TMDB search so the token stays server-side.
// POST { items: [{ id, title, year }] } (up to 25) → { enabled, results: { [id]: { poster, rating, votes } | null } }.
// rating is TMDB's audience average on Letterboxd's 0.5–5 scale. Items that failed transiently are left out so the
// client can retry them; null means TMDB has no match.
type Item = { id: string; title: string; year: number };
type Hit = { poster_path?: string | null; vote_average?: number; vote_count?: number };

const MAX_ITEMS = 25;
const CONCURRENCY = 5;
const IMG = "https://image.tmdb.org/t/p/w342";

async function search(token: string, title: string, year?: number): Promise<Hit[]> {
  const q = new URLSearchParams({ query: title, include_adult: "false" });
  if (year) q.set("year", String(year));
  const res = await fetch(`https://api.themoviedb.org/3/search/movie?${q}`, {
    headers: { Authorization: `Bearer ${token}` },
    next: { revalidate: 86400 },
  });
  if (!res.ok) throw new Error(`TMDB ${res.status}`);
  return ((await res.json()) as { results?: Hit[] }).results ?? [];
}

async function lookup(token: string, { title, year }: Item) {
  let results = await search(token, title, year || undefined);
  if (!results.length && year) results = await search(token, title); // year mismatches between Letterboxd and TMDB
  const hit = results[0];
  if (!hit) return null;
  const votes = hit.vote_count ?? 0;
  return {
    poster: hit.poster_path ? `${IMG}${hit.poster_path}` : null,
    rating: votes && hit.vote_average ? Math.round(hit.vote_average * 5) / 10 : null,
    votes,
  };
}

const valid = (x: unknown): x is Item =>
  !!x &&
  typeof (x as Item).id === "string" &&
  typeof (x as Item).title === "string" &&
  (x as Item).title.length > 0 &&
  (x as Item).title.length <= 200 &&
  Number.isInteger((x as Item).year);

export async function POST(req: Request) {
  const token = process.env.TMDB_TOKEN;
  if (!token) return Response.json({ enabled: false, results: {} });
  const body = (await req.json().catch(() => null)) as { items?: unknown } | null;
  const items = Array.isArray(body?.items) ? body.items.filter(valid).slice(0, MAX_ITEMS) : [];
  if (!items.length) return Response.json({ error: "items required" }, { status: 400 });

  const results: Record<string, Awaited<ReturnType<typeof lookup>>> = {};
  let next = 0;
  await Promise.all(
    Array.from({ length: CONCURRENCY }, async () => {
      while (next < items.length) {
        const item = items[next++];
        try {
          results[item.id] = await lookup(token, item);
        } catch {
          // transient: omitted so the client retries later
        }
      }
    }),
  );
  return Response.json({ enabled: true, results });
}
