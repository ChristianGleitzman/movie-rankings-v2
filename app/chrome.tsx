"use client";
import { CheckCircle, WarningCircle } from "@phosphor-icons/react";
import { useEffect } from "react";
import { enrichAll, useFilms } from "@/lib/store";
import { cn } from "@/lib/utils";

/** Quiet page header for everything except the duel, which keeps the marquee. */
export function PageHeader({ title, children, aside }: { title: string; children?: React.ReactNode; aside?: React.ReactNode }) {
  return (
    <header className="flex flex-wrap items-end justify-between gap-x-8 gap-y-5 border-b pb-6">
      <div className="grid gap-2">
        <h1 className="font-letters text-[clamp(2.25rem,5vw,3.25rem)] leading-none font-extrabold tracking-[0.01em] uppercase">{title}</h1>
        {children && <div className="text-dim">{children}</div>}
      </div>
      {aside}
    </header>
  );
}

/** A labelled figure in a stats row. */
export function Stat({ label, value, hint }: { label: string; value: React.ReactNode; hint?: string }) {
  return (
    <div className="grid gap-1" title={hint}>
      <dt className="text-xs font-medium text-faint">{label}</dt>
      <dd className="text-2xl font-semibold tracking-tight text-letter tabular-nums">{value}</dd>
    </div>
  );
}

export function Notice({ tone, children }: { tone: "ok" | "warn" | "bad" | "info"; children: React.ReactNode }) {
  const Icon = tone === "ok" ? CheckCircle : WarningCircle;
  return (
    <p
      role={tone === "bad" ? "alert" : "status"}
      className={cn("flex max-w-[68ch] items-start gap-2.5 text-[0.95rem]", tone === "bad" ? "text-down" : "text-dim")}
    >
      <Icon
        aria-hidden
        weight="fill"
        className={cn("mt-0.5 size-5 shrink-0", { ok: "text-up", warn: "text-bulb", bad: "text-down", info: "text-neon-text" }[tone])}
      />
      <span>{children}</span>
    </p>
  );
}

/** Keeps TMDB posters and crowd ratings filled in, in the background, whenever the catalogue changes. */
export function Enricher() {
  const films = useFilms();
  useEffect(() => {
    if (films?.length) enrichAll();
  }, [films]);
  return null;
}
