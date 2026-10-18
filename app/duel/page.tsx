"use client";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { pickPair, update, type Film } from "@/lib/rank";
import { getPoster, save, useFilms } from "@/lib/store";

function Poster({ film }: { film: Film }) {
  const [src, setSrc] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    getPoster(film).then((p) => live && setSrc(p), () => {});
    return () => {
      live = false;
      setSrc(null);
    };
  }, [film]);
  // eslint-disable-next-line @next/next/no-img-element -- TMDB serves sized posters; no optimizer needed
  return src ? <img src={src} alt="" /> : <div className="blank" />;
}

export default function Duel() {
  const films = useFilms();
  const [skips, setSkips] = useState(0);
  // A new pair after every vote (films changes) or skip.
  const pair = useMemo(() => (films && films.length >= 2 ? pickPair(films) : null), [films, skips]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!pair || !films) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft") save(update(films, pair[0].id, pair[1].id));
      if (e.key === "ArrowRight") save(update(films, pair[1].id, pair[0].id));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [pair, films]);

  if (!films) return null;
  if (!pair) return <p>Import at least two films first. <Link href="/">Import →</Link></p>;

  const played = films.reduce((s, f) => s + f.games, 0) / 2;
  return (
    <>
      <h1>Which do you prefer?</h1>
      <p className="muted">Click a film or use ← / →. {played} duels so far.</p>
      <div className="duel">
        {pair.map((f, i) => (
          <button key={f.id} className="card" onClick={() => save(update(films, f.id, pair[1 - i].id))}>
            <Poster film={f} />
            <strong>{f.title}</strong>
            <span className="muted">{f.year || "—"}</span>
          </button>
        ))}
      </div>
      <div>
        <button onClick={() => setSkips((n) => n + 1)}>Skip</button>
      </div>
    </>
  );
}
