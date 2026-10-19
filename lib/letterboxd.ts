import JSZip from "jszip";
import Papa from "papaparse";
import type { RawFilm } from "./rank";

type Row = { Date?: string; Name?: string; Year?: string; Rating?: string; "Watched Date"?: string };

const CSVS = ["watched.csv", "ratings.csv", "diary.csv"];

// More films than this logged on one day in watched.csv means a bulk backfill, so that date says nothing about when they were seen.
const BULK_DAY = 10;

// Accepts the Letterboxd export .zip, or watched.csv / ratings.csv / diary.csv picked directly.
export async function parseExport(files: File[]): Promise<RawFilm[]> {
  const texts: Record<string, string> = {};
  for (const file of files) {
    if (file.name.endsWith(".zip")) {
      const zip = await JSZip.loadAsync(file);
      for (const name of CSVS) {
        const entry = zip.file(name);
        if (entry) texts[name] = await entry.async("string");
      }
    } else if (CSVS.includes(file.name)) {
      texts[file.name] = await file.text();
    }
  }
  if (!texts["watched.csv"] && !texts["ratings.csv"]) {
    throw new Error("No watched.csv or ratings.csv found in that upload.");
  }

  const rows = (name: string) =>
    texts[name] ? Papa.parse<Row>(texts[name], { header: true, skipEmptyLines: true }).data : [];
  const key = (row: Row) => {
    const title = row.Name?.trim();
    return title ? { id: `${title}|${Number.parseInt(row.Year ?? "", 10) || 0}`, title } : null;
  };
  const isDate = (s?: string) => !!s && /^\d{4}-\d{2}-\d{2}$/.test(s);

  // The diary is the real watch history: last watch date and number of viewings.
  const diary = new Map<string, { watched: string; views: number }>();
  for (const row of rows("diary.csv")) {
    const k = key(row);
    const date = row["Watched Date"] || row.Date;
    if (!k || !isDate(date)) continue;
    const prev = diary.get(k.id);
    diary.set(k.id, { watched: prev && prev.watched > date! ? prev.watched : date!, views: (prev?.views ?? 0) + 1 });
  }

  const watched = rows("watched.csv");
  const perDay = new Map<string, number>();
  for (const row of watched) if (row.Date) perDay.set(row.Date, (perDay.get(row.Date) ?? 0) + 1);

  const films = new Map<string, RawFilm>();
  for (const [name, list] of [["watched.csv", watched], ["ratings.csv", rows("ratings.csv")]] as const) {
    for (const row of list) {
      const k = key(row);
      if (!k) continue;
      const prev = films.get(k.id);
      const rating = Number.parseFloat(row.Rating ?? "");
      const stars = rating >= 0.5 && rating <= 5 ? rating : (prev?.stars ?? null);
      // Without a diary entry, a watched.csv date counts only if it wasn't a bulk-import day.
      const logged = name === "watched.csv" && isDate(row.Date) && perDay.get(row.Date!)! < BULK_DAY ? row.Date! : null;
      const d = diary.get(k.id);
      films.set(k.id, {
        id: k.id,
        title: k.title,
        year: Number.parseInt(row.Year ?? "", 10) || 0,
        stars,
        watched: d?.watched ?? prev?.watched ?? logged,
        views: d?.views ?? 0,
      });
    }
  }
  return [...films.values()];
}
