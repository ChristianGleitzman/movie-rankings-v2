import JSZip from "jszip";
import Papa from "papaparse";
import { seed, type Film } from "./rank";

type Row = { Name?: string; Year?: string; Rating?: string };

const CSVS = ["watched.csv", "ratings.csv"];

// Accepts the Letterboxd export .zip, or watched.csv / ratings.csv picked directly.
export async function parseExport(files: File[]): Promise<Film[]> {
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
  if (!Object.keys(texts).length) throw new Error("No watched.csv or ratings.csv found in that upload.");

  const films = new Map<string, Omit<Film, "elo" | "games">>();
  for (const name of CSVS) {
    if (!texts[name]) continue;
    const { data } = Papa.parse<Row>(texts[name], { header: true, skipEmptyLines: true });
    for (const row of data) {
      const title = row.Name?.trim();
      if (!title) continue;
      const year = Number.parseInt(row.Year ?? "", 10) || 0;
      const rating = Number.parseFloat(row.Rating ?? "");
      const id = `${title}|${year}`;
      const stars = rating >= 0.5 && rating <= 5 ? rating : (films.get(id)?.stars ?? null);
      films.set(id, { id, title, year, stars });
    }
  }
  return seed([...films.values()]);
}
