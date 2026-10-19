"use client";
import { ArrowCounterClockwise, EyeSlash, Scales, SkipForward } from "@phosphor-icons/react";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Kbd } from "@/components/ui/kbd";
import { Skeleton } from "@/components/ui/skeleton";
import { pickPair, rankAll, winChance, type Model } from "@/lib/model";
import { setForgotten, type Film, type Match } from "@/lib/rank";
import { commit, getModel, prefetchPoster, useModel } from "@/lib/store";
import { Marquee, watchedLabel } from "../marquee";
import { Poster } from "../poster";

type Ids = [string, string];
type Deck = { cur: Ids; next: Ids | null };
type Step = { films: Film[]; matches: Match[]; cur: Ids };

const ids = (p: [Film, Film] | null): Ids | null => (p ? [p[0].id, p[1].id] : null);
const same = (a: Ids | null, b: Ids | null) => !!a && !!b && a.includes(b[0]) && a.includes(b[1]);
const pct = (p: number) => `${Math.round(p * 100)}%`;

function resolve(films: Film[], pair: Ids | null): [Film, Film] | null {
  if (!pair) return null;
  const [a, b] = pair.map((id) => films.find((f) => f.id === id));
  return a && b && !a.forgotten && !b.forgotten ? [a, b] : null;
}

const CHOOSE_MS = 220;
const COLUMN = "w-full max-w-160 justify-self-center";

