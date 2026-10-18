"use client";
import Link from "next/link";
import { useState } from "react";
import { parseExport } from "@/lib/letterboxd";
import { merge } from "@/lib/rank";
import { save, useFilms } from "@/lib/store";

export default function Import() {
  const films = useFilms();
  const [error, setError] = useState<string | null>(null);

  async function onFiles(e: React.ChangeEvent<HTMLInputElement>) {
    try {
      const fresh = await parseExport([...(e.target.files ?? [])]);
      save(merge(films ?? [], fresh));
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  const rated = films?.filter((f) => f.stars !== null).length ?? 0;

  return (
    <>
      <h1>Movie Rankings</h1>
      <p className="muted">
        On Letterboxd go to Settings → Data → Export your data, then upload the .zip (or watched.csv and
        ratings.csv). Everything stays in this browser. Re-uploading a newer export keeps your duel progress.
      </p>
      <label>
        Letterboxd export <input type="file" accept=".zip,.csv" multiple onChange={onFiles} />
      </label>
      {error && <p role="alert" className="down">{error}</p>}
      {films && films.length > 0 && (
        <p>
          {films.length} films, {rated} rated. <Link href="/duel">Start ranking →</Link>
        </p>
      )}
    </>
  );
}
