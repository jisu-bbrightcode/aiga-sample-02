import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";
import App, { AppShell } from "./App";

/**
 * 제품 통합 QA — cross-feature integration & regression (BBR-1164).
 *
 * Every feature already has its own full-QA gate (auth/membership BBR-1125,
 * doctor-verification BBR-1131, community BBR-1137, review/rating BBR-1143,
 * content-catalog BBR-1149). Those suites each prove one feature end-to-end.
 * None of them proves that the features *agree with each other* when composed
 * into the one running SPA — which is the job of the product deployment gate.
 *
 * The single seam that spans features is the membership tier carried by the
 * shared PublicAuthProvider session. It gates the review-rating author flow
 * (home) AND the content-catalog doctor-only community entry (browse). The
 * doctor-verification feature is supposed to be able to *grant* that tier.
 * These journeys drive one identity across those features through one app tree:
 *
 *   PJ1  a verified-doctor identity is granted BOTH features in one session
 *   PJ2  a plain-member identity is denied BOTH features in one session
 *   PJ3  DEFECT — doctor-verification approval does NOT propagate to the auth
 *        tier, so an "approved" doctor is still blocked from every tier-gated
 *        feature (tracked as follow-up BBR-1176)
 *
 * PJ1/PJ2 assert the intended cross-feature behavior. PJ3 pins the current
 * (defective) behavior so the regression gate is honest and the gap is tracked;
 * when BBR-1176 lands, PJ3's assertions flip to the granted path.
 */

/** SPA client navigation: pushState + popstate is what navigate() emits. */
function navigateTo(path: string) {
  window.history.pushState({}, "", path);
  fireEvent.popState(window);
}

function renderPublic(initialPath: string) {
  window.history.pushState({}, "", initialPath);
  return render(<AppShell />);
}

/** Complete the shared public auth modal. Tier is derived from the email. */
async function loginPublic(
  user: ReturnType<typeof userEvent.setup>,
  email: string,
) {
  const dialog = await screen.findByRole("dialog", {
    name: "로그인이 필요합니다",
  });
  await user.type(within(dialog).getByLabelText("이메일"), email);
  await user.click(within(dialog).getByRole("button", { name: "로그인" }));
}

/** Admin session persists in localStorage, so only sign in when the form is up. */
async function loginAdmin(user: ReturnType<typeof userEvent.setup>) {
  const emailField = screen.queryByTestId("scr-011-fld-01");
  if (!emailField) return;
  await user.type(emailField, "admin@example.com");
  await user.type(screen.getByTestId("scr-011-fld-02"), "admin");
  await user.click(screen.getByRole("button", { name: "로그인" }));
}

const DOCTOR_ENTRY = "면허 인증 커뮤니티 입장";
const REVIEW_GATE = "의사인증회원만 리뷰를 작성할 수 있습니다.";
const COMMUNITY_GRANTED = "의사 인증회원으로 전용 커뮤니티에 입장했습니다.";
const COMMUNITY_DENIED = "의사인증회원 권한이 필요합니다.";

beforeEach(() => {
  window.localStorage.clear();
  window.history.pushState({}, "", "/");
});

