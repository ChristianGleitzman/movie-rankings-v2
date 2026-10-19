# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

One person, the owner (a Letterboxd user), ranking every film they have ever logged. Used equally on a phone (quick couch sessions, thumbs) and a laptop (longer sessions, keyboard).

## Product Purpose

Turn a whole Letterboxd history into a personal ranking through head-to-head duels, then show where that ranking disagrees with the star ratings the user gave. Success: the user can keep dueling through hundreds of films without fatigue or guesswork, and the final ranking feels true.

## Positioning

Ranking by pairwise preference (Elo), seeded from the user's own stars, and translated back into stars that match the user's own rating habits, so the disagreement between "what I rated" and "what I prefer" is the payoff.

## Operating Context

- Input is the official Letterboxd data export (.zip, or watched.csv / ratings.csv / diary.csv). The Letterboxd API is private.
- The history spans many years. Recent years carry dated diary entries; older films were often bulk-added with no real watch date. Memory of old, once-watched films is weak.
- Some matchups are genuinely too close or involve a film the user cannot remember.

## Capabilities and Constraints

- Duels: pick a winner (click or ← / →), call it too close (draw), mark a film as not remembered, skip, undo the last pick.
- Matchups favour recently watched films; old or undated films come up less often but still come up.
- Each film card carries its watch history when known (last watched, rewatches) as a memory jog.
- Ranking: a Bradley-Terry model fitted from the full duel log, with priors from the user's own star distribution. It shows rank with a likely range, own stars, stars from the ranking (Your habits, Balanced or Crowd scale), the crowd rating, a verdict, hot takes, search, filters and sorting.
- Matchmaking is active learning: uncertain films against close opponents, weighted by memory freshness, with recently shown films rested.
- All data stays in the browser (localStorage). Posters and crowd ratings (TMDB audience averages, labelled as TMDB, never as Letterboxd) come through a server proxy when a token is configured. The app must look and work complete without them.
- The user mostly watches films they expect to like, so a star scale that assumes a full spread of quality would be unfair. The Balanced scale exists for that reason.
- Re-importing a newer export keeps duel progress.

## Evidence on Hand

Only the user's own export. No testimonials, user counts, or other claims exist; do not invent any.

## Product Principles

1. Never force a guess: every hard choice has an honest exit.
2. Memory is part of the data: when and how often a film was watched matters.
3. The disagreement between stars and rank is the payoff, so make it legible.
4. Private by default: nothing leaves the browser except poster lookups.
