"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { Mark } from "./logo";

const LINKS = [
  ["/duel", "Duel"],
  ["/results", "Ranking"],
  ["/", "Import"],
] as const;

export function Nav() {
  const path = usePathname();
  return (
    <header className="flex h-16 items-center justify-between gap-4 border-b px-[clamp(1rem,4vw,2.5rem)]">
      <Link href="/duel" className="letters inline-flex items-center gap-2.5 text-[1.05rem] tracking-[0.07em] text-letter no-underline">
        <Mark />
        <span className="max-sm:sr-only">Movie Rankings</span>
      </Link>
      <nav className="flex gap-[clamp(1.1rem,4vw,2.25rem)]">
        {LINKS.map(([href, label]) => (
          <Link
            key={href}
            href={href}
            aria-current={path === href ? "page" : undefined}
            className={cn(
              "relative py-2 text-[0.95rem] font-medium text-dim no-underline transition-colors hover:text-letter",
              path === href && "tube text-letter",
            )}
          >
            {label}
          </Link>
        ))}
      </nav>
    </header>
  );
}