export default function Duel() {
  const data = useModel();
  const [deck, setDeck] = useState<Deck | null>(null);
  const [history, setHistory] = useState<Step[]>([]);
  const [recent, setRecent] = useState<string[]>([]);
  const [note, setNote] = useState<ReactNode>(null);
  const [chosen, setChosen] = useState<0 | 1 | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);

  // The next pair is dealt one step ahead so its posters can load while you decide on this one.
  const deal = (films: Film[], model: Model, matches: Match[], avoid: Ids | null, seen: string[]) => {
    for (let i = 0; i < 6; i++) {
      const p = ids(pickPair(films, model, { recent: seen, matches }));
      if (!p || !same(p, avoid)) return p;
    }
    return ids(pickPair(films, model, { recent: seen, matches }));
  };

  // Dealt once per catalogue, so crowd data streaming in doesn't reshuffle the pair on screen.
  const first = useMemo(() => {
    if (deck || !data) return null;
    const cur = deal(data.films, data.model, data.matches, null, []);
    return cur ? { cur, next: deal(data.films, data.model, data.matches, cur, cur) } : null;
  }, [data?.films, deck]); // eslint-disable-line react-hooks/exhaustive-deps
  const d = deck ?? first;
  const pair = data && d ? resolve(data.films, d.cur) : null;
  const upcoming = data && d ? resolve(data.films, d.next) : null;

  useEffect(() => {
    upcoming?.forEach(prefetchPoster);
  }, [upcoming?.[0].id, upcoming?.[1].id]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => clearTimeout(timer.current), []);

  function act(next: { films?: Film[]; matches?: Match[] }, message: ReactNode) {
    if (!data || !pair) return;
    try {
      commit(next);
    } catch {
      setNote("Couldn't save. Browser storage is full or blocked, so this wasn't kept.");
      return;
    }
    const films = next.films ?? data.films;
    const matches = next.matches ?? data.matches;
    const seen = [...recent, pair[0].id, pair[1].id].slice(-12);
    const model = getModel(films, matches, data.crowd);
    const queued = d?.next && resolve(films, d.next) ? d.next : null;
    const cur = queued ?? deal(films, model, matches, d?.cur ?? null, seen);
    setHistory((h) => [...h.slice(-49), { films: data.films, matches: data.matches, cur: [pair[0].id, pair[1].id] }]);
    setRecent(seen);
    setDeck(cur ? { cur, next: deal(films, model, matches, cur, [...seen, ...cur]) } : null);
    setNote(message);
  }

  const pick = (i: 0 | 1) => {
    if (!data || !pair || chosen !== null) return;
    const [w, l] = [pair[i], pair[1 - i]];
    const p = winChance(data.model, w.id, l.id);
    setChosen(i);
    timer.current = setTimeout(() => {
      setChosen(null);
      act(
        { matches: [...data.matches, { a: w.id, b: l.id, s: 1, t: Date.now() }] },
        p < 0.35 ? (
          <><b>{w.title}</b> won, an upset: the model gave it {pct(p)}.</>
        ) : (
          <><b>{w.title}</b> won that matchup.</>
        ),
      );
    }, CHOOSE_MS);
  };
  const draw = () =>
    data && pair && chosen === null &&
    act({ matches: [...data.matches, { a: pair[0].id, b: pair[1].id, s: 0.5, t: Date.now() }] }, "Too close to call, so it counts as a draw.");
  const forget = (f: Film) =>
    data && chosen === null &&
    act({ films: setForgotten(data.films, f.id, true) }, <><b>{f.title}</b> won&rsquo;t come up again. You can bring it back from the ranking.</>);
  const skip = () => {
    if (!data || !pair || chosen !== null) return;
    const seen = [...recent, ...pair.map((f) => f.id)].slice(-12);
    const cur = d?.next && resolve(data.films, d.next) ? d.next : deal(data.films, data.model, data.matches, d?.cur ?? null, seen);
    setRecent(seen);
    setDeck(cur ? { cur, next: deal(data.films, data.model, data.matches, cur, [...seen, ...cur]) } : null);
    setNote("Skipped. Neither film changed.");
  };
  const undo = () => {
    const last = history.at(-1);
    if (!last || chosen !== null) return;
    commit({ films: last.films, matches: last.matches });
    setHistory((h) => h.slice(0, -1));
    setDeck({ cur: last.cur, next: d?.cur ?? null });
    setNote("Taken back. Here's that matchup again.");
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey || (e.target as HTMLElement).closest("input, textarea, select, [role=dialog]")) return;
      const k = e.key.toLowerCase();
      if (k === "arrowleft") pick(0);
      else if (k === "arrowright") pick(1);
      else if (k === "arrowup" || k === "=") draw();
      else if (k === "s") skip();
      else if (k === "z" || k === "backspace") undo();
      else return;
      e.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const progress = useMemo(() => {
    if (!data) return null;
    const ranked = rankAll(data.films, data.model, data.crowd, "habits").filter((r) => !r.film.forgotten);
    return { settled: ranked.filter((r) => r.settled).length, total: ranked.length };
  }, [data]);

  if (!data) return <DuelSkeleton />;
  if (!pair) {
    const shelved = data.films.filter((f) => f.forgotten).length;
    const empty = data.films.length < 2;
    return (
      <>
        <Marquee>Nothing showing</Marquee>
        <div className="grid max-w-[52ch] justify-items-start gap-5 text-dim">
          <p>
            {empty
              ? "There are no films to duel yet. Import your Letterboxd export to put your history on the bill."
              : `Fewer than two films are left to duel, because ${shelved} are marked as not remembered.`}
          </p>
          <Link className={buttonVariants({ size: "lg" })} href={empty ? "/" : "/results?show=forgotten"}>
            {empty ? "Import films" : "Review not remembered"}
          </Link>
        </div>
      </>
    );
  }

  return (
    <>
      <Marquee pulse={history.length}>Which do you prefer?</Marquee>

      <div className={`${COLUMN} grid animate-slot-in grid-cols-2 gap-[clamp(0.75rem,3vw,2rem)]`} key={`${pair[0].id}/${pair[1].id}`}>
        {pair.map((f, i) => (
          <div
            key={f.id}
            data-chosen={chosen === i || undefined}
            data-passed={chosen === 1 - i || undefined}
            className="group/bill grid min-w-0 grid-rows-[1fr_auto] gap-2 transition-[opacity,filter] duration-200 data-passed:opacity-40 data-passed:saturate-40"
          >
            <button
              onClick={() => pick(i as 0 | 1)}
              aria-keyshortcuts={i ? "ArrowRight" : "ArrowLeft"}
              aria-label={`Prefer ${f.title}`}
              className="relative grid w-full min-w-0 cursor-pointer grid-cols-1 content-start gap-3 rounded-lg border bg-felt-2 p-[clamp(0.5rem,1.5vw,0.75rem)] text-left transition-[border-color,box-shadow,transform] duration-250 ease-out-expo outline-none hover:-translate-y-0.5 hover:border-neon hover:shadow-neon focus-visible:-translate-y-0.5 focus-visible:border-neon focus-visible:shadow-neon active:translate-y-0 active:scale-[0.99] group-data-chosen/bill:-translate-y-0.5 group-data-chosen/bill:border-neon group-data-chosen/bill:shadow-neon-lit"
            >
              <Poster film={f} key={f.id} />
              <span className="grid gap-1 px-1 pb-1">
                <span className="text-[clamp(1rem,2.4vw,1.2rem)] leading-snug font-semibold tracking-[-0.01em] text-balance wrap-anywhere">
                  {f.title}
                </span>
                <span className="grid gap-0.5 text-[0.85rem] text-dim max-sm:text-[0.8rem]">
                  <span>{f.year || "Year unknown"}</span>
                  <span className={f.watched ? "" : "text-faint"}>{watchedLabel(f)}</span>
                </span>
              </span>
              <Kbd className="absolute top-4 right-4 bg-board/85 max-sm:hidden">{i ? "→" : "←"}</Kbd>
            </button>
            <Button
              variant="link"
              size="xs"
              onClick={() => forget(f)}
              className="h-8 justify-self-start px-1 text-[0.85rem] max-sm:text-[0.8rem] group-data-chosen/bill:invisible group-data-passed/bill:invisible"
            >
              <EyeSlash aria-hidden /> Don&rsquo;t remember this one
            </Button>
          </div>
        ))}
      </div>

      {/* The honest ways out, kept apart from the two pick targets. */}
      <div className={`${COLUMN} flex flex-wrap gap-2.5 border-t pt-5 max-sm:*:flex-1`}>
        <Button variant="outline" onClick={draw} aria-keyshortcuts="ArrowUp">
          <Scales aria-hidden /> Too close to call <Kbd className="max-sm:hidden">↑</Kbd>
        </Button>
        <Button variant="outline" onClick={skip} aria-keyshortcuts="S">
          <SkipForward aria-hidden /> Skip <Kbd className="max-sm:hidden">S</Kbd>
        </Button>
        <Button variant="outline" className="ml-auto max-sm:ml-0" onClick={undo} disabled={!history.length} aria-keyshortcuts="Z">
          <ArrowCounterClockwise aria-hidden /> Undo <Kbd className="max-sm:hidden">Z</Kbd>
        </Button>
      </div>

      <p className={`${COLUMN} min-h-[1.5em] animate-slot-in text-[1.02rem] text-dim`} aria-live="polite" key={history.length}>
        {note ?? "Pick the one you'd rather watch again."}
      </p>

      {progress && (
        <p className={`${COLUMN} text-sm text-faint`}>
          {data.matches.length.toLocaleString()} duels so far. {progress.settled.toLocaleString()} of{" "}
          {progress.total.toLocaleString()} films have a settled place.{" "}
          <Link href="/results" className="text-dim underline decoration-line-2 underline-offset-4 hover:text-letter">
            See the ranking
          </Link>
        </p>
      )}
    </>
  );
}

// Same footprint as the real page, so nothing jumps when the films load from storage.
function DuelSkeleton() {
  return (
    <>
      <Marquee>Which do you prefer?</Marquee>
      <div className={`${COLUMN} grid grid-cols-2 gap-[clamp(0.75rem,3vw,2rem)]`} aria-busy>
        {[0, 1].map((i) => (
          <div key={i} className="grid gap-3 rounded-lg border bg-felt-2 p-[clamp(0.5rem,1.5vw,0.75rem)]">
            <div className="sweep aspect-2/3 rounded-md bg-board" />
            <Skeleton className="mx-1 h-5 w-3/4 bg-felt-3" />
            <Skeleton className="mx-1 mb-1 h-4 w-1/2 bg-felt-3" />
          </div>
        ))}
      </div>
    </>
  );
}
