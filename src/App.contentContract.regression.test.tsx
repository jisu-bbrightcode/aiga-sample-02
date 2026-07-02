import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";
import App, { AppShell } from "./App";
import {
  adminContentItems,
  adminContentQueueLabels,
  adminContentStatusLabels,
  adminContentStatusOrder,
  getAdminContentQueueState,
  type AdminContentItem,
} from "./adminData";
import { signInAdmin } from "./auth";

/**
 * [QA] Content Catalog 계약 회귀 QA — status / facet / entity split (BBR-1178).
 *
 * This is the contract-regression gate that runs AFTER the two implementation
 * children landed:
 *   - [BE] Content Catalog 계약 리팩터 (BBR-1176) — locked the server contract.
 *   - [FE] Content Catalog 화면 계약 정렬 (directory/community ↔ ContentItem 분리).
 *
 * The per-screen suites (App.scr004/005/006/009.test.tsx) and the cross-screen
 * full-QA (App.contentCatalog.fullqa.test.tsx) each verify their own slice. This
 * suite is deliberately narrow and orthogonal: it locks the three invariants of
 * the canonical `ContentItem` contract so that a future edit which re-introduces
 * a non-lifecycle status, collapses a queue facet back into a status, or lets a
 * directory/community record leak into the ContentItem surface fails HERE:
 *
 *   §A  ContentItem lifecycle status is EXACTLY draft | published | hidden.
 *   §B  Admin queue facets (reported / deleted) are DERIVED, not statuses:
 *         reported ⇐ reportCount > 0,  deleted ⇐ deletedAt.
 *   §C  content / directory / community stay separate entities across
 *         SCR-004 / 005 / 006 / 009 / 013 — closes the BBR-1175 divergence risk.
 *
 * Owned by BBR-1178; only this file is committed (shared-tree QA convention).
 */

const LIFECYCLE_STATUSES = ["draft", "hidden", "published"] as const;
/** Statuses that were dropped from the locked contract — must never re-appear. */
const RETIRED_STATUSES = ["pending", "pending_review", "archived", "rejected"] as const;

function renderShell(initialPath: string) {
  window.history.pushState({}, "", initialPath);
  return render(<AppShell />);
}

/** SCR-013 admin content moderation lives on the /admin shell (needs App root). */
function renderAdminContent(initialPath = "/admin/content") {
  window.history.pushState({}, "", initialPath);
  signInAdmin("admin@example.com", "admin");
  return render(<App />);
}

/** Sign into the SCR-009 editor from its guest permission gate. */
async function enterEditor(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole("button", { name: "로그인하러 가기" }));
  const dialog = screen.getByRole("dialog", { name: "로그인이 필요합니다" });
  await user.type(within(dialog).getByLabelText("이메일"), "member@aiga.test");
  await user.click(within(dialog).getByRole("button", { name: "로그인" }));
}

beforeEach(() => {
  window.localStorage.clear();
});

// ───────────────────────────────────────────────────────────────────────────
// §A  Lifecycle status is exactly draft | published | hidden
// ───────────────────────────────────────────────────────────────────────────
describe("§A ContentItem lifecycle status contract", () => {
  it("the FE lifecycle status set is exactly draft | published | hidden", () => {
    expect(Object.keys(adminContentStatusLabels).sort()).toEqual([
      ...LIFECYCLE_STATUSES,
    ]);
    for (const retired of RETIRED_STATUSES) {
      expect(adminContentStatusLabels).not.toHaveProperty(retired);
    }
  });

  it("every seeded admin ContentItem stores a lifecycle status only", () => {
    const stored = new Set(adminContentItems.map((item) => item.status));
    expect(stored).toEqual(new Set(LIFECYCLE_STATUSES));
    for (const item of adminContentItems) {
      expect(LIFECYCLE_STATUSES).toContain(item.status);
    }
  });

  it("SCR-009 editor exposes only the three lifecycle statuses to authors", async () => {
    const user = userEvent.setup();
    renderShell("/items/new");
    await enterEditor(user);

    const statusSelect = screen.getByLabelText("상태") as HTMLSelectElement;
    const optionValues = Array.from(statusSelect.options).map((o) => o.value);
    expect(optionValues).toEqual(["draft", "published", "hidden"]);
    for (const retired of RETIRED_STATUSES) {
      expect(optionValues).not.toContain(retired);
    }
  });

  it("SCR-006 detail surfaces a lifecycle status, never a facet, in its metadata", () => {
    renderShell("/items/content-lung-checklist");

    const metadata = screen.getByTestId("scr-006-fld-03");
    expect(within(metadata).getByText("published")).toBeInTheDocument();
    // Facet words are not lifecycle statuses — they must not appear as status.
    expect(within(metadata).queryByText("신고됨")).not.toBeInTheDocument();
    expect(within(metadata).queryByText("삭제됨")).not.toBeInTheDocument();
  });
});

