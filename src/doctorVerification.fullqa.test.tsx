import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";
import App from "./App";

/**
 * Full-QA acceptance suite for 의사 면허 인증 (Doctor License Verification) — BBR-1131.
 *
 * BE QA (state-machine / service / controller / permission-elevation / retention)
 * and FE QA (`doctorVerification.test.tsx`, happy-path submit / validate / approve /
 * reject / promotion) already exist. This suite is the feature-level gate that
 * exercises the cross-layer acceptance criteria neither layer's QA covered on its own:
 *
 *   1. Rejection recovery: reject → 재신청 → re-review → approve → promotion.
 *      Mirrors the BE state-machine `rejected -> resubmitted -> pending` transition.
 *   2. Admin decision is terminal per review: after an *approval* the row locks
 *      (both actions + reason input disabled). BE guards this with `notReviewable`;
 *      FE QA only proved the reject-side lock, so approval-side lock is verified here.
 *   3. Approved membership is terminal for the applicant: the /doctor-verification
 *      page hides the form and shows the "cannot resubmit" note (FE view of the BE
 *      `alreadyVerified` invariant).
 *
 * The public auth provider is remounted whenever the SPA crosses the /admin
 * boundary, so the member must re-authenticate each time they return from the
 * admin console — while the shared DoctorVerificationProvider keeps application
 * state across that boundary. Re-login mirrors real runtime behaviour.
 */

function navigateTo(path: string) {
  window.history.pushState({}, "", path);
  fireEvent.popState(window);
}

async function loginAsMember(
  user: ReturnType<typeof userEvent.setup>,
  email = "fullqa-member@aiga.test",
) {
  await user.type(screen.getByLabelText("이메일"), email);
  await user.type(screen.getByLabelText("비밀번호"), "password");
  await user.click(screen.getByRole("button", { name: "로그인" }));
}

/**
 * Enter the admin console. The admin session persists in localStorage (unlike
 * the public session), so on a second visit the login form is already gone —
 * only sign in when the credential field is actually present.
 */
async function loginAsAdmin(user: ReturnType<typeof userEvent.setup>) {
  const emailField = screen.queryByTestId("scr-011-fld-01");
  if (!emailField) {
    return;
  }
  await user.type(emailField, "admin@example.com");
  await user.type(screen.getByTestId("scr-011-fld-02"), "admin");
  await user.click(screen.getByRole("button", { name: "로그인" }));
}

/**
 * Fill the applicant form and submit. `submitLabel` differs between a first
 * submission ("인증 신청 제출") and a post-rejection re-application ("재신청 제출").
 * `licenseName` is cleared first because the field pre-fills from the logged-in
 * user's name; keeping it stable keeps the admin row title deterministic.
 */
async function submitApplication(
  user: ReturnType<typeof userEvent.setup>,
  fields: {
    licenseNumber: string;
    licenseName: string;
    specialty?: string;
    proofFilename: string;
    submitLabel: string;
  },
) {
  await user.type(screen.getByLabelText("면허번호"), fields.licenseNumber);
  await user.clear(screen.getByLabelText("면허상 이름"));
  await user.type(screen.getByLabelText("면허상 이름"), fields.licenseName);
  if (fields.specialty) {
    await user.type(screen.getByLabelText("전문과목"), fields.specialty);
  }
  await user.upload(
    screen.getByLabelText("증빙 파일"),
    new File(["proof"], fields.proofFilename, { type: "application/pdf" }),
  );
  await user.click(screen.getByRole("button", { name: fields.submitLabel }));
}

beforeEach(() => {
  window.localStorage.clear();
  window.history.pushState({}, "", "/");
});

