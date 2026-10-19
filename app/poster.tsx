"use client";
import { useEffect, useState } from "react";
import type { Film } from "@/lib/rank";
import { ensureCrowd, useCrowd, useEnrich } from "@/lib/store";

// Three layers in one fixed 2:3 frame, so nothing shifts as it resolves: the letterboard slate (always there),
// a light sweep while the poster is looked up and downloaded, then the poster fading in on top.
// Render with key={film.id} so each film starts fresh.
export function Poster({ film }: { film: Film }) {
  const entry = useCrowd()?.[film.id];
  const disabled = useEnrich().status === "disabled";
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (entry === undefined) ensureCrowd(film);
  }, [entry, film]);

  const src = entry?.poster && !failed ? entry.poster : null;
  const state = entry === undefined && !disabled ? "looking" : !src ? "none" : loaded ? "shown" : "loading";

  return (
    <div className="poster relative aspect-2/3 overflow-hidden rounded-md bg-board" data-state={state} aria-busy={state === "looking" || state === "loading"}>
      <div className="slate felt-board grid place-items-center rounded-[inherit] p-4 transition-opacity duration-300" aria-hidden>
        <span className="letters text-center text-[clamp(1.3rem,4vw,2.3rem)] leading-[1.05] text-balance wrap-anywhere text-shadow-emboss transition-opacity duration-300">
          {film.title}
        </span>
      </div>
      {src && (
        // eslint-disable-next-line @next/next/no-img-element -- TMDB serves sized posters; no optimizer needed
        <img
          src={src}
          alt=""
          decoding="async"
          className="size-full object-cover"
          onLoad={() => setLoaded(true)}
          onError={() => setFailed(true)}
          ref={(img) => {
            if (img?.complete && img.naturalWidth) setLoaded(true);
          }}
        />
      )}
    </div>
  );
}
