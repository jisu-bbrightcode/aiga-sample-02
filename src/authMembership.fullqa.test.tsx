import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";
import App from "./App";
import { signInAdmin } from "./auth";

/**
 * Full-QA acceptance suite for 회원/인증/계정 · 3단계 등급/권한 (Auth & 3-tier Membership) — BBR-1125.
 *
 * BE QA (BBR-1122: permission-matrix / auth-session / admin-users contract) and FE QA
 * (BBR-1124: `LoginScreen` / `AdminLogin` / `membershipEntitlement`) already prove each
 * layer in isolation. This is the feature-level gate that exercises the cross-layer
 * acceptance seams neither per-layer suite covered:
 *
 *   §A  Full session lifecycle — a signed-out visitor (비회원) logs in to 일반회원, the
 *       tier badge follows navigation, then logout fully clears the session and
 *       re-gates protected actions (no stale entitlement survives sign-out).
 *   §B  Identity-switch re-authentication — signing out and back in as a different
 *       identity recomputes entitlements from scratch: a 일반회원 denied the doctor-only
 *       community re-authenticates as a 의사인증회원 and is admitted, with no leakage of
 *       the previous session's denial.
 *   §C  Admin user management is durable and row-independent — within a single admin
 *       session, a status change (정지) on one member and a tier change
 *       (member → verified_doctor) on another both persist without clobbering each other.
 *   §D  KNOWN SEAM — doctor-verification approval and the live membership entitlement are
 *       decoupled. `resolveMembershipTier` derives the session tier from the login email,
 *       while the /doctor-verification page derives its heading from the approved
 *       application. So an approved member's DV page reads 의사인증회원 while the global
 *       header badge + doctor-only community gate still treat them as 일반회원 until they
 *       re-login under a doctor identity. This test characterises that divergence so the
 *       gap is visible and regression-tracked. See the QA report / follow-up issue.
 *
 * The public auth provider is remounted whenever the SPA crosses the /admin boundary, so
 * the member must re-authenticate on return — while the shared DoctorVerificationProvider
 * keeps application state across that boundary. Re-login mirrors real runtime behaviour.
 */

function navigateTo(path: string) {
  window.history.pushState({}, "", path);
  fireEvent.popState(window);
}

/** Log in through the public auth modal (raised by a pending protected action). */
async function loginViaModal(
  user: ReturnType<typeof userEvent.setup>,
  email: string,
) {
  await user.type(await screen.findByLabelText("이메일"), email);
  await user.type(screen.getByLabelText("비밀번호"), "password");
  await user.click(screen.getByRole("button", { name: "로그인" }));
}

/** Log in through an inline login gate (e.g. the /doctor-verification protected route). */
async function loginInline(
  user: ReturnType<typeof userEvent.setup>,
  email: string,
) {
  await user.type(screen.getByLabelText("이메일"), email);
  await user.type(screen.getByLabelText("비밀번호"), "password");
  await user.click(screen.getByRole("button", { name: "로그인" }));
}

async function loginAsAdmin(user: ReturnType<typeof userEvent.setup>) {
  const emailField = screen.queryByTestId("scr-011-fld-01");
  if (!emailField) {
    return;
  }
  await user.type(emailField, "admin@example.com");
  await user.type(screen.getByTestId("scr-011-fld-02"), "admin");
  await user.click(screen.getByRole("button", { name: "로그인" }));
}

async function submitDoctorApplication(
  user: ReturnType<typeof userEvent.setup>,
  fields: { licenseNumber: string; licenseName: string; proofFilename: string },
) {
  await user.type(screen.getByLabelText("면허번호"), fields.licenseNumber);
  await user.clear(screen.getByLabelText("면허상 이름"));
  await user.type(screen.getByLabelText("면허상 이름"), fields.licenseName);
  await user.type(screen.getByLabelText("전문과목"), "가정의학과");
  await user.upload(
    screen.getByLabelText("증빙 파일"),
    new File(["proof"], fields.proofFilename, { type: "application/pdf" }),
  );
  await user.click(screen.getByRole("button", { name: "인증 신청 제출" }));
}

beforeEach(() => {
  window.localStorage.clear();
  window.history.pushState({}, "", "/");
});

describe("auth & 3-tier membership — full QA: §A session lifecycle", () => {
  it("promotes a 비회원 to 일반회원 on login, carries the tier across navigation, and re-gates on logout", async () => {
    const user = userEvent.setup();
    window.history.pushState({}, "", "/browse");
    render(<App />);

    // Signed-out: no live tier badge, sign-up entry point is offered.
    expect(screen.queryByLabelText("현재 회원 등급")).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "회원가입" })).toBeInTheDocument();

    // A protected action raises the auth modal; logging in resolves it to 일반회원.
    await user.click(
      screen.getByRole("button", { name: "인공지능 임상 세미나 저장" }),
    );
    await loginViaModal(user, "lifecycle-member@aiga.test");
    expect(screen.getByLabelText("현재 회원 등급")).toHaveTextContent("일반회원");

    // The session tier follows the visitor across a route change.
    navigateTo("/");
    expect(screen.getByLabelText("현재 회원 등급")).toHaveTextContent("일반회원");

    // Logout clears the session entirely: the badge disappears and the sign-up
    // entry point returns.
    await user.click(screen.getByRole("button", { name: "로그아웃" }));
    expect(screen.queryByLabelText("현재 회원 등급")).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "회원가입" })).toBeInTheDocument();

    // A protected action after logout must re-prompt auth — no stale grant survives.
    navigateTo("/browse");
    await user.click(
      screen.getByRole("button", { name: "인공지능 임상 세미나 저장" }),
    );
    expect(await screen.findByLabelText("이메일")).toBeInTheDocument();
  });
});

