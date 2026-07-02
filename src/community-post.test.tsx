import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { UserEvent } from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";
import App, { AppShell } from "./App";
import { adminContentItems } from "./adminData";
import { signInAdmin } from "./auth";

// BBR-1136 [FE QA] 커뮤니티/게시글/댓글/반응 (Community & Posts)
// Independent QA hardening suite complementing the shared dev specs
// (App.test.tsx SCR-007/013, App.scr008.test.tsx). Focuses on the edges:
// list sort/filter state machine, private-card metric hiding, comment
// validation, reaction read-only surface, moderation permission gating,
// and the tier-based daily-view-limit FE gap (server-enforced, BBR-1134).

function renderShell(initialPath = "/community") {
  window.history.pushState({}, "", initialPath);
  return render(<AppShell />);
}

function renderAdmin(initialPath = "/admin/content") {
  window.history.pushState({}, "", initialPath);
  signInAdmin("admin@example.com", "admin");
  return render(<App />);
}

// Reads the community list cards in DOM order and returns their post ids,
// which is how sort ordering is observed.
function postOrder() {
  const list = screen.getByTestId("scr-007-fld-03");
  return within(list)
    .getAllByRole("button")
    .map((card) => card.getAttribute("data-post-id"));
}

async function login(user: UserEvent, email: string) {
  await user.type(screen.getByLabelText("이메일"), email);
  await user.type(screen.getByLabelText("비밀번호"), "password");
  await user.click(screen.getByRole("button", { name: "로그인" }));
}

beforeEach(() => {
  window.localStorage.clear();
});

describe("§A Community list (SCR-007)", () => {
  it("renders a post card with its comment / reaction aggregates", () => {
    renderShell();

    const card = screen.getByTestId("scr-007-act-03"); // post id "1"
    expect(card).toHaveAttribute("data-post-id", "1");
    expect(within(card).getByText("김건강")).toBeInTheDocument();
    // Reaction + fellowship aggregates surface as read-only text on the card.
    expect(within(card).getByText("공감 4")).toBeInTheDocument();
    expect(within(card).getByText("동병상련 4")).toBeInTheDocument();
  });

  it("hides metrics for a private post card", () => {
    renderShell();

    const privateCard = screen
      .getByText("비공개 글입니다.")
      .closest("button") as HTMLElement;
    expect(privateCard).toHaveAttribute("data-post-id", "4");
    // Private cards drop the excerpt + the whole metrics row.
    expect(within(privateCard).queryByText(/공감/)).not.toBeInTheDocument();
    expect(within(privateCard).queryByText(/동병상련/)).not.toBeInTheDocument();
  });

  it("keeps 최신 order but re-sorts by 인기 (empathy desc)", async () => {
    const user = userEvent.setup();
    renderShell();

    // Default 최신 preserves source order.
    expect(postOrder()).toEqual(["1", "2", "3", "4"]);

    await user.click(
      within(screen.getByTestId("scr-007-act-02")).getByRole("button", {
        name: "인기",
      }),
    );

    // empathy: 1→4, 2→12, 3→6, 4→1  ⇒ 2,3,1,4
    expect(postOrder()).toEqual(["2", "3", "1", "4"]);
  });

  it("surfaces the error state for the 위염 category", async () => {
    const user = userEvent.setup();
    renderShell();

    await user.click(
      within(screen.getByTestId("scr-007-act-01")).getByRole("button", {
        name: "위염",
      }),
    );

    expect(
      await screen.findByText("일시적인 문제가 발생했어요."),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /새로 고침/ })).toBeInTheDocument();
  });

  it("shows the empty state for a category with no posts", async () => {
    const user = userEvent.setup();
    renderShell();

    await user.click(
      within(screen.getByTestId("scr-007-act-01")).getByRole("button", {
        name: "비염",
      }),
    );

    expect(await screen.findByText("아직 게시글이 없어요.")).toBeInTheDocument();
    expect(screen.getByText("첫 글을 작성해보세요.")).toBeInTheDocument();
  });

  it("requires login before writing a post", async () => {
    const user = userEvent.setup();
    renderShell();

    await user.click(screen.getByTestId("scr-007-act-04")); // 글쓰기

    expect(
      screen.getByRole("dialog", { name: "로그인이 필요합니다" }),
    ).toBeInTheDocument();
    expect(screen.getByText("게시글 작성")).toBeInTheDocument();
  });
});

describe("§B Post detail comments (SCR-008)", () => {
  it("renders the seeded comments with an accurate count", () => {
    renderShell("/community/posts/run-night");

    const comments = screen.getByTestId("scr-008-fld-02");
    expect(comments).toHaveTextContent("댓글 3");
    expect(within(comments).getByText("저도 다음 주 참여할게요!")).toBeInTheDocument();
    expect(within(comments).getByText("몇 시에 모이나요?")).toBeInTheDocument();
  });

  it("ignores a whitespace-only comment without prompting login", async () => {
    const user = userEvent.setup();
    renderShell("/community/posts/run-night");

    await user.type(screen.getByLabelText("댓글 입력"), "    ");
    await user.click(
      within(screen.getByTestId("scr-008-act-01")).getByRole("button", {
        name: "댓글 등록",
      }),
    );

    // Blank body is trimmed to empty and short-circuited before auth.
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.getByTestId("scr-008-fld-02")).toHaveTextContent("댓글 3");
  });

  it("gates a signed-out comment behind login, then appends it", async () => {
    const user = userEvent.setup();
    renderShell("/community/posts/run-night");

    await user.type(screen.getByLabelText("댓글 입력"), "저도 참여하고 싶어요");
    await user.click(
      within(screen.getByTestId("scr-008-act-01")).getByRole("button", {
        name: "댓글 등록",
      }),
    );

    expect(
      screen.getByRole("dialog", { name: "로그인이 필요합니다" }),
    ).toBeInTheDocument();
    expect(screen.getByText("댓글 작성")).toBeInTheDocument();

    await login(user, "member@aiga.test");

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    const comments = screen.getByTestId("scr-008-fld-02");
    expect(comments).toHaveTextContent("댓글 4");
    expect(within(comments).getByText("저도 참여하고 싶어요")).toBeInTheDocument();
  });

  it("gates the report action behind login", async () => {
    const user = userEvent.setup();
    renderShell("/community/posts/run-night");

    await user.click(screen.getByTestId("scr-008-act-03")); // 신고하기

    expect(
      screen.getByRole("dialog", { name: "로그인이 필요합니다" }),
    ).toBeInTheDocument();
    expect(screen.getByText("게시글 신고")).toBeInTheDocument();
  });
});