describe("product integration QA — tier entitlement is consistent across features (BBR-1164)", () => {
  it("PJ1: one verified-doctor session is granted review authoring AND doctor-only community entry", async () => {
    const user = userEvent.setup();
    renderPublic("/");

    // Feature A (review-rating, home): open the author flow → auth modal.
    await user.click(screen.getByRole("button", { name: "리뷰 작성" }));
    await loginPublic(user, "doctor@aiga.test");

    // The resumed session is a 의사인증회원 everywhere it is shown…
    expect(screen.getByLabelText("현재 회원 등급")).toHaveTextContent(
      "의사인증회원",
    );
    // …and the review author form is unlocked (no tier guard).
    expect(
      await screen.findByRole("group", { name: "평점 선택" }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("리뷰 내용")).toBeInTheDocument();
    expect(screen.queryByText(REVIEW_GATE)).not.toBeInTheDocument();

    // Feature B (content-catalog doctor community, browse): the SAME session
    // persists across the route change and is honored identically.
    navigateTo("/browse");
    await user.click(screen.getByRole("button", { name: DOCTOR_ENTRY }));
    expect(await screen.findByText(COMMUNITY_GRANTED)).toBeInTheDocument();
    expect(screen.queryByText(COMMUNITY_DENIED)).not.toBeInTheDocument();
  });

  it("PJ2: one plain-member session is denied review authoring AND doctor-only community entry", async () => {
    const user = userEvent.setup();
    renderPublic("/");

    await user.click(screen.getByRole("button", { name: "리뷰 작성" }));
    await loginPublic(user, "member@aiga.test");

    // The tier is member everywhere, and the review form is tier-gated.
    expect(screen.getByLabelText("현재 회원 등급")).toHaveTextContent(
      "일반회원",
    );
    expect(await screen.findByText(REVIEW_GATE)).toBeInTheDocument();
    expect(
      screen.queryByRole("group", { name: "평점 선택" }),
    ).not.toBeInTheDocument();

    // Same session, other feature: denial is consistent, not screen-specific.
    navigateTo("/browse");
    await user.click(screen.getByRole("button", { name: DOCTOR_ENTRY }));
    expect(await screen.findByText(COMMUNITY_DENIED)).toBeInTheDocument();
    expect(screen.queryByText(COMMUNITY_GRANTED)).not.toBeInTheDocument();
  });
});

describe("product integration QA — doctor-verification approval ↔ tier-gated features (BBR-1164)", () => {
  it("PJ3: an approved doctor-verification does NOT unlock the tier-gated features (DEFECT, BBR-1176)", async () => {
    const user = userEvent.setup();
    window.history.pushState({}, "", "/doctor-verification");
    render(<App />);

    // 1) A plain member submits a license application.
    await loginPublic(user, "member@aiga.test");
    await user.type(screen.getByLabelText("면허번호"), "2026-0808");
    await user.clear(screen.getByLabelText("면허상 이름"));
    await user.type(screen.getByLabelText("면허상 이름"), "정다은");
    await user.type(screen.getByLabelText("전문과목"), "내과");
    await user.upload(
      screen.getByLabelText("증빙 파일"),
      new File(["proof"], "license.pdf", { type: "application/pdf" }),
    );
    await user.click(screen.getByRole("button", { name: "인증 신청 제출" }));
    expect(screen.getByText("검수 대기")).toBeInTheDocument();

    // 2) Admin approves it (shared DoctorVerificationProvider crosses /admin).
    navigateTo("/admin/doctors");
    await loginAdmin(user);
    await screen.findByRole("heading", { name: "의사 인증 검토" });
    await user.click(
      screen.getByRole("button", { name: "정다은 면허 인증 자료 승인" }),
    );
    expect(screen.getByText("승인됨")).toBeInTheDocument();

    // 3) The member returns. The doctor-verification feature now presents them
    //    as an approved 의사인증회원 with an active expert badge.
    navigateTo("/doctor-verification");
    await loginPublic(user, "member@aiga.test");
    expect(
      await screen.findByRole("heading", { name: "의사인증회원" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText("전문가 뱃지가 활성화되었습니다."),
    ).toBeInTheDocument();

    // 4) DEFECT (BBR-1176): the approval never propagated to the auth session
    //    tier, so every *other* feature still treats them as a plain member.
    //    The header badge and both tier-gated features disagree with the
    //    verification page above — the cross-feature promotion is broken.
    navigateTo("/"); // same public session — AppShellContent does not remount
    expect(screen.getByLabelText("현재 회원 등급")).toHaveTextContent(
      "일반회원",
    );

    await user.click(screen.getByRole("button", { name: "리뷰 작성" }));
    expect(await screen.findByText(REVIEW_GATE)).toBeInTheDocument();

    navigateTo("/browse");
    await user.click(screen.getByRole("button", { name: DOCTOR_ENTRY }));
    expect(await screen.findByText(COMMUNITY_DENIED)).toBeInTheDocument();
    expect(screen.queryByText(COMMUNITY_GRANTED)).not.toBeInTheDocument();
  });
});
