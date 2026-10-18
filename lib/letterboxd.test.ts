import JSZip from "jszip";
import { expect, it } from "vitest";
import { parseExport } from "./letterboxd";

const watched = "Date,Name,Year,Letterboxd URI\n2024-01-01,Heat,1995,https://boxd.it/a\n2024-01-02,\"Up, Up\",2009,https://boxd.it/b\n";
const ratings = "Date,Name,Year,Letterboxd URI,Rating\n2024-01-01,Heat,1995,https://boxd.it/a,4.5\n";

it("merges watched and ratings from a zip", async () => {
  const zip = new JSZip();
  zip.file("watched.csv", watched);
  zip.file("ratings.csv", ratings);
  const blob = await zip.generateAsync({ type: "uint8array" });
  const films = await parseExport([new File([blob], "letterboxd-export.zip")]);
  expect(films.map((f) => [f.title, f.year, f.stars])).toEqual([
    ["Heat", 1995, 4.5],
    ["Up, Up", 2009, null],
  ]);
});

it("rejects uploads without the expected CSVs", async () => {
  await expect(parseExport([new File(["x"], "diary.csv")])).rejects.toThrow(/watched.csv/);
});
