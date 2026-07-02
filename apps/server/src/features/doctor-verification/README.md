# Doctor License Verification (의사 면허 인증) — BE (BBR-1127)

Backend feature module for the doctor verification application & review flow.
Implemented as **additive source** under the conventional `apps/server` layout so
it drops into the `product-builder-base` monorepo once the base clone lands
(BBR-1117) without touching root config.

## Deliverables (issue → code)

| Deliverable (BBR-1127)                                   | Where                                                    |
| ------------------------------------------------------- | ------------------------------------------------------- |
| 인증 신청 데이터 모델 (신청자/면허·증빙/상태/처리이력) | `schema.ts`, `drizzle/migrations/0001_doctor_verification.sql` |
| 인증 신청 제출 API (일반회원)                           | `controller.ts#submit`, `service.ts#submit`             |
| 관리자 검수 API (승인/반려 + 사유)                      | `controller.ts#adminApprove/adminReject`, `service.ts`  |
| 승인 시 등급 상향 + 전문가 뱃지 (트랜잭션)              | `service.ts#approve` + `MembershipService` port + `DrizzleTransactor` |
| 인증 상태 조회 / 재신청 API                             | `controller.ts#myStatus/getOwn/reapply`                 |

REST + OpenAPI (`openapi.ts`), no tRPC — per the product Standard Stack.

## Architecture

Ports-and-adapters. The service depends only on interfaces (`ports.ts`), so it
is framework- and DB-agnostic and fully unit-tested with in-memory fakes.

```
http.ts              # Express router: mounts routes + entitlement middleware
  └─ controller.ts   # framework-agnostic { status, body } handlers + error mapping
       └─ service.ts # use cases + approval transaction orchestration
            ├─ state-machine.ts   # pure status transition guards
            └─ ports.ts           # Repository, MembershipService, Transactor, Clock
                 ├─ drizzle-repository.ts  # Drizzle adapters (Repository + Transactor)
                 ├─ membership.service.ts  # profiles tier + expert-badge upsert (BBR-1121)
                 └─ testing/in-memory.ts   # fakes for tests / local dev
```

### State machine

```
(none) ──submit──▶ pending ──approve──▶ approved (terminal)
                     │
                     └──reject(reason)──▶ rejected ──reapply──▶ pending
```

Invariant: at most one non-rejected application per applicant, enforced in DB by
a partial unique index (`dv_applications_one_active_per_applicant`) and guarded
in `state-machine.ts` before writes.

### Approval transaction

`service.approve` runs inside `Transactor.run`, which the Drizzle adapter maps to
`db.transaction`. Inside one transaction it: (1) marks the application approved,
(2) records the `approved` event, (3) calls `MembershipService.grantDoctorVerified`
(tier → 의사인증회원 + expert badge). Any failure rolls back the whole approval.

Membership is wired directly to the landed auth schema (BBR-1121):
`membership.service.ts` upserts the `profiles` row (tier → `verified_doctor`,
`isExpert` → true, `expertBadge`/`specialty`/`licenseNumber`/`licenseVerifiedAt`),
inside the approval transaction via `DrizzleTransactor.membershipFactory`.

## Wiring into the app (one-time, base owner)

The feature is self-contained; two small, additive hookups remain in
base-owned files (left to the base owner to avoid clobbering concurrent edits):

1. **Mount the router** in the Express app entrypoint:
   ```ts
   import { createDoctorVerificationRouter } from "./features/doctor-verification/http.js";
   app.use("/api", createDoctorVerificationRouter());
   ```
   (Routes rely on `attachPrincipal` + `express.json()` already being mounted.)
2. **Register schema + migration:** re-export `./features/doctor-verification/schema.js`
   from `db/schema/index.ts` so drizzle-kit sees the tables, and include
   `drizzle/migrations/0001_doctor_verification.sql` in the migrate step. The
   migration is idempotent (`IF NOT EXISTS` / guarded enums) and additive.
3. **OpenAPI (optional):** merge `doctorVerificationPaths` /
   `doctorVerificationComponents` into the root document generator.

`BBR-1128` (BE QA) is the downstream reviewer for this module.

## Privacy follow-up (open — from issue Scope)

> 개인정보 최소 수집·증빙 보관/삭제 정책 확정 필요 (follow-up).

Decisions baked in so far:
- **Minimization:** only license number, license name, optional specialty, and
  proof-document storage **references** are collected. No proof binaries are
  stored in Postgres (Vercel Blob keys only).
- **Access:** applicants can read only their own applications; admin routes are
  role-gated; error messages never echo PII.

Still to confirm with product/legal (tracked as a follow-up, not blocking this
module): proof-document **retention window**, deletion trigger on rejection vs.
account deletion, and whether license numbers should be encrypted at rest.

## Tests

`test/doctor-verification/{state-machine,service,controller}.test.ts` — 28 tests
(Node's built-in `node:test` runner, matching the base `npm test`) covering
transitions, the approval transaction (incl. rollback ordering + badge data
carry-through), re-application, ownership, admin listing/pagination, validation,
and error mapping. Run with `npm test` from `apps/server`.
