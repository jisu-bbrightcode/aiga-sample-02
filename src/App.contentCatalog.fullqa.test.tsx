import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";
import { AppShell } from "./App";

/**
 * 전체 QA — 핵심 콘텐츠 목록/검색/상세/작성 (Content Catalog) — BBR-1149
 *
 * The per-screen FE-QA suites (App.scr004/005/006/009.test.tsx, BBR-1148) each
 * mount a single screen at its own route and verify that screen in isolation.
 * The BE-QA suite (content-catalog.qa.test.ts, BBR-1146) locks the server
 * contract in isolation. Neither exercises the feature as one running app.
 *
 * This full-QA suite drives cross-screen user journeys through a single
 * <AppShell/> instance — the integration seams that only appear when the
 * screens, the client router (navigate → popstate → setRoute), and the shared
 * auth session are composed together:
 *
 *   J1 navigation continuity + list→detail data linkage      (SCR-005 → SCR-006)
 *   J2 auth session resumes across a screen change           (SCR-007 → SCR-009)
 *   J3 editor draft durability across navigation             (SCR-009 → SCR-007)
 *   J4 search view-limit is session-scoped, not screen-scoped(SCR-004 + auth)
 *
 * Findings that fall out of these journeys are recorded in the BBR-1149 full-QA
 * report document and tracked as follow-up issues. These journeys assert the
 * intended cross-screen behavior unless a known follow-up is called out inline.
 */

const DRAFT_KEY = "aiga.content-editor.draft";

function renderShell(initialPath: string) {
  window.history.pushState({}, "", initialPath);
  return render(<AppShell />);
}

/** Complete the shared public auth modal (email-only stub login). */
async function loginViaModal(
  user: ReturnType<typeof userEvent.setup>,
  email = "member@aiga.test",
) {
  const dialog = screen.getByRole("dialog", { name: "로그인이 필요합니다" });
  await user.type(within(dialog).getByLabelText("이메일"), email);
  await user.click(within(dialog).getByRole("button", { name: "로그인" }));
}

describe("Content Catalog — full QA cross-screen journeys (BBR-1149)", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("J1: Home → 목록 → card activation swaps to the selected detail route", async () => {
    const user = userEvent.setup();
    const { container } = renderShell("/");

    // Home bottom-nav is the real entry point into the catalog list (SCR-005).
    const listNav = container.querySelector('[data-nav="SCR-005"]');
    expect(listNav).not.toBeNull();
    await user.click(listNav as Element);
    expect(screen.getByRole("heading", { name: "목록" })).toBeInTheDocument();

    // Activating a list card routes to the detail screen within the same app.
    await user.click(screen.getAllByTestId("scr-005-act-03")[0]);
    expect(window.location.pathname).toBe("/items/content-lung-checklist");

    // The list toolbar is unmounted → the router handed off to SCR-006.
    expect(
      screen.queryByRole("tablist", { name: "카테고리" }),
    ).not.toBeInTheDocument();

    // The selected ContentItem id resolves to its SCR-006 detail, not a directory profile.
    expect(screen.getByRole("heading", { name: "폐암 치료 체크리스트" })).toBeInTheDocument();
    expect(screen.queryByText("서울대학교병원 · 내분비대사내과")).not.toBeInTheDocument();
    expect(screen.queryByText("표시할 상세 정보가 없어요.")).not.toBeInTheDocument();
  });

  it("J1b: the seeded detail id renders a real detail directly on the SCR-006 route", () => {
    renderShell("/items/content-lung-checklist");

    // The seeded id resolves directly, exercising the SCR-006 detail route on
    // its own — complements J1, where the id arrives via a SCR-005 card click.
    expect(
      screen.getByRole("heading", { name: "폐암 치료 체크리스트" }),
    ).toBeInTheDocument();
    expect(screen.getByTestId("scr-006-fld-01")).toBeInTheDocument();
  });

  it("J2: the community 글쓰기 auth-gate resumes into the editor with the session intact", async () => {
    const user = userEvent.setup();
    renderShell("/community");

    // Guest write action → shared auth modal (auth initiated on SCR-007).
    await user.click(screen.getByTestId("scr-007-act-04"));
    await loginViaModal(user);

    // The pending action resumes on the editor route, and because the session
    // persisted across the navigation the editor shows the form — not its own
    // guest permission gate. This cross-screen resume is untested per-screen.
    expect(window.location.pathname).toBe("/items/new");
    expect(
      await screen.findByRole("heading", { name: "작성/편집" }),
    ).toBeInTheDocument();
    expect(screen.queryByTestId("scr-009-permission")).not.toBeInTheDocument();
  });

  it("J3: an editor draft survives navigating away to the community", async () => {
    const user = userEvent.setup();
    renderShell("/items/new");

    await user.click(screen.getByRole("button", { name: "로그인하러 가기" }));
    await loginViaModal(user);

    await user.type(screen.getByLabelText("제목"), "통합 QA 임시 저장");
    await user.type(
      screen.getByLabelText("내용"),
      "내비게이션 이후에도 초안이 유지되는지 검증합니다.",
    );
    await user.click(screen.getByTestId("scr-009-act-01"));
    expect(await screen.findByText("임시 저장되었습니다.")).toBeInTheDocument();

    // Cancel routes to the community; the persisted draft must outlive the exit.
    await user.click(screen.getByTestId("scr-009-act-02"));
    expect(window.location.pathname).toBe("/community");

    const stored = JSON.parse(window.localStorage.getItem(DRAFT_KEY) ?? "{}");
    expect(stored).toMatchObject({ title: "통합 QA 임시 저장" });
  });

  it("J4: the guest search view-limit lifts once the same session authenticates", async () => {
    const user = userEvent.setup();
    renderShell("/search");

    const queryInput = screen.getByTestId("scr-004-fld-01");

    // First guest search consumes the single allowance and returns results.
    await user.type(queryInput, "폐암");
    expect(await screen.findByText("폐암 치료 체크리스트")).toBeInTheDocument();

    // Second guest search trips the view-limit gate.
    await user.clear(queryInput);
    await user.type(queryInput, "감기");
    expect(
      await screen.findByText("오늘 검색을 모두 사용했어요."),
    ).toBeInTheDocument();

    // Authenticating from the gate resumes an authorized search: the quota is
    // tied to the auth session, so the gate does not return post-login.
    await user.click(screen.getByRole("button", { name: "가입하고 계속 검색" }));
    await loginViaModal(user);

    await waitFor(() =>
      expect(
        screen.queryByText("오늘 검색을 모두 사용했어요."),
      ).not.toBeInTheDocument(),
    );
  });
});
