# Core Infra & Base Binding — BBR-1117

> Shared infra record for **Aiga Sample 02**
> Product Builder build: `pb-4a150507-1077-4741-b040-7934bf5b3a94`
> Role: `shared` · Decision: `EXTEND` · Depends on: none

This document is the durable **base clone binding** record: what the base is,
where it came from, what capabilities it provides, and how it is deployed. It is
maintained by the shared infra task (BBR-1117) and consumed by every downstream
feature and screen issue.

---

## 1. Base binding

| Field | Value |
| --- | --- |
| Repository | `https://github.com/jisu-bbrightcode/aiga-sample-02.git` |
| Branch | `main` |
| Base template | `product-builder-base` (materialized into this workspace) |
| Frontend base | Vite 8 + React 19 + React Router 7 + Vitest 4 SPA |
| Backend base | `apps/server` — Express + Drizzle ORM + better-auth (TypeScript, ESM, hexagonal per-feature) |
| Frontend base binding commit | `7b9e687` — feat(infra): frontend base + shared infra baseline (BBR-1117) |
| Backend base | committed across BBR-1169 (shared server wiring) + feature-BE commits on `main` |
| Integration model | local `main` is the integration branch; push + release tag owned by BBR-1165 |

> **Note on `product-builder-base`:** the upstream template repo is **not
> reachable as a clonable git remote** from this workspace (private / not
> exposed). The equivalent base was materialized directly into the project
> primary workspace. The "clone binding" is therefore recorded here against the
> materialized tree rather than a fetched upstream ref.

---

## 2. Materialized structure

```
/                      Vite SPA (public app + admin route subtree)
  index.html
  vite.config.ts
  src/                 App.tsx, main.tsx, auth.ts, adminData.ts, styles.css, tests
  vercel.json          public app deploy target (this task)
  .env.example         env-var mapping owned by this task (BBR-1117)
apps/server/           REST API — Express + Drizzle + better-auth
  src/db/schema/       auth, profiles, rbac, content, categories, enums (Drizzle)
  src/db/client.ts     Neon/pg client
  drizzle.config.ts    migration pipeline config
  drizzle/migrations/  SQL migrations (feature-BE agents append here)
  src/http/middleware/ session, entitlement (authz), error
  src/rbac/            permissions, matrix, entitlement
  src/membership/      3-tier membership tiers + policy
  src/features/*       per-feature hexagonal modules (owned by feature issues)
docs/infra/            this record
```

> The tree is **actively co-authored**: feature-BE stage issues (e.g. BBR-1127
> Doctor Verification, BBR-1121 Auth/Membership) write into `apps/server`
> concurrently. See §5.

---

## 3. Deliverable mapping (BBR-1117 scope)

| Deliverable | Location | Status |
| --- | --- | --- |
| product-builder-base clone binding + branch/ref/commit + capability check | this doc, §1/§4 | recorded; commit pending (§5) |
| Neon (PostgreSQL) + Drizzle baseline + migration pipeline | `apps/server/src/db/*`, `drizzle.config.ts`, `drizzle/migrations/` | present (materialized by concurrent BE work); baseline `0000` migration + green typecheck pending |
| REST + OpenAPI common config, auth/authz common middleware | `apps/server/src/http/middleware/*`, `src/auth/better-auth.ts`, `src/rbac/*`, feature `openapi.ts` | present; not yet green (§4) |
| Vercel deploy target (public app + admin) + env-var mapping | `vercel.json`, `.env.example` | **done (this task)** |

---

## 4. Capability verification (snapshot)

Re-run before release (BBR-1165). Frontend + shared infra verified green at
BBR-1117 baseline-commit time; backend has its own suites owned by feature-BE.

| Capability | Command | Result |
| --- | --- | --- |
| SPA production build | `npm run build` | ✅ `tsc -b` + `vite build` (1774 modules, `dist/` emitted) |
| SPA unit tests (App Shell acceptance spec) | `npm test` | ✅ 3/3 passing (BBR-1118 App Shell green); Vitest scoped to `src/**` |
| Server typecheck | `cd apps/server && npm run typecheck` | 🟡 owned by feature-BE issues; had strict-null WIP errors mid-materialization |
| Server tests | `cd apps/server && npm test` | 🟡 `node --test` suite owned by feature-BE (glob `test/**` vs `src/features/**` is a server-side concern) |
| Drizzle migrations | `apps/server/drizzle/migrations/` | ✅ feature migrations committed (auth-membership, doctor-verification, content, community) on `main` |

**Interpretation:** the **frontend base + shared infra** (this task's ownership)
is bound, committed, and green. Backend capability (typecheck/test parity) is
owned by the feature-BE issues that authored `apps/server`, and is validated by
the product integration QA (BBR-1164) before release (BBR-1165).

---

## 5. Blocking condition — RESOLVED

**Original blocker:** BBR-1117 lands before feature issues, but multiple
feature-BE stage agents wrote shared infra (`apps/server/**`) concurrently into
the same non-isolated, uncommitted project-primary workspace, so a safe
committed/verified baseline couldn't be produced mid-churn.

**Resolution (board decision `isolate`, 2026-07-02):** per-issue
worktree/checkout, shared infra merged via PR, and a **single baseline-commit
owner** (BBR-1117). By resolution time the feature-BE agents had quiesced and
committed their `apps/server` work to local `main` (see `git log`). BBR-1117
then committed the remaining uncommitted foundation — the **frontend base +
shared root infra** (`vite`/`tsc` config, `.gitignore`, `.env.example`,
`vercel.json`, this record) — as the base binding commit, after verifying the
SPA builds and its App Shell spec passes.

**Integration/push:** local `main` is the integration branch; the 11 backend
commits + this baseline commit remain local (origin has no branches yet). Pushing
`main` and tagging the release is owned by **BBR-1165 (통합 Release)** and product
integration QA by **BBR-1164** — intentionally out of scope for BBR-1117.

---

## 6. Environment variable mapping

Canonical keys live in `/.env.example`. Configure the same keys in the Vercel
project (public app) and the server host:

| Key | Consumer | Notes |
| --- | --- | --- |
| `DATABASE_URL` | server (runtime) | Neon **pooled** (`-pooler`) URL |
| `DIRECT_DATABASE_URL` | drizzle-kit | Neon **direct** URL for migrations |
| `BETTER_AUTH_SECRET` | server | 32+ char random secret |
| `BETTER_AUTH_URL` | server | canonical auth origin |
| `CORS_ORIGINS` | server | public app + admin origins |
| `NEXT_PUBLIC_API_BASE_URL` / `NEXT_PUBLIC_APP_URL` | public app | client → API base |
| `NEXT_PUBLIC_ADMIN_API_BASE_URL` / `NEXT_PUBLIC_ADMIN_URL` | admin subtree | client → API base |

---

## 7. Reconciliation note (structure deviation)

The issue text lists `apps/server`, `apps/admin`, `apps/app` as three clone
targets. The materialized base is a **single Vite SPA** (public app + admin as a
`/admin` route subtree, per `src/adminData.ts` and `vercel.json`) plus a single
`apps/server` backend — not three separate deployables. The single-SPA shape is
treated as canonical because it is what actually materialized and what the
seeded App Shell / Admin Shell specs (BBR-1118 / BBR-1119) build against.
`vercel.json` reflects this: one static SPA deploy serving `/` and `/admin`,
with `/api/*` reserved for the backend target.