// ───────────────────────────────────────────────────────────────────────────
// §B  Admin queue facets are derived (reportCount / deletedAt), not statuses
// ───────────────────────────────────────────────────────────────────────────
describe("§B Admin queue facets ≠ lifecycle statuses", () => {
  it("reported / deleted are queue-only labels absent from the status label set", () => {
    // Queue labels are a strict superset: statuses + the two derived facets.
    expect(adminContentQueueLabels).toMatchObject(adminContentStatusLabels);
    expect(adminContentQueueLabels).toHaveProperty("reported");
    expect(adminContentQueueLabels).toHaveProperty("deleted");
    expect(adminContentStatusLabels).not.toHaveProperty("reported");
    expect(adminContentStatusLabels).not.toHaveProperty("deleted");
    // The filter dropdown offers the facets alongside the lifecycle statuses.
    expect(adminContentStatusOrder).toEqual(
      expect.arrayContaining(["reported", "deleted", "draft", "published", "hidden"]),
    );
  });

  it("getAdminContentQueueState derives reported from reportCount and deleted from deletedAt", () => {
    const base: AdminContentItem = {
      id: "x",
      title: "t",
      summary: "s",
      category: "커뮤니티",
      author: "a",
      updatedAt: "now",
      status: "published",
      reports: 0,
      views: 0,
      deletedAt: null,
      tags: [],
    };

    // Clean item → its underlying lifecycle status is shown as-is.
    expect(getAdminContentQueueState({ ...base, status: "published" })).toBe("published");
    expect(getAdminContentQueueState({ ...base, status: "hidden" })).toBe("hidden");
    expect(getAdminContentQueueState({ ...base, status: "draft" })).toBe("draft");

    // reportCount > 0 → the derived `reported` facet, WITHOUT mutating status.
    const reported = { ...base, status: "published" as const, reports: 3 };
    expect(getAdminContentQueueState(reported)).toBe("reported");
    expect(reported.status).toBe("published");

    // deletedAt set → the derived `deleted` facet, taking precedence over reports.
    const deleted = { ...base, status: "hidden" as const, reports: 9, deletedAt: "2026-07-02" };
    expect(getAdminContentQueueState(deleted)).toBe("deleted");
    expect(deleted.status).toBe("hidden");
  });

  it("SCR-013 renders the derived facet pill while the row keeps its lifecycle status", () => {
    renderAdminContent();

    expect(
      screen.getByRole("heading", { name: "Admin 콘텐츠 관리" }),
    ).toBeInTheDocument();

    // published + reports>0 → shows 신고됨 (reported facet), not 게시됨.
    const reportedRow = screen
      .getByText("부적절한 홍보성 게시글")
      .closest("tr") as HTMLElement;
    expect(within(reportedRow).getByText("신고됨")).toBeInTheDocument();
    expect(within(reportedRow).queryByText("게시됨")).not.toBeInTheDocument();
    // The report count is the source of the facet.
    expect(within(reportedRow).getByText("3")).toBeInTheDocument();

    // deletedAt set → shows 삭제됨 (deleted facet), and offers restore not delete.
    const deletedRow = screen
      .getByText("삭제된 커뮤니티 글")
      .closest("tr") as HTMLElement;
    expect(within(deletedRow).getByText("삭제됨")).toBeInTheDocument();
    expect(within(deletedRow).getByTestId("scr-013-act-03")).toBeInTheDocument();

    // Clean published item → its lifecycle status pill 게시됨.
    const cleanRow = screen
      .getByText("정상 게시글")
      .closest("tr") as HTMLElement;
    expect(within(cleanRow).getByText("게시됨")).toBeInTheDocument();
  });
});

