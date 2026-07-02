# Content Catalog (BBR-1145 · contract locked in BBR-1176)

Backend for the core content catalog: public list/filter, unified search,
detail, authenticated authoring CRUD, and admin content management. Covers
screens SCR-004 (search), SCR-005 (list), SCR-006 (detail), SCR-009
(create/edit), and SCR-013 (Admin content management).

## ✅ Locked contract

The canonical `ContentItem` entity is **frozen** per
[BBR-1144#document-entity-contract](/BBR/issues/BBR-1144#document-entity-contract)
and the schema-alignment follow-up
[BBR-1175#document-schema-alignment](/BBR/issues/BBR-1175#document-schema-alignment).
The earlier provisional v0 (medical-guide entity with `slug`/`summary`,
a category tree, and a `draft → pending_review → published → archived/rejected`
approval workflow) has been removed. The locked shape:

- **`status`** is exactly `draft | published | hidden`. `pending_review`,
  `archived` and `rejected` are **not** statuses.
- **`reported`** is derived from `reportCount > 0` (report metadata, not a
  status); **`deleted`** is derived from `deletedAt` (soft delete, not a status).
- **`category`** is the fixed enum `notice | free | qna` (`notice` is
  admin-authored only). Disease/condition taxonomy is the orthogonal
  `conditionTags` facet.
- Detail is addressed by **id** — there is no slug and no category tree.

## Architecture

Mirrors the `doctor-verification` feature and the shared HTTP/RBAC layer:

```
features/content-catalog/
  types.ts            domain types (ContentItem, queries, status/category enums)
  errors.ts           typed ContentError (code + HTTP status)
  validation.ts       zod boundary schemas
  state-machine.ts    pure publish-transition helper (isPublishing)
  ports.ts            repository / clock / id interfaces
  service.ts          ContentService (all business rules)
  schema.ts           Drizzle table (content_items) + status/category enums
  drizzle-repository.ts  Postgres-backed repository
  factory.ts          lazy runtime wiring (getContentService)
  openapi.ts          OpenAPI fragment (paths + components)
  testing/in-memory.ts   in-memory repo + deterministic clock/id for tests
http/controllers/content.controller.ts        public + member handlers
http/controllers/admin-content.controller.ts  admin handlers
http/routes/content.routes.ts                  /content router
http/routes/admin-content.routes.ts            /admin/content router
drizzle/migrations/0002_content_catalog.sql    hand-written idempotent migration
```

The service depends only on ports, so it is unit-tested with in-memory fakes and
swaps to Drizzle/Postgres in production without code changes.

## Endpoints (mounted under `/api/v1`)

| Method | Path                          | Access | Purpose |
| ------ | ----------------------------- | ------ | ------- |
| GET    | `/content`                    | public | List published (filter: category/conditionTag, sort, page) |
| GET    | `/content/search?q=`          | public | Unified search over published content |
| GET    | `/content/mine`               | member | My content across all statuses |
| GET    | `/content/:id`                | public | Detail by id (published, or own/admin) |
| POST   | `/content`                    | member (`content.create`) | Create draft (`notice` → admin only) |
| PATCH  | `/content/:id`                | member (`content.update.own`) | Update own |
| DELETE | `/content/:id`                | member (`content.delete.own`) | Soft delete own |
| GET    | `/admin/content`              | admin (`admin.content.moderate`) | List all statuses (report/deleted filters) |
| GET    | `/admin/content/:id`          | admin  | Any item |
| PATCH  | `/admin/content/:id`          | admin  | Edit any item |
| POST   | `/admin/content/:id/status`   | admin  | Moderate (publish / hide / unpublish) |
| POST   | `/admin/content/:id/restore`  | admin  | Restore a soft-deleted item |
| DELETE | `/admin/content/:id?hard=`    | admin  | Soft delete (or hard purge) |

Response envelope matches the rest of the server: `{ ok, data, meta? }` on
success, `{ ok: false, error: { code, message, details? } }` on failure.

## Status model

`draft | published | hidden` are free statuses — an admin publishes, hides or
unpublishes directly; there is no multi-step approval machine to gate. The only
lifecycle rule is that the **first** entry into `published` stamps `publishedAt`
(`isPublishing`, enforced in the service). Removal is a soft delete via
`deletedAt` (admin `restore` clears it); `hard=true` purges the row.

## Integration points

- **Auth / membership (BBR-1121):** authorization uses the shared RBAC
  permissions (`content.read/create/update.own/delete.own`,
  `admin.content.moderate`) and `req.principal`. `authorId` references the
  better-auth `user` id.
- **Base router (BBR-1117):** feature routers are additively mounted in
  `http/app.ts`. Schema is colocated in the feature (like doctor-verification);
  the migration is hand-written and idempotent.

## Local verification

```bash
pnpm --filter @aiga/server typecheck
pnpm --filter @aiga/server test    # in-memory, no database required
```
