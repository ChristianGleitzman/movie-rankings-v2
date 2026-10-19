"use client";
import { Trash, UploadSimple } from "@phosphor-icons/react";
import Link from "next/link";
import { useState } from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button, buttonVariants } from "@/components/ui/button";
import { parseExport } from "@/lib/letterboxd";
import { merge } from "@/lib/rank";
import { clearAll, commit, enrichAll, useCrowd, useEnrich, useFilms, useMatches } from "@/lib/store";
import { cn } from "@/lib/utils";
import { Notice, PageHeader, Stat } from "./chrome";

type Result = { total: number; added: number; kept: number };

export default function Import() {
  const films = useFilms();
  const matches = useMatches();
  const crowd = useCrowd();
  const enrich = useEnrich();
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  const [busy, setBusy] = useState(false);
  const [over, setOver] = useState(false);

  async function load(list: File[]) {
    if (!list.length || busy) return;
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const fresh = await parseExport(list);
      const old = new Set((films ?? []).map((f) => f.id));
      const dueled = new Set((matches ?? []).flatMap((m) => [m.a, m.b]));
      commit({ films: merge(films ?? [], fresh) });
      setResult({
        total: fresh.length,
        added: fresh.filter((f) => !old.has(f.id)).length,
        kept: fresh.filter((f) => dueled.has(f.id)).length,
      });
      enrichAll();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(
        /quota|storage/i.test(msg)
          ? "Your browser wouldn't let the app save. Check that site storage isn't blocked, then try again."
          : `${msg} Make sure you picked the .zip from Letterboxd's "Export your data", or its watched.csv.`,
      );
    } finally {
      setBusy(false);
    }
  }

  const n = (x: number) => x.toLocaleString();
  const has = !!films?.length;
  const rated = films?.filter((f) => f.stars !== null).length ?? 0;
  const dated = films?.filter((f) => f.watched).length ?? 0;
  const matched = films && crowd ? films.filter((f) => crowd[f.id]).length : 0;
  const stale = has && films!.every((f) => f.watched === undefined);

  return (
    <>
      <PageHeader
        title={has ? "Your history" : "Import"}
        aside={
          has && (
            <Link href="/duel" className={cn(buttonVariants({ size: "lg" }), "max-sm:w-full")}>
              Start ranking
            </Link>
          )
        }
      >
        {has ? (
          <dl className="mt-3 flex flex-wrap gap-x-10 gap-y-3">
            <Stat label="Films" value={n(films!.length)} />
            <Stat label="Rated" value={n(rated)} />
            <Stat label="With watch dates" value={n(dated)} />
            {enrich.status !== "disabled" && <Stat label="Matched on TMDB" value={n(matched)} />}
          </dl>
        ) : (
          <p className="max-w-[60ch]">Bring in everything you&rsquo;ve logged on Letterboxd, then rank it one duel at a time.</p>
        )}
      </PageHeader>

      <div className="grid gap-3 empty:hidden">
        {result && (
          <Notice tone="ok">
            Imported {n(result.total)} films.{" "}
            {result.added > 0 && result.added !== result.total ? `${n(result.added)} are new. ` : ""}
            {result.kept > 0 ? `Duel history kept for ${n(result.kept)}.` : ""}
          </Notice>
        )}
        {stale && !result && (
          <Notice tone="warn">
            This import is from before watch dates were supported. Drop your export again to add them; your duels are kept.
          </Notice>
        )}
        {error && <Notice tone="bad">{error}</Notice>}
        {has && enrich.status === "running" && (
          <Notice tone="info">
            Looking up posters and crowd ratings on TMDB: {n(enrich.done)} of {n(enrich.total)}. You can start ranking meanwhile.
          </Notice>
        )}
        {has && enrich.status === "error" && (
          <Notice tone="warn">
            TMDB lookups paused after an error.{" "}
            <Button variant="link" className="h-auto text-[0.95rem]" onClick={() => enrichAll()}>
              Try again
            </Button>
          </Notice>
        )}
        {has && enrich.status === "disabled" && (
          <Notice tone="info">
            Posters and crowd ratings are off. Add a TMDB read token as <code className="text-letter">TMDB_TOKEN</code> in{" "}
            <code className="text-letter">.env.local</code> to turn them on.
          </Notice>
        )}
      </div>

      <section className="grid gap-4">
        <ol className="grid max-w-[64ch] gap-1.5 text-dim">
          <li>
            On Letterboxd, open <b>Settings</b>, then <b>Data</b>, then <b>Export your data</b>.
          </li>
          <li>Drop the .zip below. Watch dates come from your diary, so films you saw recently come up first.</li>
        </ol>
        <label
          className={cn(
            "felt-board grid cursor-pointer place-items-center content-center gap-2.5 rounded-lg px-4 py-8 text-center transition-[box-shadow,background-color] duration-250 ease-out-expo hover:shadow-neon focus-within:shadow-neon",
            has ? "min-h-40" : "min-h-60",
            over && "bg-[#10131a] shadow-neon",
            busy && "sweep cursor-progress",
          )}
          onDragOver={(e) => {
            e.preventDefault();
            setOver(true);
          }}
          onDragLeave={() => setOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setOver(false);
            load([...e.dataTransfer.files]);
          }}
        >
          <UploadSimple aria-hidden className="size-7 text-dim" />
          <span className={cn("letters leading-none text-shadow-emboss", has ? "text-[clamp(1.4rem,4vw,2rem)]" : "text-[clamp(1.7rem,5vw,2.75rem)]")}>
            {busy ? "Reading your history" : over ? "Let go to import" : has ? "Drop a newer export" : "Drop your export here"}
          </span>
          <span className="text-[0.95rem] text-dim">
            {busy ? "This takes a second or two." : "Or click to choose the .zip, or watched.csv, ratings.csv and diary.csv."}
          </span>
          <input
            type="file"
            accept=".zip,.csv"
            multiple
            className="sr-only"
            disabled={busy}
            onChange={(e) => {
              load([...(e.target.files ?? [])]);
              e.target.value = "";
            }}
          />
        </label>
        <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2 text-sm text-faint">
          <p className="max-w-[72ch]">
            Everything stays in this browser. Only film titles and years are sent out, to look films up on TMDB. This
            product uses the TMDB API but is not endorsed or certified by TMDB.
          </p>
          {has && (
            <AlertDialog>
              <AlertDialogTrigger render={<Button variant="link" size="xs" className="h-8 text-sm hover:text-down" />}>
                <Trash aria-hidden /> Delete my data
              </AlertDialogTrigger>
              <AlertDialogContent className="bg-felt-2 ring-line">
                <AlertDialogHeader>
                  <AlertDialogTitle className="text-lg font-semibold">Delete everything?</AlertDialogTitle>
                  <AlertDialogDescription className="text-dim">
                    This removes all {n(films!.length)} films, your {n(matches?.length ?? 0)} duels and cached TMDB data
                    from this browser. It can&rsquo;t be undone, though you can import your export again.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter className="border-line bg-felt">
                  <AlertDialogCancel variant="outline">Keep my data</AlertDialogCancel>
                  <AlertDialogAction
                    variant="destructive"
                    onClick={() => {
                      clearAll();
                      setResult(null);
                    }}
                  >
                    Delete everything
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )}
        </div>
      </section>
    </>
  );
}
