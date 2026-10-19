import JSZip from "jszip";
import { expect, it } from "vitest";
import { parseExport } from "./letterboxd";

const watched = "Date,Name,Year,Letterboxd URI\n2024-01-01,Heat,1995,https://boxd.it/a\n2024-01-02,\"Up, Up\",2009,https://boxd.it/b\n";
const ratings = "Date,Name,Year,Letterboxd URI,Rating\n2024-01-01,Heat,1995,https://boxd.it/a,4.5\n";

it("merges watched and ratings from a zip", async () => {
  const zip = new JSZip();
  zip.file("watched.csv", watched);
  zip.file("ratings.csv", ratings);
  const blob = await zip.generateAsync({ type: "arraybuffer" });
  const films = await parseExport([new File([blob], "letterboxd-export.zip")]);
  expect(films.map((f) => [f.title, f.year, f.stars])).toEqual([
    ["Heat", 1995, 4.5],
    ["Up, Up", 2009, null],
  ]);
});

it("rejects uploads without the expected CSVs", async () => {
  await expect(parseExport([new File(["x"], "diary.csv")])).rejects.toThrow(/watched.csv/);
});

it("takes the last watch date and viewing count from the diary, ignoring bulk-import days", async () => {
  const bulk = Array.from({ length: 12 }, (_, i) => `2020-05-01,Old ${i},1980,u`).join("\n");
  const w = `Date,Name,Year,Letterboxd URI\n2024-01-01,Heat,1995,u\n2023-03-04,Up,2009,u\n${bulk}\n`;
  const diary =
    "Date,Name,Year,Letterboxd URI,Rating,Rewatch,Tags,Watched Date\n" +
    "2024-01-01,Heat,1995,u,4,,,2019-06-01\n2025-02-02,Heat,1995,u,4.5,Yes,,2025-02-01\n";
  const films = await parseExport([new File([w], "watched.csv"), new File([diary], "diary.csv")]);
  const by = Object.fromEntries(films.map((f) => [f.title, f]));
  expect([by.Heat.watched, by.Heat.views]).toEqual(["2025-02-01", 2]);
  expect([by.Up.watched, by.Up.views]).toEqual(["2023-03-04", 0]);
  expect(by["Old 0"].watched).toBeNull();
});
