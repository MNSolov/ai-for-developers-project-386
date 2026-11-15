# Vitest and Testing Library as the client's unit-test tier

The client needs a fast, component-level test tier between "no tests" and its CI-only launch smoke suite (`scripts/smoke.mjs`). We run unit tests with vitest 4, @testing-library/react and jsdom, wired through @vitejs/plugin-react, with specs colocated as `*.spec.tsx` inside FSD slices; a `client-test` step in `hk.pkl` flows them into pre-push, `mise run check` and CI.

The blueprint is commit `7ed0bd7` — the reverted, intact setup — including `"type": "module"`, a `vitest.config.ts` with tsconfig-paths resolution for `@/*`, and the matching dependency-cruiser amendments (`options.tsConfig`; spec files excluded from `not-to-dev-dependencies`, since colocated specs are test code).

## Consequences

jsdom only — no real browser. If DOM fidelity ever becomes critical, adding a Playwright e2e tier is a separate future decision, not an extension of this one.
