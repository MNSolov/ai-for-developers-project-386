# Feature-Sliced Design for the Next.js client

The client is a Next.js App Router app that will grow from a landing page into a booking domain, and its structure must scale with it. We adopt Feature-Sliced Design v2.1 with its official Next.js adaptation: Next's `app/` stays at the client root as pure routing — thin `page.tsx` files re-exporting screens — while the FSD layers live in `src/` (`_pages`, `widgets`, `shared` today; `_app`, `features`, `entities` created lazily when first needed), with the `@/*` alias mapping to `./src/*`.

The `app` and `pages` layers carry an underscore prefix (`_app`, `_pages`) because Next.js treats both root- and `src/`-level `app`/`pages` directories as routing (verified against the bundled Next.js 16.4.6 docs) — a literal `src/pages` layer would register every slice file as a route.

Import rules are enforced by dependency-cruiser in `mise run check` and CI, not just prose: imports flow only downward across layers, slices never import each other within a layer, and a slice is imported only through its public API (`index.ts`) — deep imports are forbidden. The cruise target grows from `app` to `app` + `src`, with `options.tsConfig` added so `@/*` resolves.

## Considered options

- **Default Next.js colocation** (everything inside `app/` segments): rejected — the structure rots as the booking domain lands.
- **`src/pages` with canonical FSD names**: rejected — collides with the Pages Router directory convention (see above).
- **Renaming the layer to `screens`/`views`**: rejected — deviates from the official FSD vocabulary; the guide's `_pages` prefix is linter-compatible and keeps the canon.
- **steiger (the official FSD linter)**: rejected — dependency-cruiser is already wired into the gate; one architecture linter is enough.

## Consequences

Every slice carries an `index.ts` public API from day one. The dependency-cruiser config must grow whenever a layer is added. The structure is heavier than two screens need — it is bought for the booking domain arriving next, and so that the rule exists before the code that must follow it.
