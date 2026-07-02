# Content Catalog (BBR-1145)

Backend for the core content catalog: public list/filter/category, unified
search, detail, authenticated authoring CRUD, and admin content management.
Covers screens SCR-004 (search), SCR-005 (list), SCR-006 (detail), SCR-009
(create/edit), and SCR-013 (Admin content management).

## ⚠️ Provisional contract

The canonical content entity was **UNDECIDED** in the schema definition when
this stage ran (see BBR-1145 scope). This module ships a documented **v0**
entity derived from the product's admin sample (medical guides/articles with an
approval workflow) and the shared RBAC permission catalog. Field names and the
status machine should be confirmed via the entity-confirmation follow-up before
the contract is frozen. Everything here is additive and isolated, so refining
the entity is a localized change.

## Architecture

Mirrors the `doctor-verification` feature and the shared HTTP/RBAC layer:

```
features/content-catalog/
  types.ts            domain types (Content, Category, queries)
  errors.ts           typed ContentError (code + HTTP status)
  validation.ts       zod boundary schemas
  state-machine.ts    pure content-status transition rules
  slug.ts             slug helpers
  ports.ts            repository / clock / id interfaces
  service.ts          ContentService + CategoryService (all business rules)
  schema.ts           Drizzle tables (content_items, content_categories, enum)
  drizzle-repository.ts  Postgres-backed repositories
  factory.ts          lazy runtime wiring (getContentService/getCategoryService)
  openapi.ts          OpenAPI fragment (paths + components)
  testing/in-memory.ts   in-memory repos + deterministic clock/id for tests
http/controllers/content.controller.ts        public + member handlers
http/controllers/admin-content.controller.ts  admin handlers
http/controllers/categories.controller.ts     public category list
http/routes/content.routes.ts                  /content, /categories routers
http/routes/admin-content.routes.ts            /admin/content, /admin/categories
drizzle/migrations/0002_content_catalog.sql    hand-written idempotent migration
```

The service depends only on ports, so it is unit-tested with in-memory fakes and
swaps to Drizzle/Postgres in production without code changes.

## Endpoints (mounted under `/api/v1`)

| Method | Path                          | Access | Purpose |
| ------ | ----------------------------- | ------ | ------- |
| GET    | `/content`                    | public | List published (filter: category/tag, sort, page) |
| GET    | `/content/search?q=`          | public | Unified search over published content |
| GET    | `/content/mine`               | member | My content across all statuses |
| GET    | `/content/:id`                | public | Detail by id or slug (published, or own/admin) |
| POST   | `/content`                    | member (`content.create`) | Create draft |
| PATCH  | `/content/:id`                | member (`content.update.own`) | Update own |
| POST   | `/content/:id/submit`         | member | Submit for moderation |
| DELETE | `/content/:id`                | member (`content.delete.own`) | Soft delete own |
| GET    | `/categories`                 | public | Category list |
| GET    | `/admin/content`              | admin (`admin.content.moderate`) | List all statuses |
| GET    | `/admin/content/:id`          | admin  | Any item |
| PATCH  | `/admin/content/:id`          | admin  | Edit any item |
| POST   | `/admin/content/:id/status`   | admin  | Moderate (publish/reject/archive/…) |
| DELETE | `/admin/content/:id?hard=`    | admin  | Soft delete (or hard purge) |
| POST   | `/admin/categories`           | admin  | Create category |
| PATCH  | `/admin/categories/:id`       | admin  | Update category |
| DELETE | `/admin/categories/:id`       | admin  | Delete category |

Response envelope matches the rest of the server: `{ ok, data, meta? }` on
success, `{ ok: false, error: { code, message, details? } }` on failure.

## Status machine

`draft → pending_review → published`, with `rejected`, `archived` moderation
states and controlled restores. Enforced in the service, not the HTTP layer.
Entering `published` for the first time stamps `publishedAt`.

## Integration points

- **Auth / membership (BBR-1121):** authorization uses the shared RBAC
  permissions (`content.read/create/update.own/delete.own`,
  `admin.content.moderate`) and `req.principal`. `authorId` references the
  better-auth `user` id.
- **Base router (BBR-1117):** feature routers are additively mounted in
  `http/app.ts`; move to the central feature-router wiring if/when BBR-1117
  provides one. Schema is colocated in the feature (like doctor-verification);
  the migration is hand-written and idempotent.

## Local verification

```bash
pnpm --filter @aiga/server typecheck
pnpm --filter @aiga/server test    # in-memory, no database required
```
