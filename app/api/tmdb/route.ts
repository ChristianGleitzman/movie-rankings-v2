// Proxies TMDB search so the token stays server-side. Returns { poster: url | null }.
export async function GET(req: Request) {
  const params = new URL(req.url).searchParams;
  const title = params.get("title")?.slice(0, 200);
  const year = params.get("year");
  const token = process.env.TMDB_TOKEN;
  if (!title) return Response.json({ error: "title required" }, { status: 400 });
  if (!token) return Response.json({ poster: null });

  const q = new URLSearchParams({ query: title });
  if (year && /^\d{4}$/.test(year)) q.set("year", year);
  const res = await fetch(`https://api.themoviedb.org/3/search/movie?${q}`, {
    headers: { Authorization: `Bearer ${token}` },
    next: { revalidate: 86400 },
  });
  if (!res.ok) return Response.json({ poster: null }, { status: 502 });
  const data = (await res.json()) as { results?: { poster_path?: string | null }[] };
  const path = data.results?.[0]?.poster_path;
  return Response.json({ poster: path ? `https://image.tmdb.org/t/p/w342${path}` : null });
}
