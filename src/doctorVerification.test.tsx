import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";
import App, { AppShell } from "./App";

function renderShell(initialPath = "/") {
  window.history.pushState({}, "", initialPath);
  return render(<AppShell />);
}

/**
 * Switch the SPA route inside a single <App /> mount. `App` and the admin/public
 * sub-trees all listen for `popstate`, so pushing state + firing the event mirrors
 * what the in-app `navigate()` helper does at runtime.
 */
function navigateTo(path: string) {
  window.history.pushState({}, "", path);
  fireEvent.popState(window);
}

async function loginAsMember(user: ReturnType<typeof userEvent.setup>, email = "doctor@aiga.test") {
  await user.type(screen.getByLabelText("이메일"), email);
  await user.type(screen.getByLabelText("비밀번호"), "password");
  await user.click(screen.getByRole("button", { name: "로그인" }));
}

async function loginAsAdmin(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByTestId("scr-011-fld-01"), "admin@example.com");
  await user.type(screen.getByTestId("scr-011-fld-02"), "admin");
  await user.click(screen.getByRole("button", { name: "로그인" }));
}

beforeEach(() => {
  window.localStorage.clear();
  window.history.pushState({}, "", "/");
});

describe("doctor license verification — member application", () => {
  it("lets a member submit a doctor license verification request and shows pending status", async () => {
    const user = userEvent.setup();
    renderShell();

    await user.click(screen.getByRole("link", { name: "의사 인증" }));

    expect(
      screen.getByRole("dialog", { name: "로그인이 필요합니다" }),
    ).toBeInTheDocument();

    await loginAsMember(user);

    expect(
      screen.getByRole("heading", { name: "의사 면허 인증" }),
    ).toBeInTheDocument();

    await user.type(screen.getByLabelText("면허번호"), "2026-0001");
    await user.clear(screen.getByLabelText("면허상 이름"));
    await user.type(screen.getByLabelText("면허상 이름"), "홍길동");
    await user.type(screen.getByLabelText("전문과목"), "내과");
    await user.upload(
      screen.getByLabelText("증빙 파일"),
      new File(["proof"], "license.pdf", { type: "application/pdf" }),
    );
    await user.click(screen.getByRole("button", { name: "인증 신청 제출" }));

    expect(screen.getByText("면허 인증 신청이 접수되었습니다.")).toBeInTheDocument();
    expect(screen.getByText("검수 대기")).toBeInTheDocument();
    expect(screen.getByText("license.pdf")).toBeInTheDocument();
  });

  it("blocks submission and shows a validation error when required fields are missing", async () => {
    const user = userEvent.setup();
    renderShell("/doctor-verification");
    // Route guard prompts login before the form is reachable.
    await loginAsMember(user);

    // License number and proof file left empty -> submit must fail.
    await user.click(screen.getByRole("button", { name: "인증 신청 제출" }));

    expect(
      screen.getByText("면허번호, 면허상 이름, 증빙 파일을 모두 입력해 주세요."),
    ).toBeInTheDocument();
    // No application should have been created: still "신청 전", no pending badge.
    expect(screen.queryByText("검수 대기")).not.toBeInTheDocument();
    expect(screen.getByText("아직 제출된 인증 신청이 없습니다.")).toBeInTheDocument();
  });

  it("locks the form into a waiting state after a pending application is submitted", async () => {
    const user = userEvent.setup();
    renderShell("/doctor-verification");
    await loginAsMember(user);

    await user.type(screen.getByLabelText("면허번호"), "2026-0777");
    await user.type(screen.getByLabelText("전문과목"), "정형외과");
    await user.upload(
      screen.getByLabelText("증빙 파일"),
      new File(["proof"], "proof.pdf", { type: "application/pdf" }),
    );
    await user.click(screen.getByRole("button", { name: "인증 신청 제출" }));

    // Form is replaced by the pending-review notice; resubmission is not possible.
    expect(
      screen.getByText("신청이 접수되어 운영자 검수를 기다리고 있습니다."),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "인증 신청 제출" }),
    ).not.toBeInTheDocument();
  });
});

