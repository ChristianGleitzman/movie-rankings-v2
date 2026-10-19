// The bulb-lit band every page opens with. `pulse` changes re-run the chase burst.
export function Marquee({ children, pulse }: { children: React.ReactNode; pulse?: number }) {
  return (
    <div className="marquee rounded-lg px-4 py-6 text-center" key={pulse}>
      <h1 className="letters text-[clamp(1.9rem,5.5vw,3.6rem)] leading-none text-balance text-shadow-emboss">{children}</h1>
    </div>
  );
}

export const watchedLabel = (f: { watched: string | null; views: number }) => {
  if (!f.watched) return "No watch date";
  const when = new Date(`${f.watched}T00:00:00`).toLocaleDateString(undefined, { month: "short", year: "numeric" });
  if (!f.views) return `Logged ${when}`;
  return `Last watched ${when}${f.views > 1 ? `, seen ${f.views}×` : ""}`;
};
