# Review & Rating (리뷰/평점) — BBR-1139

Backend feature module for member reviews and star ratings of member **profiles**.

## Scope & rules

- **Authorship: 의사인증회원 only.** Only `verified_doctor`-tier members may write
  reviews. Enforced at the edge (`requireTier('verified_doctor')`) and again in
  the service (`NOT_DOCTOR_VERIFIED`) as defense-in-depth.
- **전문가 뱃지.** Reviews are surfaced with the author's live profile badge
  (`isExpert` / `expertBadge` / `specialty`), read from `profiles`.
- **본인 프로필 제외.** A member cannot review their own profile
  (`SELF_REVIEW_FORBIDDEN`, plus a DB `CHECK (author_id <> target_user_id)`).
- **One active review per (author, target).** Enforced by a partial unique index;
  re-submitting is a `DUPLICATE_REVIEW` conflict — edit the existing review
  instead. After a soft-delete the author may review the target again.
- **Ratings** are integers 1..5 (`CHECK`). Aggregation (average / count / star
  distribution) is computed over `status = 'active'` rows only.
- **Deletes are soft** (`status = 'deleted'`, `deleted_at` set) so aggregates stay
  correct and history is retained for moderation/audit.

> Policy note: the shared RBAC matrix (`rbac/matrix.ts`) also grants the generic
> `review.create` permission to the `member` tier. This feature's explicit scope
> narrows *this* review type to verified doctors via `REVIEW_AUTHOR_TIER`. If the
> product later wants member-authored reviews, relax that constant — the RBAC
> permission is already present.

## API

| Method | Path | Access | Purpose |
| ------ | ---- | ------ | ------- |
| `GET` | `/profiles/:targetUserId/reviews` | public | List active reviews (sort: `recent` \| `rating_desc` \| `rating_asc`) |
| `GET` | `/profiles/:targetUserId/reviews/summary` | public | Rating aggregation (average / count / distribution) |
| `GET` | `/reviews/:id` | public | Single review |
| `POST` | `/profiles/:targetUserId/reviews` | verified_doctor | Create a review |
| `PATCH` | `/reviews/:id` | member (author) | Edit own review |
| `DELETE` | `/reviews/:id` | member (author) / admin | Soft-delete |

OpenAPI fragments: `reviewRatingPaths` / `reviewRatingComponents` (`openapi.ts`).

## Architecture (ports & adapters)

- `types.ts` — immutable domain types (`Review`, `ReviewView`, `RatingSummary`).
- `ports.ts` — `ReviewRepository` (persistence) + `MembershipReader` (tier/badge reads).
- `service.ts` — use-case orchestration; depends only on ports.
- `validation.ts` — zod boundary schemas.
- `controller.ts` — framework-agnostic handlers (`{ status, body }`) + error mapping.
- `routes.ts` — declarative route table (`RouteDef`).
- `http.ts` — Express wiring: `createReviewRatingRouter()` (mounted by the base
  router, BBR-1117).
- `schema.ts` — Drizzle table (`reviews`), re-exported from `db/schema/index.ts`.
- `drizzle-repository.ts` — Drizzle adapters (`DrizzleReviewRepository`,
  `DrizzleMembershipReader`).
- `testing/in-memory.ts` — in-memory fakes for unit tests / local dev.

## Migration

`drizzle/migrations/0002_review_rating.sql` — additive, idempotent; requires the
`user` table (BBR-1121).

## Tests

`apps/server/test/review-rating.test.ts` — run with:

```bash
cd apps/server && node --import tsx --test test/review-rating.test.ts
```

Covers authorship gating, self-review exclusion, target existence, dedupe,
edit/delete ownership (incl. admin delete), soft-delete effects on reads &
aggregation, rating summary math, sorting, and controller error→HTTP mapping.
