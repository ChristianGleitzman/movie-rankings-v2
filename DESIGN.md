# Design

World: **Marquee & Letterboard, restrained.** The bulb-lit marquee is the duel page's signature moment and appears nowhere else. Every other page uses a quiet header, normal-case sans type and plain rules. Letterboard caps are kept only for things that really are letterboards: the marquee, poster slates, the Favourites and Least favourite boards, and the drop zone. The app is dark only, because it's used in the evening on a couch or laptop.

## Stack

Tailwind CSS v4 with shadcn/ui (`base-nova` style, built on Base UI) and Phosphor icons, which are the only icon set. Tokens live in `app/globals.css`: the raw palette in `:root`, exposed to Tailwind through `@theme inline`, with shadcn's semantic tokens mapped onto the same palette. shadcn components in `components/ui/` are restyled, never used in their default state.

## Palette

| Token (Tailwind name) | Value | Role |
| --- | --- | --- |
| `felt` (`background`) | `#121110` | The single ground everywhere |
| `felt-2` (`card`) / `felt-3` (`muted`) | `#1a1816` / `#23201d` | Raised bills, controls, hover |
| `board` | `#0e0d0c` | Letterboard surfaces |
| `line` (`border`) / `line-2` (`input`) | `#2e2a26` / `#403a34` | Hairlines, input and key edges |
| `letter` (`foreground`) | `#f1ede3` | Push-in letter white, primary text |
| `dim` (`muted-foreground`) / `faint` | `#aaa398` / `#8a847a` | Secondary and tertiary text |
| `neon` (`ring`) / `neon-text` | `#2f74ff` / `#7aa8ff` | v1's blue, as a neon tube: focus, hover, the chosen bill, current page |
| `bulb` (`primary`) / `bulb-off` / `bulb-ink` | `#ffb534` / `#4a3b22` / `#1a1206` | Chase bulbs, board headings, stars, the primary button |
| `up` / `down` (`destructive`) | `#7fdca0` / `#ff8f7f` | Underrated / overrated, errors, delete |

## Type

- **Letters:** Big Shoulders 600/800 via `next/font` (`font-letters`, or the `letters` utility for uppercase plus tracking). Used for the marquee, page titles, poster slates, boards and the wordmark. Letterboard text carries `text-shadow-emboss`.
- **Body:** Archivo (`font-sans`) with tabular numerals, for film titles, nav, buttons, tables and metadata. Section headings are Archivo semibold at `text-xl`, not caps.

## Shapes

Buttons and chips are pills. Cards, boards and the marquee use a 14px radius (`rounded-lg`), posters 9px, and inputs 9px.

## Custom utilities and components

- `felt-board`: black felt with horizontal grooves. Only for things that really are letterboards (marquee, poster slate, boards, drop zone).
- `sweep`: the light sweep that means "still loading".
- `.marquee`: the felt band between two rows of bulbs. After every pick the bulbs chase briefly, the app's one authored motion.
- `.poster`: one fixed 2:3 frame with three layers, so nothing shifts as the poster loads. The letterboard title slate sits at the bottom. While the poster is looked up and downloaded, the title dims and a light sweep runs over it. Once loaded, the poster fades in on top. The next pair's posters load ahead of time while you decide on the current one.
- `.tube`: the neon underline marking the current page.

## Components

- **PageHeader / Stat / Notice** (`app/chrome.tsx`): the quiet header with a stats row for Ranking and Import, plus inline status messages.
- **Bill:** one film in a duel. Both bills are always the same size. Hovering or focusing lights the neon. After a pick, the chosen bill stays lit and the other dims for 220ms, then the next pair slides in.
- **Exits:** outline pill buttons with icons and key hints, separated from the bills by a rule. Undo sits on the opposite side from the others.
- **Board:** a top-10 or bottom-10 list set on the felt grooves.
- **Ranking list:** six columns (rank with its likely range, film, your rating, ranking says, crowd, verdict). Info tooltips on the headers explain each one. Stars are fixed-width meters so they can be compared down the column. The verdict is an up or down badge, left blank when your stars and ranking agree. On phones each row reflows: rank beside the title, then the three ratings stacked, with the verdict to the right.
- **Against the crowd:** two plain ruled lists of hot takes, deliberately not on felt.
- **Star scale toggle:** a segmented control (Your habits, Balanced, Crowd). Crowd-based options are disabled until TMDB data is available.
- **Delete my data:** a shadcn AlertDialog with a destructive button.

## Rules

- One ground (felt). No gradients, no glass, no cards on gray.
- Blue is reserved for interaction (neon). Amber is reserved for bulbs, stars and the single primary action.
- Motion: the bulb chase, the pick lock-in, the poster fade and the loading sweep. All of it stops under reduced motion.
