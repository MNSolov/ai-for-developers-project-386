# AGENTS.md

Rules for working in this repository — a booking service in two apps: the NestJS API in `api/` and the Next.js client in `client/`. The apps carry their own rules — read `api/AGENTS.md` before touching the API and `client/AGENTS.md` before touching the client. This file applies to everything, including the root tooling.

## First run on a fresh clone

1. `mise install` — installs the pinned toolchain from `mise.toml`: node, hk, jactionlint, betterleaks, osv-scanner, typos, shellcheck, agnix.
2. `npm install` in the repo root, then in `api/` and `client/` — each of the three is a self-contained npm project. The two apps join this repository separately, so a given commit may contain either, both, or neither: the gates below install and check them only when their files are present, and skip otherwise.
3. `hk install --mise` — registers this repository's git hooks through mise.

Run tools through mise (`mise run <task>`, `mise exec -- <cmd>`) so the pinned Node is used, not whatever the shell has on PATH.

## The quality gate

`mise run check` must exit 0 before any change counts as done. It runs the same gates as CI:

- secrets (betterleaks), typos, and GitHub Actions workflow lint (jactionlint, including dependabot.yml);
- lint and format for `api/` (oxlint, prettier) and `client/` (eslint, prettier);
- per app: typecheck, unused code and dependencies (knip), architecture rules (dependency-cruiser), unit tests;
- agent-rules quality (agnix) over every AGENTS.md.

`mise run fix` applies the safe autofixes (formatters, linter `--fix`) — run it before committing. `mise run vuln` scans every lockfile against the OSV vulnerability database; it needs network access, so it is a separate task that CI runs on every push, every pull request, and weekly.

The api e2e suite (`npm run test:e2e` in `api/`) and the launch smoke suites (`npm run test:smoke` in both `api/` and `client/`) are CI-only tiers (hk profile `ci`): the smoke suites build the production artifact, boot it on an ephemeral port (`node dist/main` for the api, `next start` for the client), and require the first HTTP request to be answered. Run them manually whenever you change request handling, auth, persistence, or anything on the startup path (bootstrap, build configuration, launch wiring).

In `api/`, the three test tiers are split by filename and vitest config: unit `*.spec.ts` (default config), e2e `*.e2e-spec.ts` (`vitest.config.e2e.ts`), launch smoke `*.smoke-spec.ts` (`vitest.config.smoke.ts`). To run one suite directly, pass the matching `--config` — e.g. `npx vitest run --config ./vitest.config.e2e.ts test/app.e2e-spec.ts` — otherwise vitest finds no tests. The smoke config also expects `npm run build` to have run (`npm run test:smoke` does both).

Git hooks: `pre-commit` runs the fast checks with autofix on staged files, `pre-push` re-runs everything except the e2e and launch-smoke suites, `commit-msg` validates the message.

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

## Agent skills

### Named skills

When the user names a skill that is not in the available-skills list, read `~/.config/opencode/skills/<name>/SKILL.md` and follow it as named instead of substituting a similar one.

### Issue tracker

Issues live in GitHub Issues, managed through the `gh` CLI. See `docs/agents/issue-tracker.md`.

### Triage labels

The five canonical triage roles use their default label strings. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: one `GLOSSARY.md` and one `docs/adr/` at the repo root. See `docs/agents/domain.md`.
