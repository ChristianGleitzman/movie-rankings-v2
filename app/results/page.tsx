"use client";
import Link from "next/link";
import { useState } from "react";
import { eloToStars } from "@/lib/rank";
import { useFilms } from "@/lib/store";

const fmt = (s: number | null) => (s === null ? "—" : "★".repeat(Math.floor(s)) + (s % 1 ? "½" : ""));

const FILTERS = {
  all: "All",
  over: "You rated higher than you rank",
  under: "You rated lower than you rank",
  predicted: "Unrated (predicted)",
} as const;
type Filter = keyof typeof FILTERS;

export default function Results() {
  const films = useFilms();
  const [filter, setFilter] = useState<Filter>("all");
  const [byDelta, setByDelta] = useState(false);

  if (!films) return null;
  if (!films.length) return <p>No films yet. <Link href="/">Import →</Link></p>;

  const predicted = eloToStars(films);
  const rows = [...films]
    .sort((a, b) => b.elo - a.elo)
    .map((f, i) => {
      const fromElo = predicted.get(f.id)!;
      return { ...f, rank: i + 1, fromElo, delta: f.stars === null ? null : fromElo - f.stars };
    })
    .filter((r) =>
      filter === "over" ? r.delta !== null && r.delta <= -1
      : filter === "under" ? r.delta !== null && r.delta >= 1
      : filter === "predicted" ? r.stars === null
      : true,
    );
  if (byDelta) rows.sort((a, b) => Math.abs(b.delta ?? 0) - Math.abs(a.delta ?? 0));

  return (
    <>
      <h1>Your ranking</h1>
      <div className="chips">
        {(Object.keys(FILTERS) as Filter[]).map((k) => (
          <button key={k} aria-pressed={filter === k} onClick={() => setFilter(k)}>
            {FILTERS[k]}
          </button>
        ))}
      </div>
      <div className="scroll">
        <table>
          <thead>
            <tr>
              <th><button onClick={() => setByDelta(false)}>#</button></th>
              <th>Film</th>
              <th>Elo</th>
              <th>Your ★</th>
              <th>★ from rank</th>
              <th><button onClick={() => setByDelta(true)}>Δ</button></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <td>{r.rank}</td>
                <td>{r.title} <span className="muted">{r.year || ""}</span></td>
                <td>{Math.round(r.elo)}</td>
                <td>{fmt(r.stars)}</td>
                <td>{fmt(r.fromElo)}</td>
                <td className={r.delta ? (r.delta > 0 ? "up" : "down") : ""}>
                  {r.delta ? (r.delta > 0 ? "+" : "") + r.delta : ""}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="muted">
        “★ from rank” gives out stars in Elo order, matching how often you use each rating. Do more duels for sharper results.
      </p>
    </>
  );
}
