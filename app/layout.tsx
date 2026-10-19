import type { Metadata, Viewport } from "next";
import { Archivo, Big_Shoulders } from "next/font/google";
import { TooltipProvider } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { Enricher } from "./chrome";
import { Nav } from "./nav";
import "./globals.css";

const letters = Big_Shoulders({ subsets: ["latin"], weight: ["600", "800"], variable: "--font-letters" });
const body = Archivo({ subsets: ["latin"], variable: "--font-body" });

export const metadata: Metadata = {
  title: "Movie Rankings",
  description: "Rank your Letterboxd films head-to-head and see how it compares to your star ratings.",
};

export const viewport: Viewport = { themeColor: "#121110", colorScheme: "dark" };

const CONTRACT = `
THESIS: every duel is tonight's double bill on a cinema marquee; the ranking is the lobby letterboard. Refuses the poster-grid-on-gray streaming default.
OWN-WORLD: black grooved felt ground, white push-in letterboard caps (Big Shoulders), amber chase bulbs, one blue neon tube (v1's blue) for focus and the winner. Archivo for tables.
STORY: pick the film you prefer, or take an honest exit (too close, don't remember, skip, undo); watch dates jog memory; the ranking shows where stars and preference disagree.
FIRST VIEWPORT: bulb-lit marquee band "Which do you prefer?", two equal bills at fixed scale below, exits apart beneath, outcome line live.
FORM: Marquee & Letterboard, candidate 3 of 7, seed 06c20e4e.
FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance
`;

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={cn(letters.variable, body.variable)}>
      <body>
        <div hidden dangerouslySetInnerHTML={{ __html: `<!--${CONTRACT}-->` }} />
        <TooltipProvider delay={300}>
          <Enricher />
          <Nav />
          <main className="mx-auto grid max-w-5xl gap-[clamp(1.5rem,3vw,2.25rem)] px-4 pt-[clamp(1.5rem,4vw,3rem)] pb-24">
            {children}
          </main>
        </TooltipProvider>
      </body>
    </html>
  );
}
