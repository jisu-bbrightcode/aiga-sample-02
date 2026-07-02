import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { RequestHandler } from "express";

import {
  ChangeTierSchema,
  ListQuerySchema,
} from "../../src/http/controllers/admin-users.controller.js";
import {
  requireAdmin,
  requirePermission,
} from "../../src/http/middleware/entitlement.js";
import { PERMISSIONS } from "../../src/rbac/permissions.js";
import { makeAdmin, makePrincipal, runGuards } from "./harness.js";

/**
 * 관리자 사용자 관리 API 권한/검색 테스트 — BE QA (BBR-1122).
 *
 * Two contracts for `/api/v1/admin/users`:
 *  1. 권한  — the exact route guard stack from `admin-users.routes.ts`
 *            (`requireAdmin()` + per-route `requirePermission(...)`).
 *  2. 검색  — the list-query / tier-change input validation the routes enforce
 *            (`ListQuerySchema`, `ChangeTierSchema`).
 */

const P = PERMISSIONS;

// The guard stacks exactly as composed in admin-users.routes.ts.
const LIST_STACK: RequestHandler[] = [
  requireAdmin(),
  requirePermission(P.adminUsersRead),
];
const DETAIL_STACK: RequestHandler[] = [
  requireAdmin(),
  requirePermission(P.adminUsersRead),
];
const CHANGE_TIER_STACK: RequestHandler[] = [
  requireAdmin(),
  requirePermission(P.adminUsersUpdate),
];

describe("admin users API — 권한 (authorization guard stack)", () => {
  it("rejects an anonymous caller with 401 on every route", () => {
    assert.equal(runGuards(LIST_STACK, null).status, 401);
    assert.equal(runGuards(DETAIL_STACK, null).status, 401);
    assert.equal(runGuards(CHANGE_TIER_STACK, null).status, 401);
  });

  it("rejects a plain member with 403 (no admin.access)", () => {
    const member = makePrincipal({ tier: "member" });
    assert.equal(runGuards(LIST_STACK, member).status, 403);
    assert.equal(runGuards(CHANGE_TIER_STACK, member).status, 403);
  });

  it("rejects a verified_doctor with 403 (membership never confers admin)", () => {
    const doctor = makePrincipal({ tier: "verified_doctor" });
    assert.equal(runGuards(LIST_STACK, doctor).status, 403);
  });

  it("rejects a principal that has read perms but lacks admin.access (defense in depth)", () => {
    // requireAdmin() runs first and must block even if a mis-seeded role
    // carries admin.users.read without admin.access.
    const partial = makeAdmin([P.adminUsersRead], "member");
    assert.equal(runGuards(LIST_STACK, partial).status, 403);
  });

  it("allows a read-only admin to list and read, but 403s on tier change", () => {
    const readAdmin = makeAdmin([P.adminAccess, P.adminUsersRead]);
    assert.equal(runGuards(LIST_STACK, readAdmin).passed, true);
    assert.equal(runGuards(DETAIL_STACK, readAdmin).passed, true);
    assert.equal(runGuards(CHANGE_TIER_STACK, readAdmin).status, 403);
  });

  it("allows a full admin (read + update) on every route", () => {
    const fullAdmin = makeAdmin([
      P.adminAccess,
      P.adminUsersRead,
      P.adminUsersUpdate,
    ]);
    assert.equal(runGuards(LIST_STACK, fullAdmin).passed, true);
    assert.equal(runGuards(DETAIL_STACK, fullAdmin).passed, true);
    assert.equal(runGuards(CHANGE_TIER_STACK, fullAdmin).passed, true);
  });
});

describe("admin users API — 검색 (list query validation)", () => {
  it("accepts and normalizes a full query (trims q, coerces numeric strings)", () => {
    const parsed = ListQuerySchema.parse({
      q: "  kim  ",
      tier: "verified_doctor",
      page: "2",
      pageSize: "50",
    });
    assert.equal(parsed.q, "kim");
    assert.equal(parsed.tier, "verified_doctor");
    assert.equal(parsed.page, 2);
    assert.equal(parsed.pageSize, 50);
  });

  it("treats every field as optional (empty query is valid)", () => {
    const parsed = ListQuerySchema.parse({});
    assert.deepEqual(parsed, {});
  });

  it("rejects a blank / whitespace-only search term", () => {
    assert.equal(ListQuerySchema.safeParse({ q: "" }).success, false);
    assert.equal(ListQuerySchema.safeParse({ q: "   " }).success, false);
  });

  it("only allows persisted profile tiers as a filter (guest is not filterable)", () => {
    assert.equal(ListQuerySchema.safeParse({ tier: "member" }).success, true);
    assert.equal(
      ListQuerySchema.safeParse({ tier: "verified_doctor" }).success,
      true,
    );
    assert.equal(ListQuerySchema.safeParse({ tier: "guest" }).success, false);
    assert.equal(ListQuerySchema.safeParse({ tier: "bogus" }).success, false);
  });

  it("enforces positive-integer paging bounds", () => {
    assert.equal(ListQuerySchema.safeParse({ page: "0" }).success, false);
    assert.equal(ListQuerySchema.safeParse({ page: "-1" }).success, false);
    assert.equal(ListQuerySchema.safeParse({ page: "1.5" }).success, false);
    assert.equal(ListQuerySchema.safeParse({ pageSize: "0" }).success, false);
  });

  it("caps pageSize at 100 to bound result payloads", () => {
    assert.equal(ListQuerySchema.safeParse({ pageSize: "100" }).success, true);
    assert.equal(ListQuerySchema.safeParse({ pageSize: "101" }).success, false);
  });
});

describe("admin users API — 등급변경 (tier change validation)", () => {
  it("accepts the persisted profile tiers", () => {
    assert.equal(ChangeTierSchema.parse({ tier: "member" }).tier, "member");
    assert.equal(
      ChangeTierSchema.parse({ tier: "verified_doctor" }).tier,
      "verified_doctor",
    );
  });

  it("rejects guest, unknown tiers, and a missing tier", () => {
    assert.equal(ChangeTierSchema.safeParse({ tier: "guest" }).success, false);
    assert.equal(ChangeTierSchema.safeParse({ tier: "admin" }).success, false);
    assert.equal(ChangeTierSchema.safeParse({}).success, false);
  });
});
