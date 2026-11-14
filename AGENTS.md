# AGENTS.md

Rules for working in this repository. The two apps carry their own rules — read `api/AGENTS.md` before touching the NestJS API and `client/AGENTS.md` before touching the Next.js client. This file applies to everything, including the root tooling.

## First run on a fresh clone

1. `mise install` — installs the pinned toolchain from `mise.toml`: node, hk, jactionlint, betterleaks, osv-scanner, typos, shellcheck, agnix.
2. `npm install` in the repo root, then in `api/` and `client/` — each of the three is a self-contained npm project.
3. `hk install --mise` — registers this repository's git hooks through mise.

Run tools through mise (`mise run <task>`, `mise exec -- <cmd>`) so the pinned Node is used, not whatever the shell has on PATH.

## The quality gate

`mise run check` must exit 0 before any change counts as done. It runs the same gates as CI:

- secrets (betterleaks), typos, and GitHub Actions workflow lint (jactionlint, including dependabot.yml);
- lint and format for `api/` (oxlint, prettier) and `client/` (eslint, prettier);
- per app: typecheck, unused code and dependencies (knip), architecture rules (dependency-cruiser), unit tests;
- agent-rules quality (agnix) over every AGENTS.md.

`mise run fix` applies the safe autofixes (formatters, linter `--fix`) — run it before committing. `mise run vuln` scans every lockfile against the OSV vulnerability database; it needs network access, so it is a separate task that CI runs on every push, every pull request, and weekly.

The api e2e suite (`npm run test:e2e` in `api/`) is a CI-only tier (hk profile `ci`): run it manually whenever you change request handling, auth, or persistence.

Git hooks: `pre-commit` runs the fast checks with autofix on staged files, `pre-push` re-runs everything except e2e, `commit-msg` validates the message.

## Commit messages

Conventional Commits, enforced by commitlint on every commit and over the whole PR range in CI: `feat: …`, `fix: …`, `chore: …`, `refactor: …`, `docs: …`, `test: …`. Plain messages such as `Add README.md` are rejected.

## Generated files are never hand-edited

- `client/.next/**`, `client/out/**`, `client/next-env.d.ts`, `api/dist/**` — build output.
- `package-lock.json` in the root, `api/` and `client/` — regenerate with npm, never patch by hand.
- The `nextjs-agent-rules` block in `client/AGENTS.md` — `next dev` rewrites it; commit it as it comes.
- `.github/workflows/hexlet-check.yml` — Hexlet-managed; do not delete, edit, or rename it. jactionlint exempts it automatically; every other file under `.github/` goes through the full lint.

## Lint rules, baselines and ignores

- Never disable a check or lint rule to make a violation go away. An exception must be narrow, reasoned in place, and approved by a human.
- Baselines only shrink, never grow. The standing exceptions are:
  - `osv-scanner.toml` — known vulnerabilities confined to dev-only dependency trees, each with a reason and an expiry (`effectiveUntil`). Do not extend, renew, or add entries without a human decision — fix or upgrade the dependency instead, and remove the entry in the same change.
  - `api/knip.jsonc` — `ignoreDependencies` for packages knip cannot see being used.
- When an ignored finding can be fixed or dropped, remove its entry as part of that change.