describe("doctor license verification — full QA: rejection recovery", () => {
  it("lets a rejected applicant re-apply, get re-reviewed, and finally be promoted", async () => {
    const user = userEvent.setup();
    window.history.pushState({}, "", "/doctor-verification");
    render(<App />);

    // 1. Member submits an initial application -> pending.
    await loginAsMember(user);
    await submitApplication(user, {
      licenseNumber: "2026-0500",
      licenseName: "정민수",
      specialty: "가정의학과",
      proofFilename: "first-license.pdf",
      submitLabel: "인증 신청 제출",
    });
    expect(screen.getByText("검수 대기")).toBeInTheDocument();

    // 2. Admin rejects it with a reason.
    navigateTo("/admin/doctors");
    await loginAsAdmin(user);
    await screen.findByRole("heading", { name: "의사 인증 검토" });
    await user.type(
      screen.getByRole("textbox", { name: "정민수 면허 인증 자료 반려 사유" }),
      "증빙 파일 화질이 낮습니다.",
    );
    await user.click(
      screen.getByRole("button", { name: "정민수 면허 인증 자료 반려" }),
    );

    // 3. Member returns and sees the rejection + a re-application form.
    navigateTo("/doctor-verification");
    await loginAsMember(user);
    expect(screen.getByText("반려됨")).toBeInTheDocument();
    expect(
      screen.getByText("반려 사유: 증빙 파일 화질이 낮습니다."),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "재신청 제출" }),
    ).toBeInTheDocument();

    // 4. Member re-applies with corrected proof -> back to pending.
    await submitApplication(user, {
      licenseNumber: "2026-0500",
      licenseName: "정민수",
      specialty: "가정의학과",
      proofFilename: "corrected-license.pdf",
      submitLabel: "재신청 제출",
    });
    expect(screen.getByText("검수 대기")).toBeInTheDocument();
    expect(screen.queryByText("반려됨")).not.toBeInTheDocument();

    // 5. Admin approves the re-submitted application.
    navigateTo("/admin/doctors");
    await loginAsAdmin(user);
    await screen.findByRole("heading", { name: "의사 인증 검토" });
    await user.click(
      screen.getByRole("button", { name: "정민수 면허 인증 자료 승인" }),
    );
    expect(
      screen.getByText("의사인증회원으로 등급이 상향되었습니다."),
    ).toBeInTheDocument();

    // 6. Member is now a 의사인증회원 with the expert badge; no form remains.
    navigateTo("/doctor-verification");
    await loginAsMember(user);
    expect(
      await screen.findByRole("heading", { name: "의사인증회원" }),
    ).toBeInTheDocument();
    await waitFor(() =>
      expect(screen.getByText("승인됨")).toBeInTheDocument(),
    );
    expect(
      screen.getByText("전문가 뱃지가 활성화되었습니다."),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "재신청 제출" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "인증 신청 제출" }),
    ).not.toBeInTheDocument();
  });
});

describe("doctor license verification — full QA: admin decision is terminal", () => {
  it("locks the admin row (both actions + reason input) after an approval", async () => {
    const user = userEvent.setup();
    window.history.pushState({}, "", "/doctor-verification");
    render(<App />);

    // Member submits so there is a member-owned pending row to approve.
    await loginAsMember(user);
    await submitApplication(user, {
      licenseNumber: "2026-0611",
      licenseName: "한서준",
      specialty: "정형외과",
      proofFilename: "han-license.pdf",
      submitLabel: "인증 신청 제출",
    });

    navigateTo("/admin/doctors");
    await loginAsAdmin(user);
    await screen.findByRole("heading", { name: "의사 인증 검토" });

    await user.click(
      screen.getByRole("button", { name: "한서준 면허 인증 자료 승인" }),
    );

    // Once approved, the whole review row is frozen — a second decision (or a
    // rejection overriding the approval) must be impossible.
    expect(screen.getByText("승인됨")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "한서준 면허 인증 자료 승인" }),
    ).toBeDisabled();
    expect(
      screen.getByRole("button", { name: "한서준 면허 인증 자료 반려" }),
    ).toBeDisabled();
    expect(
      screen.getByRole("textbox", { name: "한서준 면허 인증 자료 반려 사유" }),
    ).toBeDisabled();
  });
});

describe("doctor license verification — full QA: approval is terminal for the applicant", () => {
  it("hides the application form and shows a locked note after approval", async () => {
    const user = userEvent.setup();
    window.history.pushState({}, "", "/doctor-verification");
    render(<App />);

    await loginAsMember(user);
    await submitApplication(user, {
      licenseNumber: "2026-0722",
      licenseName: "오지현",
      specialty: "피부과",
      proofFilename: "oh-license.pdf",
      submitLabel: "인증 신청 제출",
    });

    navigateTo("/admin/doctors");
    await loginAsAdmin(user);
    await screen.findByRole("heading", { name: "의사 인증 검토" });
    await user.click(
      screen.getByRole("button", { name: "오지현 면허 인증 자료 승인" }),
    );

    navigateTo("/doctor-verification");
    await loginAsMember(user);

    // Approved applicants get the terminal "cannot resubmit" note, no form fields.
    await waitFor(() =>
      expect(
        screen.getByText("승인 완료된 신청은 다시 제출할 수 없습니다."),
      ).toBeInTheDocument(),
    );
    expect(screen.queryByLabelText("면허번호")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("증빙 파일")).not.toBeInTheDocument();
  });
});
