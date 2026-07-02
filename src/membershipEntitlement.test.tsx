import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";
import App, { AppShell } from "./App";
import { signInAdmin } from "./auth";

/**
 * BBR-1124 [FE QA] Auth & 3-tier Membership — entitlement matrix + admin user management.
 *
 * Complements the dedicated login/session suites (LoginScreen, AdminLogin) and the
 * doctor-verification promotion suite (doctorVerification) with the two remaining
 * scope items: per-tier entitlement gating (비회원 / 일반회원 / 의사인증회원) and
 * the admin "사용자 관리" screen (status + tier changes). Contracts here are
 * asserted against the shipped UI so the QA deliverable stands on its own.
 */

function renderShell(initialPath = "/") {
  window.history.pushState({}, "", initialPath);
  return render(<AppShell />);
}

function renderAdminShell(initialPath = "/admin/users") {
  window.history.pushState({}, "", initialPath);
  signInAdmin("admin@example.com", "admin");
  return render(<App />);
}

async function loginViaModal(
  user: ReturnType<typeof userEvent.setup>,
  email: string,
) {
  await user.type(screen.getByLabelText("이메일"), email);
  await user.type(screen.getByLabelText("비밀번호"), "password");
  await user.click(screen.getByRole("button", { name: "로그인" }));
}

beforeEach(() => {
  window.localStorage.clear();
  window.history.pushState({}, "", "/");
});

describe("3-tier entitlement matrix", () => {
  it("surfaces all three membership tiers to a signed-out visitor without gating public browse", () => {
    renderShell("/browse");

    // Non-member sees the full tier ladder as informational context.
    expect(screen.getByText("비회원")).toBeInTheDocument();
    expect(screen.getByText("일반회원")).toBeInTheDocument();
    expect(screen.getByText("의사인증회원")).toBeInTheDocument();

    // Public catalog stays visible; no auth wall is forced up-front.
    expect(
      screen.getByRole("heading", { name: "콘텐츠 둘러보기" }),
    ).toBeInTheDocument();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("grants 일반회원 entitlements but blocks doctor-only community access", async () => {
    const user = userEvent.setup();
    renderShell("/browse");

    // A protected action pops the auth modal; logging in as a general member resolves it.
    await user.click(
      screen.getByRole("button", { name: "인공지능 임상 세미나 저장" }),
    );
    await loginViaModal(user, "member@aiga.test");

    expect(screen.getByLabelText("현재 회원 등급")).toHaveTextContent("일반회원");

    // Doctor-only entitlement is denied for a general member.
    await user.click(
      screen.getByRole("button", { name: "면허 인증 커뮤니티 입장" }),
    );
    expect(screen.getByRole("status")).toHaveTextContent(
      "의사인증회원 권한이 필요합니다",
    );
  });

  it("grants doctor-only entitlements to a 의사인증회원", async () => {
    const user = userEvent.setup();
    renderShell("/browse");

    await user.click(
      screen.getByRole("button", { name: "인공지능 임상 세미나 저장" }),
    );
    await loginViaModal(user, "doctor@aiga.test");

    expect(screen.getByLabelText("현재 회원 등급")).toHaveTextContent(
      "의사인증회원",
    );

    await user.click(
      screen.getByRole("button", { name: "면허 인증 커뮤니티 입장" }),
    );
    expect(screen.getByRole("status")).toHaveTextContent(
      "의사 인증회원으로 전용 커뮤니티에 입장했습니다",
    );
  });
});

describe("admin user management (SCR-014)", () => {
  it("renders the user roster with search, empty, and error states", async () => {
    const user = userEvent.setup();
    renderAdminShell("/admin/users");

    expect(
      screen.getByRole("heading", { name: "Admin 사용자 관리" }),
    ).toBeInTheDocument();
    expect(screen.getByText("김민수")).toBeInTheDocument();

    // Empty state: a query with no match clears the roster.
    await user.type(screen.getByTestId("scr-014-fld-01"), "없음");
    await user.click(screen.getByTestId("scr-014-act-01"));
    expect(
      screen.getByText("회원 목록을 불러오는 중입니다."),
    ).toBeInTheDocument();
    expect(
      await screen.findByText("검색 결과가 없습니다."),
    ).toBeInTheDocument();

    // Error state is recoverable via 다시 시도.
    await user.clear(screen.getByTestId("scr-014-fld-01"));
    await user.type(screen.getByTestId("scr-014-fld-01"), "오류");
    await user.click(screen.getByTestId("scr-014-act-01"));
    expect(
      await screen.findByText("회원 목록을 불러오지 못했습니다."),
    ).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "다시 시도" }));
    await waitFor(() =>
      expect(screen.getByText("김민수")).toBeInTheDocument(),
    );
  });

  it("lets an admin change a member's account status", async () => {
    const user = userEvent.setup();
    renderAdminShell("/admin/users");

    const firstRow = screen.getByText("김민수").closest("tr");
    expect(firstRow).not.toBeNull();

    await user.selectOptions(
      screen.getByLabelText("김민수 상태 변경"),
      "정지",
    );

    expect(
      within(firstRow as HTMLTableRowElement).getAllByText("정지")[0],
    ).toBeInTheDocument();
    expect(
      screen.getByText("김민수 상태를 정지(으)로 변경했습니다. API-001"),
    ).toBeInTheDocument();
  });

  it("lets an admin promote a member to the 의사인증회원 tier", async () => {
    const user = userEvent.setup();
    renderAdminShell("/admin/users");

    expect(screen.getByLabelText("박소연 등급 변경")).toHaveValue("member");

    await user.selectOptions(
      screen.getByLabelText("박소연 등급 변경"),
      "verified_doctor",
    );

    expect(screen.getByLabelText("박소연 등급 변경")).toHaveValue(
      "verified_doctor",
    );
    expect(screen.getByRole("status")).toHaveTextContent(
      "박소연 회원 등급을 의사인증회원으로 변경했습니다",
    );
  });
});
