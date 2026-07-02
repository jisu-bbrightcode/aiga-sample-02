# Auth · 3-tier Membership · Permissions — BE (BBR-1121)

Backend for the **AUTH-MEMBERSHIP** feature: better-auth email auth/session,
the 3-tier membership model (비회원 / 일반회원 / 의사인증회원), the permission
matrix + entitlement middleware, and the admin user-management API.

Decision was **EXTEND (executable)**: the `product-builder-base` reuse source
could not be verified at build time (PB-BASE-001), so this is a self-contained
implementation aligned to the shared `apps/server` layout, coexisting with the
sibling feature modules under `src/features/*`.

## Deliverables (issue → code)

| Deliverable (BBR-1121)                                   | Where                                                                 |
| -------------------------------------------------------- | --------------------------------------------------------------------- |
| better-auth 이메일 인증/세션 (users/sessions/accounts/verifications) | `auth/better-auth.ts`, `db/schema/auth.ts`                            |
| profiles 확장: 등급 + 전문가 뱃지 필드                    | `db/schema/profiles.ts`, `membership/tiers.ts`                        |
| 3단계 등급별 권한 매트릭스                                | `rbac/permissions.ts`, `rbac/matrix.ts`                               |
| entitlement 미들웨어                                     | `rbac/entitlement.ts`, `http/middleware/entitlement.ts`               |
| 회원가입/로그인/로그아웃/세션 조회 REST                   | `http/routes/auth.routes.ts`, `http/controllers/auth.controller.ts`   |
| 관리자 사용자 관리 API (목록/검색/상세/등급변경)          | `http/routes/admin-users.routes.ts`, `http/controllers/admin-users.controller.ts`, `services/users.service.ts` |
| 등급 정책 (공통 1회 정의 + 등급별 override) 적용 서비스   | `membership/policy.ts`, `services/membership.service.ts`              |

## Membership model

Three tiers, single source of truth in `membership/tiers.ts`:

| tier              | 라벨          | notes                                        |
| ----------------- | ------------- | -------------------------------------------- |
| `guest`           | 비회원        | implicit (no session / no profile row)       |
| `member`          | 일반회원      | default on registration                      |
| `verified_doctor` | 의사인증회원  | granted by doctor-verification approval       |

Permissions accumulate up the chain (a doctor inherits everything a member has).
Staff/admin permissions are an **orthogonal axis** granted via RBAC roles
(`db/schema/rbac.ts`), never via membership tier.

### Policy (등급 정책)

`membership/policy.ts` defines the common baseline **once** (`COMMON_POLICY`) and
each tier declares only its overrides (`TIER_OVERRIDES`); `resolvePolicy(tier)`
merges them into a frozen, complete policy.

## HTTP surface

- `POST /api/v1/auth/register` · `POST /api/v1/auth/login` · `POST /api/v1/auth/logout`
- `GET  /api/v1/auth/session` — enriched: user + tier + policy + effective permissions
- `GET  /api/v1/admin/users` — list/search (`q`, `tier`, `page`, `pageSize`)
- `GET  /api/v1/admin/users/:id` — detail incl. profile + roles
- `PATCH /api/v1/admin/users/:id/tier` — 등급변경
- `ALL  /api/auth/*` — canonical better-auth handler (cookie-correct), for clients

All responses use the `{ ok, data?, meta?, error? }` envelope.

## Integration contract (for BBR-1117 base router / sibling features)

1. **Entitlement per route.** Feature route tables declare
   `requiredRole: 'member' | 'admin'`; the base router applies
   `entitlementForRole(requiredRole)` (`http/middleware/entitlement.ts`). Finer
   checks are available via `requireTier(tier)` / `requirePermission(...keys)`.
2. **Session → principal.** `attachPrincipal` resolves the better-auth session
   into `req.principal` (guest or authenticated) for every request.
3. **Membership grants.** `services/membership.service.ts#grantDoctorVerified`
   (and `setTier`) accept a drizzle tx handle, so the doctor-verification
   approval (BBR-1127) upgrades tier + expert badge atomically. That feature's
   `MembershipService` port is satisfied structurally against the `profiles`
   schema defined here.

## Verification

- 18 pure-domain tests co-located as `src/**/*.test.ts` (policy resolution,
  permission-matrix inheritance, entitlement union, tier ordering). Run:
  `pnpm --filter @aiga/server test` (glob `src/**/*.test.ts`).
- Type safety: `tsc -p tsconfig.authmembership.json` (scoped to this module so it
  is not blocked by sibling features still in flight).

## Downstream

`BBR-1122` (BE QA — 인증/등급/권한) is the reviewer for this module.
