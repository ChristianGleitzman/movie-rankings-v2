# Movie Rankings v2

Rank the films you've logged on Letterboxd through head-to-head duels, then see where that ranking disagrees with your star ratings. Successor to [Movie-Rankings](https://github.com/ChristianGleitzman/Movie-Rankings).

## How it works

1. **Import.** On Letterboxd go to Settings → Data → Export your data and upload the `.zip`. The official Letterboxd API is private, so the app uses the export instead. Your data stays in your browser's localStorage.
2. **Duel.** Each film's Elo starts from its star rating, and unrated films start at 1500. Each duel pairs the least-compared film with one of its nearest Elo neighbours. K starts at 64 and decays to 16 as a film settles.
3. **Results.** "★ from rank" hands out stars in Elo order, matching how often you use each rating. Δ shows where your star rating and your ranking disagree, and unrated films get a predicted rating.

## Run

```bash
npm install
cp .env.example .env.local   # optional: add a TMDB read token for posters
npm run dev
npm test
```