describe("§C Reactions (반응)", () => {
  // NOTE (pinned for product, not a bug): reactions/추천 are read-only on the
  // FE — the detail view exposes only 공유/신고, no client-side vote toggle.
  // Casting/removing a vote is a server concern (idempotent castVote,
  // unique per post+user) validated by BE QA in BBR-1134.
  it("exposes no interactive reaction control on the detail view", () => {
    renderShell("/community/posts/run-night");

    expect(screen.getByTestId("scr-008-act-04")).toHaveAccessibleName("공유하기");
    expect(screen.getByTestId("scr-008-act-03")).toHaveAccessibleName("신고하기");
    expect(
      screen.queryByRole("button", { name: /공감|추천|좋아요|반응/ }),
    ).not.toBeInTheDocument();
  });
});

describe("§D Admin content moderation (SCR-013)", () => {
  it("keeps report/delete as queue facets instead of ContentItem lifecycle statuses", () => {
    const contentStatuses = adminContentItems.map((item) => item.status);

    expect(new Set(contentStatuses)).toEqual(new Set(["published", "hidden", "draft"]));
    expect(contentStatuses).not.toContain("pending");
    expect(contentStatuses).not.toContain("pending_review");
    expect(contentStatuses).not.toContain("reported");
    expect(contentStatuses).not.toContain("deleted");
    expect(adminContentItems.some((item) => item.reports > 0)).toBe(true);
    expect(adminContentItems.some((item) => item.deletedAt !== null)).toBe(true);
  });

  it("lists a reported community post with its report count", () => {
    renderAdmin();

    expect(
      screen.getByRole("heading", { name: "Admin 콘텐츠 관리" }),
    ).toBeInTheDocument();
    const row = screen
      .getByText("부적절한 홍보성 게시글")
      .closest("tr") as HTMLElement;
    expect(within(row).getByText("user_kim")).toBeInTheDocument();
    expect(within(row).getByText("신고됨")).toBeInTheDocument();
    expect(within(row).getByText("3")).toBeInTheDocument();
  });

  it("filters the moderation queue down to 신고됨 items", async () => {
    const user = userEvent.setup();
    renderAdmin();

    await user.selectOptions(screen.getByTestId("scr-013-fld-02"), "reported");
    await user.click(screen.getByTestId("scr-013-act-01"));

    expect(
      await screen.findByText("부적절한 홍보성 게시글"),
    ).toBeInTheDocument();
    expect(screen.queryByText("정상 게시글")).not.toBeInTheDocument();
    expect(screen.queryByText("삭제된 커뮤니티 글")).not.toBeInTheDocument();
  });

  it("moderates a reported post through the delete decision", async () => {
    const user = userEvent.setup();
    renderAdmin();

    await user.click(screen.getAllByTestId("scr-013-act-02")[0]);
    const dialog = screen.getByRole("dialog", { name: "처리 확인" });
    await user.type(within(dialog).getByLabelText("처리 사유"), "정책 위반");
    await user.click(within(dialog).getByRole("button", { name: "확인" }));

    expect(screen.getByText("삭제 처리되었습니다. API-001")).toBeInTheDocument();
  });

  it("blocks moderation actions when the admin lacks permission", async () => {
    const user = userEvent.setup();
    renderAdmin();

    await user.click(screen.getByRole("button", { name: "permission" }));

    expect(screen.getByTestId("scr-013-permission")).toHaveTextContent(
      "이 작업을 수행할 권한이 없습니다.",
    );
    // The list + row action buttons are withdrawn in the permission state.
    expect(screen.queryByTestId("scr-013-act-02")).not.toBeInTheDocument();
  });
});

describe("§E Tier-based daily view limit (등급별 게시글 열람 일일 제한)", () => {
  // NOTE (pinned for product, not a bug): the per-tier daily post-view limit
  // is enforced server-side only (429 POST_VIEW_DAILY_LIMIT_EXCEEDED, 24h
  // rolling window, verified_doctor unlimited — see BE QA BBR-1134). The FE
  // exposes no client-side limit counter/gate; reading a post always renders.
  it("does not gate post reading with any client-side view-limit UI", () => {
    renderShell("/community/posts/run-night");

    expect(
      screen.getByRole("heading", { name: "한강 야간 러닝 후기" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByText(/일일 열람|열람 제한|남은 열람|열람 횟수/),
    ).not.toBeInTheDocument();
  });
});
