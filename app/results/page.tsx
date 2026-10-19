"use client";
import { ArrowCounterClockwise, ArrowDownRight, ArrowUpRight, CaretDown, Info, MagnifyingGlass, Star, TrendDown, TrendUp, X } from "@phosphor-icons/react";
import Link from "next/link";
import { useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { HOT_TAKE, rankAll, starScale, type Calibration, type Ranked } from "@/lib/model";
import { setForgotten } from "@/lib/rank";
import { commit, useEnrich, useModel } from "@/lib/store";
import { cn } from "@/lib/utils";
import { PageHeader, Stat } from "../chrome";
import { Stars } from "../logo";
import { watchedLabel } from "../marquee";

type Row = Ranked & { delta: number | null };
type Filter = "all" | "under" | "over" | "hot" | "unrated" | "forgotten";
type Sort = "rank" | "gap" | "hot";

const FILTERS: Record<Filter, { label: string; test: (r: Row) => boolean; crowd?: boolean }> = {
  all: { label: "All", test: (r) => !r.film.forgotten },
  under: { label: "Underrated", test: (r) => !r.film.forgotten && (r.delta ?? 0) > 0 },
  over: { label: "Overrated", test: (r) => !r.film.forgotten && (r.delta ?? 0) < 0 },
  hot: { label: "Hot takes", test: (r) => !r.film.forgotten && Math.abs(r.against ?? 0) >= HOT_TAKE, crowd: true },
  unrated: { label: "Unrated", test: (r) => !r.film.forgotten && r.film.stars === null },
  forgotten: { label: "Not remembered", test: (r) => !!r.film.forgotten },
};

const SCALES: Record<Calibration, { label: string; hint: string }> = {
  habits: { label: "Your habits", hint: "Hands out each star rating as often as you do on Letterboxd." },
  balanced: {
    label: "Balanced",
    hint: "Halfway between your habits and how the crowd rates the films you've watched. Reins in generosity without assuming you watch bad films.",
  },
  crowd: { label: "Crowd", hint: "Hands out stars the way the crowd rates the films you've watched." },
};

const PAGE = 100;
const SCALE_KEY = "mr2:scale";
const half = (n: number) => `${Math.floor(n) || ""}${n % 1 ? "½" : ""}★`;

// Desktop: six columns. Phone: rank beside the title, then the three ratings stacked with the verdict to their right.
const ROW =
  "grid items-center gap-x-4 px-2 md:grid-cols-[3.5rem_minmax(0,1fr)_6.75rem_6.75rem_4.25rem_10.5rem] max-md:grid-cols-[2.75rem_minmax(0,1fr)_auto] max-md:items-start max-md:gap-x-3 max-md:gap-y-1.5 max-md:px-1 max-md:[grid-template-areas:'rank_film_film'_'._you_verdict'_'._says_verdict'_'._crowd_verdict']";
const PILL =
  "h-9 rounded-full border border-line bg-felt-2 px-3.5 text-dim hover:border-line-2 hover:bg-felt-3 hover:text-letter aria-pressed:border-letter aria-pressed:bg-letter aria-pressed:text-felt";
const SEG = "h-8 rounded-full px-3.5 text-[0.85rem] text-dim hover:bg-felt-3 hover:text-letter aria-pressed:bg-letter aria-pressed:text-felt";

function Hint({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <Tooltip>
      <TooltipTrigger
        render={<button type="button" aria-label={label} className="grid cursor-help place-items-center rounded-full text-faint hover:text-letter" />}
      >
        <Info aria-hidden className="size-3.5" />
      </TooltipTrigger>
      <TooltipContent className="max-w-72 bg-letter text-[0.8rem] leading-snug text-felt">{children}</TooltipContent>
    </Tooltip>
  );
}

function Verdict({ r, onRestore }: { r: Row; onRestore: () => void }) {
  if (r.film.forgotten)
    return (
      <Button variant="outline" size="sm" onClick={onRestore}>
        <ArrowCounterClockwise aria-hidden /> Bring back
      </Button>
    );
  if (r.delta === null) return <span className="text-[0.85rem] text-faint">Predicted</span>;
  if (r.delta === 0) return <span className="sr-only">Matches your rating</span>;
  const up = r.delta > 0;
  return (
    <Badge
      variant="outline"
      className={cn(
        "h-7 gap-1.5 px-2.5 text-[0.8rem] font-semibold [&>svg]:size-3.5!",
        up ? "border-up/30 bg-up/10 text-up" : "border-down/30 bg-down/10 text-down",
      )}
    >
      {up ? <TrendUp aria-hidden weight="bold" /> : <TrendDown aria-hidden weight="bold" />}
      {up ? "Underrated" : "Overrated"} by {half(Math.abs(r.delta))}
    </Badge>
  );
}

function CrowdCell({ r }: { r: Row }) {
  if (r.crowd === null) return <span className="text-[0.85rem] text-faint">n/a</span>;
  const hot = Math.abs(r.against ?? 0) >= HOT_TAKE;
  return (
    <span className="inline-flex items-center gap-1 text-[0.9rem] text-dim tabular-nums">
      <Star aria-hidden weight="fill" className="size-3.5 text-faint" />
      {r.crowd.toFixed(1)}
      {hot &&
        (r.against! > 0 ? (
          <ArrowUpRight aria-label="You rank it far above the crowd" weight="bold" className="size-3.5 text-neon-text" />
        ) : (
          <ArrowDownRight aria-label="You rank it far below the crowd" weight="bold" className="size-3.5 text-neon-text" />
        ))}
    </span>
  );
}

function Board({ label, rows }: { label: string; rows: Row[] }) {
  return (
    <section className="felt-board rounded-lg px-5 pt-5 pb-4" aria-label={label}>
      <h2 className="letters mb-4 text-[1.35rem] leading-none tracking-[0.07em] text-bulb">{label}</h2>
      {rows.length ? (
        <ol>
          {rows.map((r) => (
            <li
              key={r.film.id}
              className="letters grid h-8 grid-cols-[2.25rem_minmax(0,1fr)_auto] items-baseline gap-2.5 text-[1.05rem] leading-8 font-semibold text-shadow-[0_1px_0_#000]"
            >
              <span className="text-right text-faint">{r.rank}</span>
              <span className="truncate">{r.film.title}</span>
              <span className="text-dim">{r.film.year || ""}</span>
            </li>
          ))}
        </ol>
      ) : (
        <p className="text-faint">Nothing here yet.</p>
      )}
    </section>
  );
}

function HotTakes({ title, rows, up }: { title: string; rows: Row[]; up: boolean }) {
  const Icon = up ? ArrowUpRight : ArrowDownRight;
  return (
    <div className="grid content-start gap-3">
      <h3 className="flex items-center gap-2 text-[0.95rem] font-semibold">
        <Icon aria-hidden weight="bold" className="size-4 text-neon-text" /> {title}
      </h3>
      {rows.length ? (
        <ol className="divide-y divide-line border-y">
          {rows.map((r) => (
            <li key={r.film.id} className="grid grid-cols-[minmax(0,1fr)_auto] items-baseline gap-4 py-2.5">
              <span className="truncate">
                <span className="font-medium">{r.film.title}</span> <span className="text-faint">{r.film.year || ""}</span>
              </span>
              <span className="text-[0.85rem] whitespace-nowrap text-dim tabular-nums">
                #{r.rank} for you <span className="text-faint">· crowd {r.crowd!.toFixed(1)}★</span>
              </span>
            </li>
          ))}
        </ol>
      ) : (
        <p className="text-[0.9rem] text-faint">None yet.</p>
      )}
    </div>
  );
}

export default function Results() {
  const data = useModel();
  const enrich = useEnrich();
  const [scale, setScaleState] = useState<Calibration>(() => {
    try {
      const v = typeof window !== "undefined" && localStorage.getItem(SCALE_KEY);
      if (v === "habits" || v === "balanced" || v === "crowd") return v;
    } catch {}
    return "balanced";
  });
  const setScale = (v: Calibration) => {
    setScaleState(v);
    try {
      localStorage.setItem(SCALE_KEY, v);
    } catch {}
  };
  const [filter, setFilter] = useState<Filter>(() =>
    typeof window !== "undefined" && new URLSearchParams(window.location.search).get("show") === "forgotten" ? "forgotten" : "all",
  );
  const [sort, setSort] = useState<Sort>("rank");
  const [query, setQuery] = useState("");
  const [shown, setShown] = useState(PAGE);

  const crowdReady = useMemo(() => (data ? starScale(data.films, data.crowd, "balanced").available : false), [data]);
  const mode: Calibration = crowdReady ? scale : "habits";
  const ranked = useMemo<Row[]>(
    () =>
      data
        ? rankAll(data.films, data.model, data.crowd, mode).map((r) => ({ ...r, delta: r.film.stars === null ? null : r.says - r.film.stars }))
        : [],
    [data, mode],
  );

  if (!data)
    return (
      <>
        <div className="sweep h-24 rounded-lg bg-board" />
        <div className="grid gap-[clamp(0.75rem,3vw,2rem)] md:grid-cols-2" aria-busy>
          <div className="sweep h-96 rounded-lg bg-board" />
          <div className="sweep h-96 rounded-lg bg-board" />
        </div>
      </>
    );
  if (!data.films.length)
    return (
      <>
        <PageHeader title="Your ranking" />
        <div className="grid max-w-[52ch] justify-items-start gap-5 text-dim">
          <p>Your ranking appears here once you&rsquo;ve imported your films and done a few duels.</p>
          <Link className={buttonVariants({ size: "lg" })} href="/">Import films</Link>
        </div>
      </>
    );

  const remembered = ranked.filter((r) => !r.film.forgotten);
  const settled = remembered.filter((r) => r.settled).length;
  const withCrowd = data.films.filter((f) => data.crowd[f.id] !== undefined).length;
  const hotUp = remembered.filter((r) => (r.against ?? 0) >= HOT_TAKE).sort((a, b) => b.against! - a.against!).slice(0, 5);
  const hotDown = remembered.filter((r) => (r.against ?? 0) <= -HOT_TAKE).sort((a, b) => a.against! - b.against!).slice(0, 5);

  const q = query.trim().toLowerCase();
  const rows = ranked.filter((r) => FILTERS[filter].test(r) && (!q || `${r.film.title} ${r.film.year}`.toLowerCase().includes(q)));
  if (sort === "gap") rows.sort((a, b) => Math.abs(b.delta ?? 0) - Math.abs(a.delta ?? 0) || a.rank - b.rank);
  if (sort === "hot") rows.sort((a, b) => Math.abs(b.against ?? 0) - Math.abs(a.against ?? 0) || a.rank - b.rank);
  const visible = rows.slice(0, shown);
  const choose = (f: Filter) => {
    setFilter(f);
    setShown(PAGE);
  };

  return (
    <>
      <PageHeader
        title="Your ranking"
        aside={
          <div className="grid gap-1.5">
            <span className="inline-flex items-center gap-1.5 text-xs font-medium text-faint" id="scale-label">
              Stars from your ranking
              <Hint label="About star scales">
                {crowdReady
                  ? SCALES[mode].hint
                  : "Balanced and Crowd need crowd ratings from TMDB. Until those load, stars follow your own habits."}
              </Hint>
            </span>
            <ToggleGroup
              aria-labelledby="scale-label"
              value={[mode]}
              onValueChange={(v: string[]) => v[0] && setScale(v[0] as Calibration)}
              spacing={1}
              className="rounded-full border bg-felt-2/60 p-1"
            >
              {(Object.keys(SCALES) as Calibration[]).map((k) => (
                <ToggleGroupItem key={k} value={k} disabled={k !== "habits" && !crowdReady} className={SEG}>
                  {SCALES[k].label}
                </ToggleGroupItem>
              ))}
            </ToggleGroup>
          </div>
        }
      >
        <dl className="mt-3 flex flex-wrap gap-x-10 gap-y-3">
          <Stat label="Films" value={remembered.length.toLocaleString()} />
          <Stat label="Duels" value={data.matches.length.toLocaleString()} />
          <Stat label="Settled" value={settled.toLocaleString()} hint="Films whose likely rank range is narrow" />
          {enrich.status !== "disabled" && (
            <Stat label="Crowd data" value={`${Math.round((withCrowd / data.films.length) * 100)}%`} hint="Films matched on TMDB" />
          )}
        </dl>
      </PageHeader>

      <div className="grid gap-[clamp(0.75rem,3vw,2rem)] md:grid-cols-2">
        <Board label="Favourites" rows={remembered.slice(0, 10)} />
        <Board label="Least favourite" rows={remembered.slice(-10).reverse()} />
      </div>

      {crowdReady && (
        <section className="grid gap-5" aria-labelledby="crowd-title">
          <div className="grid gap-1">
            <h2 id="crowd-title" className="text-xl font-semibold tracking-tight">Against the crowd</h2>
            <p className="max-w-[68ch] text-[0.9rem] text-faint">
              Where your ranking differs most from TMDB&rsquo;s audience, among the films you&rsquo;ve watched.
            </p>
          </div>
          <div className="grid gap-8 md:grid-cols-2">
            <HotTakes title="You rank higher" rows={hotUp} up />
            <HotTakes title="You rank lower" rows={hotDown} up={false} />
          </div>
        </section>
      )}

      <section className="mt-2 grid gap-5" aria-labelledby="every-title">
        <div className="grid gap-1">
          <h2 id="every-title" className="text-xl font-semibold tracking-tight">Every film</h2>
          <p className="max-w-[68ch] text-[0.9rem] text-faint">
            Ranks firm up as you duel. Until then, the small range under a rank shows where a film could plausibly land.
          </p>
        </div>

        <div className="flex flex-wrap items-end gap-x-6 gap-y-4">
          <label className="grid flex-[1_1_18rem] gap-1.5">
            <span className="text-xs font-medium text-faint">Find a film</span>
            <span className="relative">
              <MagnifyingGlass aria-hidden className="pointer-events-none absolute top-1/2 left-3.5 size-[1.1rem] -translate-y-1/2 text-dim" />
              <Input
                type="search"
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setShown(PAGE);
                }}
                autoComplete="off"
                spellCheck={false}
                className="h-11 rounded-[9px] border-line-2 bg-felt-2 pr-11 pl-10 text-base dark:bg-felt-2 [&::-webkit-search-cancel-button]:hidden"
              />
              {query && (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  className="absolute top-1/2 right-1.5 -translate-y-1/2 rounded-md"
                  onClick={() => setQuery("")}
                  aria-label="Clear search"
                >
                  <X aria-hidden />
                </Button>
              )}
            </span>
          </label>
          <div className="grid gap-1.5 max-sm:w-full">
            <span className="text-xs font-medium text-faint" id="sort-label">Sort by</span>
            <ToggleGroup
              aria-labelledby="sort-label"
              value={[sort]}
              onValueChange={(v: string[]) => v[0] && setSort(v[0] as Sort)}
              spacing={1}
              className="rounded-full border bg-felt-2/60 p-1"
            >
              <ToggleGroupItem value="rank" className={SEG}>Rank</ToggleGroupItem>
              <ToggleGroupItem value="gap" className={SEG}>Biggest gap</ToggleGroupItem>
              {crowdReady && <ToggleGroupItem value="hot" className={SEG}>Against the crowd</ToggleGroupItem>}
            </ToggleGroup>
          </div>
        </div>

        <ToggleGroup
          aria-label="Show"
          value={[filter]}
          onValueChange={(v: string[]) => v[0] && choose(v[0] as Filter)}
          spacing={2}
          className="w-full flex-wrap"
        >
          {(Object.keys(FILTERS) as Filter[])
            .filter((k) => !FILTERS[k].crowd || crowdReady)
            .map((k) => (
              <ToggleGroupItem key={k} value={k} className={cn(PILL, "group/chip gap-2")}>
                {FILTERS[k].label}
                <span className="text-[0.8rem] text-faint tabular-nums group-aria-pressed/chip:text-[#5e584f]">
                  {ranked.filter(FILTERS[k].test).length.toLocaleString()}
                </span>
              </ToggleGroupItem>
            ))}
        </ToggleGroup>

        <div className="grid">
          <div className={cn(ROW, "sticky top-0 z-10 border-b border-line-2 bg-felt py-2.5 text-xs font-medium text-faint max-md:hidden")}>
            <span className="inline-flex items-center justify-end gap-1">
              Rank <Hint label="About rank ranges">The range under a rank is where the film likely sits (about 68% sure). It narrows as you duel.</Hint>
            </span>
            <span>Film</span>
            <span>Your rating</span>
            <span className="inline-flex items-center gap-1">
              Ranking says <Hint label="About Ranking says">Your ranking turned back into stars, using the {SCALES[mode].label.toLowerCase()} scale.</Hint>
            </span>
            <span className="inline-flex items-center gap-1">
              Crowd <Hint label="About Crowd">TMDB audience average on a 5-star scale. An arrow marks a hot take: you rank it far above or below the crowd.</Hint>
            </span>
            <span className="inline-flex items-center gap-1">
              Verdict <Hint label="About Verdict">Where your stars and your ranking disagree. Blank means they agree.</Hint>
            </span>
          </div>
          <ol>
            {visible.map((r) => (
              <li
                key={r.film.id}
                data-shelved={r.film.forgotten || undefined}
                className={cn(ROW, "group/row border-b py-3 transition-colors hover:bg-felt-2/70 max-md:py-3.5")}
              >
                <span className="grid justify-items-end gap-1 max-md:justify-items-start max-md:[grid-area:rank]">
                  <span className="text-[1.15rem] leading-none font-semibold tracking-tight text-letter tabular-nums group-data-shelved/row:text-faint">
                    {r.rank}
                  </span>
                  {!r.settled && !r.film.forgotten && (
                    <span className="text-[0.7rem] leading-none whitespace-nowrap text-faint tabular-nums" title="Likely rank range">
                      {r.range[0]}-{r.range[1]}
                    </span>
                  )}
                </span>
                <span className="min-w-0 max-md:mb-1 max-md:[grid-area:film]">
                  <span className="font-medium wrap-anywhere group-data-shelved/row:text-faint">
                    {r.film.title} <span className="font-normal text-faint">{r.film.year || ""}</span>
                  </span>
                  <span className="mt-0.5 flex flex-wrap gap-x-4 gap-y-0.5 text-[0.8rem] text-faint">
                    <span>{watchedLabel({ watched: r.film.watched ?? null, views: r.film.views ?? 0 })}</span>
                    <span>{r.games ? `${r.games} duel${r.games === 1 ? "" : "s"}` : "No duels yet"}</span>
                  </span>
                </span>
                <span className="flex items-center gap-2.5 group-data-shelved/row:opacity-45 max-md:[grid-area:you]">
                  <span className="w-16 text-xs text-faint md:hidden">You</span>
                  <Stars value={r.film.stars} label="Your rating" />
                </span>
                <span className="flex items-center gap-2.5 group-data-shelved/row:opacity-45 max-md:[grid-area:says]">
                  <span className="w-16 text-xs text-faint md:hidden">Ranking</span>
                  <Stars value={r.says} label="Ranking says" />
                </span>
                <span className="flex items-center gap-2.5 max-md:[grid-area:crowd]">
                  <span className="w-16 text-xs text-faint md:hidden">Crowd</span>
                  <CrowdCell r={r} />
                </span>
                <span className="max-md:self-center max-md:justify-self-end max-md:[grid-area:verdict]">
                  <Verdict r={r} onRestore={() => commit({ films: setForgotten(data.films, r.film.id, false) })} />
                </span>
              </li>
            ))}
          </ol>
          {!rows.length && (
            <p className="py-10 text-center text-faint">
              {q ? `No films match “${query.trim()}”.` : "No films in this group yet."}{" "}
              {(q || filter !== "all") && (
                <Button
                  variant="link"
                  className="h-auto"
                  onClick={() => {
                    setQuery("");
                    choose("all");
                  }}
                >
                  Show all films
                </Button>
              )}
            </p>
          )}
          {rows.length > shown && (
            <Button variant="outline" className="mt-6 justify-self-center px-6" onClick={() => setShown((n) => n + PAGE)}>
              Show {Math.min(PAGE, rows.length - shown)} more
              <span className="text-faint">of {(rows.length - shown).toLocaleString()} left</span>
            </Button>
          )}
        </div>
      </section>

      <details className="group/how mt-4 rounded-lg border bg-felt-2/50 open:bg-felt-2/70">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-4 px-5 py-4 font-semibold [&::-webkit-details-marker]:hidden">
          How the ranking works
          <CaretDown aria-hidden className="size-4 text-dim transition-transform group-open/how:rotate-180" />
        </summary>
        <div className="grid max-w-[70ch] gap-3 px-5 pb-5 text-[0.95rem] text-dim">
          <p>
            <b>Your stars are the starting point, read relative to you.</b> If a fifth of your films are 5★, a 5★ means
            &ldquo;in your top fifth&rdquo;, not &ldquo;perfect&rdquo;. Films you never rated start where the crowd puts
            them, and the crowd also breaks ties between films you gave the same rating.
          </p>
          <p>
            <b>Every duel is kept, and the ranking is refitted from all of them.</b> It uses a Bradley-Terry model, the
            statistics behind Elo, but solved over your whole duel history at once, so the order you duel in
            doesn&rsquo;t matter. A draw counts as half a win each.
          </p>
          <p>
            <b>Matchups are chosen to learn the most.</b> Each duel pairs films the model is unsure about with
            opponents close to them, favours films you&rsquo;ve watched recently, and rests films you&rsquo;ve just seen.
            Lopsided matchups rarely come up, because they would teach it almost nothing.
          </p>
          <p>
            <b>Stars from your ranking</b> hand out ratings by position. Balanced sits halfway between your own habits
            and how TMDB&rsquo;s audience rates the films you&rsquo;ve watched, so a generous rater gets fewer 5★
            without being judged as if they watched everything.
          </p>
        </div>
      </details>
    </>
  );
}