describe("doctor license verification — admin review", () => {
  it("lets an admin approve a pending doctor verification application", async () => {
    const user = userEvent.setup();
    window.history.pushState({}, "", "/admin/doctors");
    render(<App />);

    await loginAsAdmin(user);

    expect(
      await screen.findByRole("heading", { name: "의사 인증 검토" }),
    ).toBeInTheDocument();
    expect(screen.getByText("전문의 면허 인증 자료")).toBeInTheDocument();

    await user.click(
      screen.getByRole("button", { name: "전문의 면허 인증 자료 승인" }),
    );

    expect(screen.getByText("승인됨")).toBeInTheDocument();
    expect(screen.getByText("의사인증회원으로 등급이 상향되었습니다.")).toBeInTheDocument();
  });

  it("lets an admin reject a pending application with a reason and locks the row", async () => {
    const user = userEvent.setup();
    window.history.pushState({}, "", "/admin/doctors");
    render(<App />);

    await loginAsAdmin(user);
    await screen.findByRole("heading", { name: "의사 인증 검토" });

    await user.type(
      screen.getByRole("textbox", { name: "전문의 면허 인증 자료 반려 사유" }),
      "증빙 파일 화질이 낮습니다.",
    );
    await user.click(
      screen.getByRole("button", { name: "전문의 면허 인증 자료 반려" }),
    );

    expect(screen.getByText("반려됨")).toBeInTheDocument();
    expect(
      screen.getByText("반려 사유: 증빙 파일 화질이 낮습니다."),
    ).toBeInTheDocument();
    // Once resolved, the approve/reject actions are disabled.
    expect(
      screen.getByRole("button", { name: "전문의 면허 인증 자료 승인" }),
    ).toBeDisabled();
    expect(
      screen.getByRole("button", { name: "전문의 면허 인증 자료 반려" }),
    ).toBeDisabled();
  });
});

describe("doctor license verification — end-to-end promotion", () => {
  it("promotes a member to 의사인증회원 with an expert badge after admin approval", async () => {
    const user = userEvent.setup();
    window.history.pushState({}, "", "/doctor-verification");
    render(<App />);

    // 1. Member submits a license verification request.
    await loginAsMember(user);
    await user.type(screen.getByLabelText("면허번호"), "2026-0042");
    await user.clear(screen.getByLabelText("면허상 이름"));
    await user.type(screen.getByLabelText("면허상 이름"), "김명의");
    await user.type(screen.getByLabelText("전문과목"), "외과");
    await user.upload(
      screen.getByLabelText("증빙 파일"),
      new File(["proof"], "kim-license.pdf", { type: "application/pdf" }),
    );
    await user.click(screen.getByRole("button", { name: "인증 신청 제출" }));
    expect(screen.getByText("검수 대기")).toBeInTheDocument();

    // 2. Admin reviews and approves the member's application (shared provider state).
    navigateTo("/admin/doctors");
    await loginAsAdmin(user);
    await screen.findByRole("heading", { name: "의사 인증 검토" });
    await user.click(
      screen.getByRole("button", { name: "김명의 면허 인증 자료 승인" }),
    );
    expect(screen.getByText("의사인증회원으로 등급이 상향되었습니다.")).toBeInTheDocument();

    // 3. Member returns to their verification page and sees the upgraded tier + badge.
    navigateTo("/doctor-verification");
    await loginAsMember(user);

    const statusCard = await screen.findByRole("heading", { name: "의사인증회원" });
    expect(statusCard).toBeInTheDocument();
    await waitFor(() =>
      expect(screen.getByText("승인됨")).toBeInTheDocument(),
    );
    expect(
      screen.getByText("전문가 뱃지가 활성화되었습니다."),
    ).toBeInTheDocument();
    // Approved applications can no longer be resubmitted.
    expect(
      screen.queryByRole("button", { name: "인증 신청 제출" }),
    ).not.toBeInTheDocument();
  });
});