describe("auth & 3-tier membership — full QA: §B identity-switch re-auth", () => {
  it("recomputes entitlements when a denied 일반회원 signs out and back in as a 의사인증회원", async () => {
    const user = userEvent.setup();
    window.history.pushState({}, "", "/browse");
    render(<App />);

    // 일반회원 is denied the doctor-only community.
    await user.click(
      screen.getByRole("button", { name: "면허 인증 커뮤니티 입장" }),
    );
    await loginViaModal(user, "switch-member@aiga.test");
    expect(screen.getByLabelText("현재 회원 등급")).toHaveTextContent("일반회원");
    expect(screen.getByRole("status")).toHaveTextContent(
      "의사인증회원 권한이 필요합니다",
    );

    // Sign out, then re-authenticate as a doctor identity for the same action.
    await user.click(screen.getByRole("button", { name: "로그아웃" }));
    expect(screen.queryByLabelText("현재 회원 등급")).not.toBeInTheDocument();

    await user.click(
      screen.getByRole("button", { name: "면허 인증 커뮤니티 입장" }),
    );
    await loginViaModal(user, "switch-doctor@aiga.test");

    // The new identity's entitlements apply — the prior denial does not leak.
    expect(screen.getByLabelText("현재 회원 등급")).toHaveTextContent(
      "의사인증회원",
    );
    await waitFor(() =>
      expect(screen.getByRole("status")).toHaveTextContent(
        "전용 커뮤니티에 입장했습니다",
      ),
    );
  });
});

describe("auth & 3-tier membership — full QA: §C admin user management durability", () => {
  it("persists an independent status change and tier change within one admin session", async () => {
    const user = userEvent.setup();
    window.history.pushState({}, "", "/admin/users");
    signInAdmin("admin@example.com", "admin");
    render(<App />);

    expect(
      screen.getByRole("heading", { name: "Admin 사용자 관리" }),
    ).toBeInTheDocument();

    // Suspend 김민수.
    await user.selectOptions(
      screen.getByLabelText("김민수 상태 변경"),
      "정지",
    );
    const suspendedRow = screen.getByText("김민수").closest("tr");
    expect(suspendedRow).not.toBeNull();

    // Promote 박소연 to 의사인증회원 in the same session.
    await user.selectOptions(
      screen.getByLabelText("박소연 등급 변경"),
      "verified_doctor",
    );

    // Both mutations coexist: the earlier status change is not clobbered by the
    // later tier change (row-level state is independent).
    expect(screen.getByLabelText("김민수 상태 변경")).toHaveValue("정지");
    expect(screen.getByLabelText("박소연 등급 변경")).toHaveValue(
      "verified_doctor",
    );
    expect(screen.getByRole("status")).toHaveTextContent(
      "박소연 회원 등급을 의사인증회원으로 변경했습니다",
    );
  });
});

describe("auth & 3-tier membership — full QA: §D DV-approval / live-entitlement seam", () => {
  it("characterises the decoupling: an approved member's DV page reads 의사인증회원 while the live session stays 일반회원", async () => {
    const user = userEvent.setup();
    const memberEmail = "seam-member@aiga.test"; // no doctor marker -> resolves to 'member'
    window.history.pushState({}, "", "/doctor-verification");
    render(<App />);

    // Member submits a doctor-verification application.
    await loginInline(user, memberEmail);
    await submitDoctorApplication(user, {
      licenseNumber: "2026-0925",
      licenseName: "장윤호",
      proofFilename: "seam-license.pdf",
    });
    expect(screen.getByText("검수 대기")).toBeInTheDocument();

    // Admin approves it.
    navigateTo("/admin/doctors");
    await loginAsAdmin(user);
    await screen.findByRole("heading", { name: "의사 인증 검토" });
    await user.click(
      screen.getByRole("button", { name: "장윤호 면허 인증 자료 승인" }),
    );
    expect(
      screen.getByText("의사인증회원으로 등급이 상향되었습니다."),
    ).toBeInTheDocument();

    // Member returns (public provider remounted at the /admin boundary) and re-logs in.
    navigateTo("/doctor-verification");
    await loginInline(user, memberEmail);

    // The DV page reflects the approval (application-derived).
    expect(
      await screen.findByRole("heading", { name: "의사인증회원" }),
    ).toBeInTheDocument();

    // But the live membership session — header badge + doctor-only community gate —
    // still treats the same user as 일반회원, because the session tier is derived from
    // the login email, not from the approved application. This is the acceptance seam.
    navigateTo("/browse");
    expect(screen.getByLabelText("현재 회원 등급")).toHaveTextContent("일반회원");

    await user.click(
      screen.getByRole("button", { name: "면허 인증 커뮤니티 입장" }),
    );
    expect(screen.getByRole("status")).toHaveTextContent(
      "의사인증회원 권한이 필요합니다",
    );
  });
});
