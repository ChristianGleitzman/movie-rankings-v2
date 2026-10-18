import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: "Movie Rankings",
  description: "Rank your Letterboxd films head-to-head and see how it compares to your star ratings.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>
        <nav>
          <Link href="/">Import</Link>
          <Link href="/duel">Duel</Link>
          <Link href="/results">Results</Link>
        </nav>
        <main>{children}</main>
      </body>
    </html>
  );
}
