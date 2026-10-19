import { Star, StarHalf } from "@phosphor-icons/react/dist/ssr";

// The mark: two bills under marquee bulbs, the right one lit by the neon tube (your pick), on a letterboard rail.
export function Mark({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden className="shrink-0">
      <circle cx="20" cy="9" r="3.5" fill="var(--bulb)" />
      <circle cx="32" cy="9" r="3.5" fill="var(--bulb-off)" />
      <circle cx="44" cy="9" r="3.5" fill="var(--bulb)" />
      <rect x="9" y="18" width="19" height="32" rx="3" fill="var(--line)" />
      <rect x="36" y="19.5" width="19" height="29" rx="3" fill="none" stroke="var(--neon)" strokeWidth="3.5" />
      <rect x="9" y="56" width="46" height="3.5" rx="1.75" fill="var(--letter)" />
    </svg>
  );
}

export function Stars({ value, label }: { value: number | null; label?: string }) {
  if (value === null) return <span className="text-sm text-faint">Unrated</span>;
  return (
    <span className="inline-flex gap-px text-bulb" role="img" aria-label={`${label ? `${label}: ` : ""}${value} star${value === 1 ? "" : "s"}`}>
      {[1, 2, 3, 4, 5].map((n) => (
        <span key={n} className="relative inline-grid size-[1.05rem] *:absolute *:inset-0 *:size-full">
          <Star weight="fill" className="text-[#2f2a24]" />
          {value >= n ? <Star weight="fill" /> : value >= n - 0.5 && <StarHalf weight="fill" />}
        </span>
      ))}
    </span>
  );
}
