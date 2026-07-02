# Community (커뮤니티/게시글/댓글/반응)

Community backend for the 모두의사수 platform: posts, comments, reactions, admin
content-moderation, and a grade-based daily post-view limit. Ported into the
product stack (Express + Drizzle + better-auth, hexagonal per-feature) from the
community BE that originally shipped against the wrong repo/stack (BBR-1133 /
`aiga-sample-01` PR #131). Tracked by **BBR-1168**; QA contract is **BBR-1134**.

## Layout (hexagonal)

| File | Responsibility |
|------|----------------|
| `types.ts` | Domain types (Post/Comment/Reaction/Moderation/ViewLimit), immutable. |
| `errors.ts` | Typed `CommunityError` (stable code + HTTP status). |
| `ports.ts` | Repository + membership + clock/id ports (the persistence seam). |
| `validation.ts` | Zod boundary schemas for every request body/query. |
| `guards.ts` | Shared participation / admin / ownership guards + view bucket key. |
| `author.ts` | Author-badge (전문가 뱃지) enrichment. |
| `view-limit-service.ts` | `PostViewLimiter` — 등급별 열람 일일 제한 (24h rolling window). |
| `post-service.ts` | Post CRUD, detail-view + limit, admin pin/lock/remove/restore/crosspost. |
| `comment-service.ts` | Comment CRUD + admin sticky/distinguish/remove. |
| `reaction-service.ts` | Idempotent cast/remove reactions. |
| `moderation-service.ts` | Admin sanctions / keyword-filters / content-moderation + audit. |
| `service.ts` | `createCommunityServices()` — composes the sub-services from ports. |
| `controller.ts` | Framework-agnostic `{ status, body }` handlers + error mapping. |
| `routes.ts` | Declarative `RouteDef` table (method/path/requiredRole/handler). |
| `http.ts` | `createCommunityRouter()` — Express factory + entitlement guards. |
| `schema.ts` | Drizzle tables (re-exported from `db/schema/index.ts`). |
| `drizzle-repository.ts` | Postgres adapters for every port. |
| `testing/in-memory.ts` | In-memory fakes + `MutableClock` for unit/contract tests. |
| `openapi.ts` | OpenAPI fragment merged into the root document. |

## Authorization model

- **Participation** (create post/comment/reaction) requires
  `resolvePolicy(tier).canParticipateCommunity` → guests get `403`
  (`PARTICIPATION_FORBIDDEN`). Enforced in the service so both the HTTP guard
  (`requireTier('member')`) and controller-level QA tests agree.
- **Ownership**: edit/delete of a post/comment requires author-or-admin
  (`FORBIDDEN` otherwise).
- **Moderation** (`/community/moderation/**`, post/comment `/moderation`) requires
  an admin actor (`admin.access`) via `requireAdmin()`; every action writes an
  immutable audit entry recording the acting admin (actor id).

## 등급별 게시글 열람 일일 제한 (daily view limit)

Detail views (`GET /community/posts/:id`) consume one unit per **distinct** post
in a rolling 24h bucket. Buckets are keyed by user id (authenticated) or client
IP (guests, `x-forwarded-for` first). Limits live in `membership/policy.ts`
(`dailyPostViewLimit`): guest `10`, member `50`, verified_doctor `null`
(unlimited). Re-viewing an already-counted post in-window is idempotent; the
`(N+1)`th distinct view returns `429 POST_VIEW_DAILY_LIMIT_EXCEEDED`.

## Wiring

Do **not** edit `app.ts`. The base router (BBR-1117) mounts the feature via the
exported factory:

```ts
import { createCommunityRouter } from "./features/community/index.js";
app.use("/api/v1/community", createCommunityRouter());
```

## Tests

```
cd apps/server
env -u NODE_PATH node --import tsx --test test/community.test.ts
```

Typecheck: `env -u NODE_PATH npx tsc -p tsconfig.json --noEmit`.
