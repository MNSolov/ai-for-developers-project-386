# AGENTS.md

<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## Feature-Sliced Design

The client follows Feature-Sliced Design v2.1 with the official Next.js adaptation (docs/adr/0001-fsd-for-the-nextjs-client.md):

- `app/` is routing only: thin `page.tsx` files re-export screens from `src/`; the root layout owns the document shell. No feature code lives in `app/`.
- FSD layers live in `src/`, top to bottom: `_pages` (screens), `widgets`, `shared` (ui, config). The `_app`, `features` and `entities` layers are created lazily when first needed; the `_` prefix keeps Next.js from treating those directories as routing.
- A slice is a folder under its layer, imported only through its public `index.ts`/`index.tsx`. Slices are single-module today (the code lives in the index file itself); when a slice grows real internals, amend `client/.dependency-cruiser.cjs` in the same change.
- The `@/*` alias maps to `./src/*`.

The import rules are enforced by dependency-cruiser in `mise run check`, not just prose: imports flow only downward across layers, slices never import each other within a layer, and a slice is imported only through its public index — deep imports fail the gate. Unit specs (`*.spec.tsx`, vitest + Testing Library per docs/adr/0002) are colocated inside slices, import their slice through the public index, and are exempt from the dev-dependency and cross-slice rules as test code.