// ───────────────────────────────────────────────────────────────────────────
// §C  content / directory / community stay separate entities (BBR-1175 closure)
// ───────────────────────────────────────────────────────────────────────────
describe("§C content / directory / community entity separation (BBR-1175)", () => {
  it("SCR-004 search types each result by entity and never cross-labels them", async () => {
    const user = userEvent.setup();
    renderShell("/search");

    await user.type(screen.getByTestId("scr-004-fld-01"), "폐암");

    // Content result → data-result-type=content, ContentItem subtitle.
    expect(await screen.findByText("폐암 치료 체크리스트")).toBeInTheDocument();
    const contentResult = screen.getByTestId("scr-004-act-02");
    expect(contentResult).toHaveAttribute("data-result-type", "content");
    expect(within(contentResult).getByText("ContentItem · free")).toBeInTheDocument();

    // Community result → data-result-type=community, distinct from content.
    await user.click(screen.getByRole("tab", { name: "커뮤니티 (1)" }));
    expect(screen.getByText("폐암 수술 후 회복 경험")).toBeInTheDocument();
    const communityResult = screen.getByTestId("scr-004-act-02");
    expect(communityResult).toHaveAttribute("data-result-type", "community");

    // Directory results → data-result-type=directory, and NO ContentItem /
    // community subtitles leak into them (the BBR-1175 divergence).
    await user.click(screen.getByRole("button", { name: "디렉터리" }));
    expect(await screen.findByText("김건강")).toBeInTheDocument();
    for (const result of screen.getAllByTestId("scr-004-act-02")) {
      expect(result).toHaveAttribute("data-result-type", "directory");
      expect(within(result).queryByText("ContentItem · free")).not.toBeInTheDocument();
      expect(within(result).queryByText("커뮤니티 · 김건강")).not.toBeInTheDocument();
    }
    expect(screen.queryByText("폐암 치료 체크리스트")).not.toBeInTheDocument();
  });

  it("SCR-005 list renders ContentItem cards only — no directory doctor/hospital records", () => {
    renderShell("/items");

    const list = screen.getByTestId("scr-005-fld-03");
    expect(within(list).getByText("폐암 치료 체크리스트")).toBeInTheDocument();
    // Directory entities (doctor / hospital) never appear in the content list.
    expect(within(list).queryByText("김건강")).not.toBeInTheDocument();
    expect(within(list).queryByText("서울대학교병원")).not.toBeInTheDocument();
  });

  it("SCR-006 detail resolves a ContentItem id but NOT a directory id", () => {
    // A ContentItem id resolves to a content detail with lifecycle metadata.
    const { unmount } = renderShell("/items/content-lung-checklist");
    expect(
      screen.getByRole("heading", { name: "폐암 치료 체크리스트" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByText("서울대학교병원 · 내분비대사내과"),
    ).not.toBeInTheDocument();
    unmount();

    // A directory identifier is not a ContentItem → empty state, no leak.
    renderShell("/items/doctor-kim");
    expect(screen.getByText("표시할 상세 정보가 없어요.")).toBeInTheDocument();
    expect(screen.queryByTestId("scr-006-fld-01")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("heading", { name: "김건강" }),
    ).not.toBeInTheDocument();
  });

  it("SCR-013 moderation queue is over ContentItems, not directory records", () => {
    renderAdminContent();

    const table = screen.getByTestId("scr-013-fld-03");
    // Seeded ContentItem rows are present…
    expect(within(table).getByText("정상 게시글")).toBeInTheDocument();
    // …while directory doctor/hospital entities are never moderated as content.
    expect(within(table).queryByText("김건강")).not.toBeInTheDocument();
    expect(within(table).queryByText("서울대학교병원")).not.toBeInTheDocument();
  });
});
