import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import App, { AppShell } from "./App";
import { signInAdmin } from "./auth";

function renderShell(initialPath = "/") {
  window.history.pushState({}, "", initialPath);
  return render(<AppShell />);
}

function renderApp(initialPath = "/") {
  window.history.pushState({}, "", initialPath);
  return render(<App />);
}

function renderAdminShell(initialPath = "/admin") {
  window.history.pushState({}, "", initialPath);
  signInAdmin("admin@example.com", "admin");
  return render(<App />);
}

describe("AppShell", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("renders SCR-001 default home sections with required action hooks", () => {
    renderShell();

    expect(
      screen.getByRole("heading", { name: "어디가 아프세요?" }),
    ).toBeInTheDocument();
    expect(screen.getByTestId("scr-001-fld-01")).toHaveAttribute(
      "data-field",
      "banner",
    );
    expect(screen.getByTestId("scr-001-fld-02")).toHaveAttribute(
      "data-field",
      "primaryActions",
    );
    expect(screen.getByTestId("scr-001-fld-03")).toHaveAttribute(
      "data-field",
      "recommendedItems",
    );
    expect(screen.getByTestId("scr-001-fld-04")).toHaveAttribute(
      "data-field",
      "highlights",
    );
    expect(screen.getByTestId("scr-001-act-01")).toBeInTheDocument();
    expect(screen.getByTestId("scr-001-act-02")).toBeInTheDocument();
  });

  it("distinguishes SCR-001 default and empty states", async () => {
    const user = userEvent.setup();
    renderShell();

    await user.click(screen.getByRole("button", { name: "빈 상태" }));

    expect(screen.getByText("아직 표시할 콘텐츠가 없어요")).toBeInTheDocument();
    expect(
      screen.queryByRole("heading", {
        name: "환자ㆍ의사ㆍAI가 뽑은 베스트 닥터",
      }),
    ).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "기본" }));

    expect(
      screen.getByRole("heading", {
        name: "환자ㆍ의사ㆍAI가 뽑은 베스트 닥터",
      }),
    ).toBeInTheDocument();
  });

  it("shows permission gating for SCR-001 primary actions", async () => {
    const user = userEvent.setup();
    renderShell();

    await user.click(screen.getByTestId("scr-001-act-01"));

    expect(screen.getByText("AI 의사찾기는 회원 전용입니다")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "가입하기" }));

    expect(
      screen.getByRole("dialog", { name: "로그인이 필요합니다" }),
    ).toBeInTheDocument();
    expect(screen.getByText("AI 의사찾기 가입")).toBeInTheDocument();
  });

  it("shows a recoverable SCR-001 error state", async () => {
    const user = userEvent.setup();
    renderShell();

    await user.click(screen.getByRole("button", { name: "오류" }));

    expect(screen.getByText("일시적인 문제가 발생했어요.")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "새로 고침" }));

    expect(
      screen.getByRole("heading", { name: "어디가 아프세요?" }),
    ).toBeInTheDocument();
  });

  it("renders the SCR-005 items list with required fields and actions", () => {
    renderShell("/items");

    expect(screen.getByRole("heading", { name: "목록" })).toBeInTheDocument();
    expect(screen.getByTestId("scr-005-fld-01")).toHaveAttribute(
      "data-field",
      "category",
    );
    expect(screen.getByTestId("scr-005-fld-02")).toHaveAttribute(
      "data-field",
      "sort",
    );
    expect(screen.getByTestId("scr-005-fld-03")).toHaveAttribute(
      "data-field",
      "itemCards",
    );
    expect(screen.getByTestId("scr-005-fld-04")).toHaveAttribute(
      "data-field",
      "pagination",
    );

    expect(screen.getAllByTestId("scr-005-act-01").length).toBeGreaterThan(1);
    expect(screen.getAllByTestId("scr-005-act-02")).toHaveLength(3);
    expect(screen.getAllByTestId("scr-005-act-03").length).toBeGreaterThan(0);
    expect(screen.getByText("폐암 치료 체크리스트")).toBeInTheDocument();
    expect(screen.queryByText("김건강")).not.toBeInTheDocument();
    expect(screen.queryByText("검색 결과가 없어요")).not.toBeInTheDocument();
  });

  it("updates SCR-005 category and sort without requiring authentication", async () => {
    const user = userEvent.setup();
    renderShell("/items");

    await user.click(screen.getByRole("tab", { name: "공지" }));

    expect(screen.getByText("검색 결과가 없어요")).toBeInTheDocument();
    expect(screen.queryByTestId("scr-005-fld-03")).not.toBeInTheDocument();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

    await user.click(screen.getByRole("tab", { name: "질문/답변" }));
    await user.click(screen.getByLabelText("제목순"));

    expect(screen.getByText("진료 전 질문 준비법")).toBeInTheDocument();
    expect(screen.getByLabelText("제목순")).toBeChecked();
  });

  it("shows a recoverable SCR-005 error state", async () => {
    const user = userEvent.setup();
    renderShell("/items?state=error");

    expect(screen.getByText("일시적인 문제가 발생했어요.")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "새로 고침" }));

    expect(screen.getByText("폐암 치료 체크리스트")).toBeInTheDocument();
    expect(
      screen.queryByText("일시적인 문제가 발생했어요."),
    ).not.toBeInTheDocument();
  });

  it("keeps public browse content visible for signed-out visitors", () => {
    renderShell("/browse");

    expect(
      screen.getByRole("heading", { name: "콘텐츠 둘러보기" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "인공지능 임상 세미나 저장" }),
    ).toBeInTheDocument();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("opens auth modal for protected actions and resumes the original action after login", async () => {
    const user = userEvent.setup();
    renderShell("/browse");

    await user.click(
      screen.getByRole("button", { name: "인공지능 임상 세미나 저장" }),
    );

    expect(
      screen.getByRole("dialog", { name: "로그인이 필요합니다" }),
    ).toBeInTheDocument();
    expect(screen.getByText("인공지능 임상 세미나 저장")).toBeInTheDocument();

    await user.type(screen.getByLabelText("이메일"), "doctor@aiga.test");
    await user.type(screen.getByLabelText("비밀번호"), "password");
    await user.click(screen.getByRole("button", { name: "로그인" }));

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(
      screen.getByText("인공지능 임상 세미나 저장 완료"),
    ).toBeInTheDocument();
  });

  it("gates My Page through the auth modal and returns to the requested page after login", async () => {
    const user = userEvent.setup();
    renderShell();

    await user.click(screen.getByRole("link", { name: "마이페이지" }));

    expect(
      screen.getByRole("dialog", { name: "로그인이 필요합니다" }),
    ).toBeInTheDocument();
    expect(screen.getByText("마이페이지 보기")).toBeInTheDocument();

    await user.type(screen.getByLabelText("이메일"), "doctor@aiga.test");
    await user.type(screen.getByLabelText("비밀번호"), "password");
    await user.click(screen.getByRole("button", { name: "로그인" }));

    expect(
      screen.getByRole("heading", { name: "마이페이지" }),
    ).toBeInTheDocument();
  });

  it("shows 3-tier membership status and blocks doctor-only actions for regular members", async () => {
    const user = userEvent.setup();
    renderShell("/browse");

    expect(screen.getByText("비회원")).toBeInTheDocument();
    expect(screen.getByText("일반회원")).toBeInTheDocument();
    expect(screen.getByText("의사인증회원")).toBeInTheDocument();

    await user.click(
      screen.getByRole("button", { name: "인공지능 임상 세미나 저장" }),
    );
    await user.type(screen.getByLabelText("이메일"), "member@aiga.test");
    await user.type(screen.getByLabelText("비밀번호"), "password");
    await user.click(screen.getByRole("button", { name: "로그인" }));

    expect(screen.getByLabelText("현재 회원 등급")).toHaveTextContent("일반회원");

    await user.click(screen.getByRole("button", { name: "면허 인증 커뮤니티 입장" }));

    expect(screen.getByRole("status")).toHaveTextContent(
      "의사인증회원 권한이 필요합니다",
    );
  });

  it("lets verified doctors enter doctor-only community content", async () => {
    const user = userEvent.setup();
    renderShell("/browse");

    await user.click(
      screen.getByRole("button", { name: "인공지능 임상 세미나 저장" }),
    );
    await user.type(screen.getByLabelText("이메일"), "doctor@aiga.test");
    await user.type(screen.getByLabelText("비밀번호"), "password");
    await user.click(screen.getByRole("button", { name: "로그인" }));

    expect(screen.getByLabelText("현재 회원 등급")).toHaveTextContent("의사인증회원");

    await user.click(screen.getByRole("button", { name: "면허 인증 커뮤니티 입장" }));

    expect(screen.getByRole("status")).toHaveTextContent(
      "의사 인증회원으로 전용 커뮤니티에 입장했습니다",
    );
  });

  it("shows the SCR-009 permission state for signed-out authoring access", async () => {
    const user = userEvent.setup();
    const { container } = renderShell("/items/new");

    expect(container.querySelector('[data-screen="SCR-009"]')).toHaveAttribute(
      "data-state",
      "permission",
    );
    expect(
      screen.getByRole("heading", { name: "로그인이 필요합니다" }),
    ).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "로그인하러 가기" }));

    expect(
      screen.getByRole("dialog", { name: "로그인이 필요합니다" }),
    ).toBeInTheDocument();
    expect(screen.getByText("콘텐츠 작성")).toBeInTheDocument();
  });

  it("renders SCR-009 empty/default form states after login", async () => {
    const user = userEvent.setup();
    const { container } = renderShell("/items/new");

    await user.click(screen.getByRole("button", { name: "로그인하러 가기" }));
    await user.type(screen.getByLabelText("이메일"), "doctor@aiga.test");
    await user.type(screen.getByLabelText("비밀번호"), "password");
    await user.click(screen.getByRole("button", { name: "로그인" }));

    expect(screen.getByRole("heading", { name: "작성/편집" })).toBeInTheDocument();
    expect(container.querySelector('[data-screen="SCR-009"]')).toHaveAttribute(
      "data-state",
      "empty",
    );
    expect(screen.getByTestId("scr-009-fld-01")).toBeInTheDocument();
    expect(screen.getByTestId("scr-009-fld-02")).toBeInTheDocument();
    expect(screen.getByTestId("scr-009-fld-03")).toBeInTheDocument();
    expect(screen.getByTestId("scr-009-fld-05")).toBeInTheDocument();
    expect(screen.getByTestId("scr-009-fld-06")).toBeInTheDocument();
    expect(screen.getByTestId("scr-009-act-01")).toBeDisabled();

    await user.type(screen.getByLabelText("제목"), "첫 의료 AI 가이드");
    await user.selectOptions(screen.getByLabelText("카테고리"), "qna");
    await user.type(screen.getByLabelText("내용"), "진료 보조 도입 전 확인할 내용을 정리합니다.");

    expect(container.querySelector('[data-screen="SCR-009"]')).toHaveAttribute(
      "data-state",
      "default",
    );
    expect(screen.getByTestId("scr-009-act-01")).toBeEnabled();
  });

  it("shows SCR-009 loading and recoverable error states when saving fails", async () => {
    const user = userEvent.setup();
    const { container } = renderShell("/items/new");
    vi.spyOn(Storage.prototype, "setItem").mockImplementationOnce(() => {
      throw new Error("quota");
    });

    await user.click(screen.getByRole("button", { name: "로그인하러 가기" }));
    await user.type(screen.getByLabelText("이메일"), "doctor@aiga.test");
    await user.type(screen.getByLabelText("비밀번호"), "password");
    await user.click(screen.getByRole("button", { name: "로그인" }));

    await user.type(screen.getByLabelText("제목"), "저장 실패 테스트");
    await user.selectOptions(screen.getByLabelText("카테고리"), "free");
    await user.type(screen.getByLabelText("내용"), "오류 발생 시 복구 안내를 확인합니다.");
    await user.click(screen.getByTestId("scr-009-act-01"));

    expect(screen.getByText("저장 중입니다...")).toBeInTheDocument();
    await screen.findByRole("alert");
    expect(container.querySelector('[data-screen="SCR-009"]')).toHaveAttribute(
      "data-state",
      "error",
    );
    expect(screen.getByText("저장에 실패했습니다")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "다시 시도" }));

    await waitFor(() =>
      expect(container.querySelector('[data-screen="SCR-009"]')).toHaveAttribute(
        "data-state",
        "default",
      ),
    );
    expect(screen.getByDisplayValue("저장 실패 테스트")).toBeInTheDocument();
    vi.restoreAllMocks();
  });

  it("renders SCR-013 admin content fields and actions", () => {
    renderAdminShell("/admin/content");

    expect(screen.getByRole("heading", { name: "Admin 콘텐츠 관리" })).toBeInTheDocument();
    expect(screen.getByTestId("scr-013-fld-01")).toHaveAttribute("data-field", "keyword");
    expect(screen.getByTestId("scr-013-fld-02")).toHaveAttribute("data-field", "filter");
    expect(screen.getByTestId("scr-013-fld-03")).toHaveAttribute("data-field", "itemList");
    expect(screen.getByTestId("scr-013-fld-04")).toHaveAttribute("data-field", "decision");
    expect(screen.getByTestId("scr-013-act-01")).toHaveTextContent("검색");
    expect(screen.getAllByTestId("scr-013-act-02").length).toBeGreaterThan(0);
    expect(screen.getAllByTestId("scr-013-act-03").length).toBeGreaterThan(0);
    expect(screen.getAllByTestId("scr-013-act-04").length).toBeGreaterThan(0);
    expect(screen.getByText("부적절한 홍보성 게시글")).toBeInTheDocument();
  });

  it("distinguishes SCR-013 loading, empty, error, and permission states", async () => {
    const user = userEvent.setup();
    renderAdminShell("/admin/content");

    await user.type(screen.getByTestId("scr-013-fld-01"), "없음");
    await user.click(screen.getByTestId("scr-013-act-01"));

    expect(screen.getByText("콘텐츠 목록을 불러오는 중입니다.")).toBeInTheDocument();
    expect(await screen.findByText("결과가 없습니다.")).toBeInTheDocument();

    await user.clear(screen.getByTestId("scr-013-fld-01"));
    await user.type(screen.getByTestId("scr-013-fld-01"), "오류");
    await user.click(screen.getByTestId("scr-013-act-01"));

    expect(await screen.findByText("콘텐츠를 불러오지 못했습니다.")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "다시 시도" }));

    await waitFor(() => expect(screen.getByText("부적절한 홍보성 게시글")).toBeInTheDocument());

    await user.click(screen.getByRole("button", { name: "permission" }));

    expect(screen.getByText("이 작업을 수행할 권한이 없습니다.")).toBeInTheDocument();
  });

  it("handles SCR-013 delete, restore, and reject decisions", async () => {
    const user = userEvent.setup();
    renderAdminShell("/admin/content");

    await user.click(screen.getAllByTestId("scr-013-act-02")[0]);
    let dialog = screen.getByRole("dialog", { name: "처리 확인" });
    await user.type(within(dialog).getByLabelText("처리 사유"), "정책 위반");
    await user.click(within(dialog).getByRole("button", { name: "확인" }));

    expect(screen.getByText("삭제 처리되었습니다. API-001")).toBeInTheDocument();

    await user.click(screen.getAllByTestId("scr-013-act-03")[0]);
    dialog = screen.getByRole("dialog", { name: "처리 확인" });
    await user.click(within(dialog).getByRole("button", { name: "확인" }));

    expect(screen.getByText("복원 처리되었습니다. API-001")).toBeInTheDocument();

    await user.click(screen.getAllByTestId("scr-013-act-04")[0]);
    dialog = screen.getByRole("dialog", { name: "처리 확인" });
    await user.click(within(dialog).getByRole("button", { name: "확인" }));

    expect(screen.getByText("반려 처리되었습니다. API-001")).toBeInTheDocument();
  });

  it("renders SCR-010 My Page at /my with required fields and actions after login", async () => {
    const user = userEvent.setup();
    renderShell("/my");

    expect(
      screen.getByRole("dialog", { name: "로그인이 필요합니다" }),
    ).toBeInTheDocument();

    await user.type(screen.getByLabelText("이메일"), "doctor@aiga.test");
    await user.type(screen.getByLabelText("비밀번호"), "password");
    await user.click(screen.getByRole("button", { name: "로그인" }));

    expect(screen.getByRole("heading", { name: "마이페이지" })).toBeInTheDocument();
    expect(screen.getByTestId("scr-010-fld-01")).toBeInTheDocument();
    expect(screen.getByTestId("scr-010-act-01")).toHaveTextContent("의사 프로필 수정");
    expect(screen.getByTestId("scr-010-fld-02")).toBeInTheDocument();
    expect(screen.getByTestId("scr-010-act-02")).toBeInTheDocument();
    expect(screen.getByTestId("scr-010-fld-04")).toBeInTheDocument();

    await user.click(screen.getByRole("tab", { name: "저장(1)" }));

    expect(screen.getByTestId("scr-010-fld-03")).toBeVisible();

    await user.click(screen.getByTestId("scr-010-act-03"));

    expect(screen.getByText("김건강 저장 항목을 열었습니다.")).toBeInTheDocument();

    await user.click(screen.getByTestId("scr-010-act-04"));

    const logoutDialog = screen.getByRole("dialog", { name: "로그아웃" });
    await user.click(within(logoutDialog).getByRole("button", { name: "로그아웃" }));

    expect(window.location.pathname).toBe("/");
  });

  it("distinguishes SCR-010 empty, loading, error, and permission states", async () => {
    const user = userEvent.setup();
    renderShell("/my");

    await user.type(screen.getByLabelText("이메일"), "doctor@aiga.test");
    await user.type(screen.getByLabelText("비밀번호"), "password");
    await user.click(screen.getByRole("button", { name: "로그인" }));

    await user.click(screen.getByRole("button", { name: "empty" }));
    expect(screen.getByText("게시글이 없습니다")).toBeVisible();

    await user.click(screen.getByRole("button", { name: "loading" }));
    expect(screen.getByRole("status", { name: "마이페이지 불러오는 중" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "error" }));
    expect(screen.getByText("일시적인 문제가 발생했어요.")).toBeVisible();

    await user.click(screen.getByRole("button", { name: "새로 고침" }));
    expect(screen.getByTestId("scr-010-fld-01")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "permission" }));
    expect(screen.getByText("마이페이지는 회원 전용입니다.")).toBeVisible();
    expect(screen.getByTestId("scr-010-perm-login")).toBeInTheDocument();
  });

  it("renders the SCR-003 signup screen with its empty form state", () => {
    renderShell("/signup");

    expect(screen.getByRole("heading", { name: "계정을 만들어보세요" })).toBeInTheDocument();
    expect(screen.getByTestId("scr-003-fld-01")).toHaveValue("");
    expect(screen.getByTestId("scr-003-fld-02")).toHaveValue("");
    expect(screen.getByTestId("scr-003-fld-03")).toBeInTheDocument();
    expect(screen.getByTestId("scr-003-fld-04")).toBeInTheDocument();
    expect(screen.getByTestId("scr-003-act-01")).toBeInTheDocument();
    expect(screen.getByText("가입 정보 입력 전")).toBeInTheDocument();
  });

  it("shows recoverable validation errors for an empty signup submission", async () => {
    const user = userEvent.setup();
    renderShell("/signup");

    await user.click(screen.getByRole("button", { name: "가입하기" }));

    expect(
      screen.getByRole("alert", { name: "회원가입 오류" }),
    ).toHaveTextContent("입력한 정보를 다시 확인해주세요.");
    expect(screen.getByText("올바른 이메일 형식이 아닙니다.")).toBeInTheDocument();
    expect(screen.getByText("비밀번호는 8자 이상이어야 합니다.")).toBeInTheDocument();
    expect(screen.getByText("필수 약관에 동의해주세요.")).toBeInTheDocument();
  });

  it("submits signup after required agreements and exposes loading then success state", async () => {
    const user = userEvent.setup();
    renderShell("/signup");

    await user.type(screen.getByLabelText("이메일 *"), "doctor@aiga.test");
    await user.type(screen.getByLabelText("비밀번호 *"), "password1");
    await user.click(screen.getByTestId("scr-003-act-02"));
    await user.click(screen.getByLabelText("(필수) 개인정보 처리방침 동의"));
    await user.click(screen.getByRole("button", { name: "가입하기" }));

    expect(screen.getByRole("button", { name: "가입 처리 중" })).toBeDisabled();

    expect(await screen.findByText("회원가입이 완료되었습니다.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "가입하기" })).not.toBeDisabled();
  });

  it("renders SCR-007 community controls and updates selected filters", async () => {
    const user = userEvent.setup();
    renderShell("/community");

    expect(screen.getByRole("heading", { name: "커뮤니티" })).toBeInTheDocument();
    expect(screen.getByTestId("scr-007-fld-01")).toBeInTheDocument();
    expect(screen.getByTestId("scr-007-fld-02")).toBeInTheDocument();
    expect(screen.getByTestId("scr-007-fld-03")).toBeInTheDocument();
    expect(screen.getByTestId("scr-007-fld-04")).toBeInTheDocument();
    expect(screen.getByText("총 20건")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "당뇨" }));
    expect(screen.getByRole("button", { name: "당뇨" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );

    await user.click(screen.getByRole("button", { name: "인기" }));
    expect(screen.getByRole("button", { name: "인기" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });

  it("shows SCR-007 empty, error, and recovery states", async () => {
    const user = userEvent.setup();
    renderShell("/community");

    await user.click(screen.getByRole("button", { name: "비염" }));
    expect(await screen.findByText("아직 게시글이 없어요.")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "위염" }));
    expect(screen.getByText("게시글을 불러오고 있습니다.")).toBeInTheDocument();
    expect(await screen.findByText("일시적인 문제가 발생했어요.")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "새로 고침" }));
    expect(screen.getByText("게시글을 불러오고 있습니다.")).toBeInTheDocument();
    expect(await screen.findByTestId("scr-007-fld-03")).toBeInTheDocument();
  });

  it("handles SCR-007 post selection and protected write action", async () => {
    const user = userEvent.setup();
    renderShell("/community");

    await user.click(screen.getByTestId("scr-007-act-03"));
    expect(window.location.pathname).toBe("/community/posts/1");

    await user.click(screen.getByRole("button", { name: "뒤로" }));

    await user.click(screen.getByTestId("scr-007-act-04"));
    expect(screen.getByText("이 작업은 로그인이 필요해요.")).toBeInTheDocument();
    expect(
      screen.getByRole("dialog", { name: "로그인이 필요합니다" }),
    ).toBeInTheDocument();
    expect(screen.getByText("게시글 작성")).toBeInTheDocument();

    await user.type(screen.getByLabelText("이메일"), "doctor@aiga.test");
    await user.type(screen.getByLabelText("비밀번호"), "password");
    await user.click(screen.getByRole("button", { name: "로그인" }));

    expect(window.location.pathname).toBe("/items/new");
  });

  it("renders SCR-006 detail route with the required fields and actions", () => {
    renderShell("/items/content-lung-checklist");

    expect(
      screen.getByRole("heading", { name: "폐암 치료 체크리스트" }),
    ).toBeInTheDocument();
    expect(screen.getByTestId("scr-006-fld-01")).toHaveAttribute(
      "data-field",
      "detail",
    );
    expect(screen.getByTestId("scr-006-fld-02")).toHaveAttribute(
      "data-field",
      "relatedActions",
    );
    expect(screen.getByTestId("scr-006-fld-03")).toHaveAttribute(
      "data-field",
      "metadata",
    );
    expect(screen.getByTestId("scr-006-act-01")).toHaveAccessibleName(
      "주요 액션",
    );
    expect(screen.getByTestId("scr-006-act-02")).toHaveAttribute(
      "data-related-id",
      "content-lung-checklist-save",
    );
  });

  it("distinguishes SCR-006 loading, empty, error, and permission states", async () => {
    const user = userEvent.setup();
    renderShell("/items/content-lung-checklist?state=loading");

    expect(screen.getByLabelText("상세 정보를 불러오는 중")).toBeInTheDocument();

    window.history.pushState({}, "", "/items/missing");
    window.dispatchEvent(new PopStateEvent("popstate"));
    expect(await screen.findByText("표시할 상세 정보가 없어요.")).toBeInTheDocument();

    window.history.pushState({}, "", "/items/error");
    window.dispatchEvent(new PopStateEvent("popstate"));
    expect(await screen.findByText("일시적인 문제가 발생했어요.")).toBeInTheDocument();

    await user.click(screen.getByTestId("scr-006-retry"));

    expect(
      screen.getByRole("heading", { name: "폐암 치료 체크리스트" }),
    ).toBeInTheDocument();

    window.history.pushState({}, "", "/items/private");
    window.dispatchEvent(new PopStateEvent("popstate"));
    expect(await screen.findByText("접근 권한이 없어요.")).toBeInTheDocument();
  });

  it("gates SCR-006 primary action and resumes it after login", async () => {
    const user = userEvent.setup();
    renderShell("/items/content-lung-checklist");

    await user.click(screen.getByTestId("scr-006-act-01"));

    expect(
      screen.getByRole("dialog", { name: "로그인이 필요합니다" }),
    ).toBeInTheDocument();
    expect(screen.getByText("주요 액션 선택")).toBeInTheDocument();

    await user.type(screen.getByLabelText("이메일"), "doctor@aiga.test");
    await user.type(screen.getByLabelText("비밀번호"), "password");
    await user.click(screen.getByRole("button", { name: "로그인" }));

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("주요 액션 완료");
  });

  it("renders SCR-014 admin user management states and actions", async () => {
    const user = userEvent.setup();
    renderAdminShell("/admin/users");

    expect(screen.getAllByRole("heading", { name: "사용자 관리" }).length).toBeGreaterThan(0);
    expect(
      screen.getByRole("heading", { name: "Admin 사용자 관리" }),
    ).toBeInTheDocument();
    expect(screen.getByTestId("scr-014-fld-02")).toBeInTheDocument();
    expect(screen.getByTestId("scr-014-fld-03")).toHaveTextContent("상태");
    expect(screen.getByTestId("scr-014-fld-04")).toHaveTextContent("액션");
    expect(screen.getByText("김민수")).toBeInTheDocument();

    await user.type(screen.getByTestId("scr-014-fld-01"), "없음");
    await user.click(screen.getByTestId("scr-014-act-01"));

    expect(screen.getByText("회원 목록을 불러오는 중입니다.")).toBeInTheDocument();
    expect(await screen.findByText("검색 결과가 없습니다.")).toBeInTheDocument();

    await user.clear(screen.getByTestId("scr-014-fld-01"));
    await user.type(screen.getByTestId("scr-014-fld-01"), "오류");
    await user.click(screen.getByTestId("scr-014-act-01"));

    expect(
      await screen.findByText("회원 목록을 불러오지 못했습니다."),
    ).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "다시 시도" }));

    await waitFor(() => expect(screen.getByText("김민수")).toBeInTheDocument());
    await user.click(screen.getAllByTestId("scr-014-act-02")[0]);

    expect(screen.getByRole("dialog", { name: "회원 상세" })).toHaveTextContent(
      "김민수",
    );

    const firstRow = screen.getByText("김민수").closest("tr");
    expect(firstRow).not.toBeNull();

    await user.selectOptions(screen.getByLabelText("김민수 상태 변경"), "정지");

    expect(within(firstRow as HTMLTableRowElement).getAllByText("정지")[0]).toBeInTheDocument();
    expect(
      screen.getByText("김민수 상태를 정지(으)로 변경했습니다. API-001"),
    ).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "permission" }));

    expect(
      screen.getByText("이 화면은 관리자 권한이 필요합니다."),
    ).toBeInTheDocument();
  });

  it("lets admins change a user's 3-tier membership tier", async () => {
    const user = userEvent.setup();
    renderAdminShell("/admin/users");

    const targetRow = screen.getByText("박소연").closest("tr");
    expect(targetRow).not.toBeNull();
    expect(screen.getByLabelText("박소연 등급 변경")).toHaveValue("member");

    await user.selectOptions(screen.getByLabelText("박소연 등급 변경"), "verified_doctor");

    expect(screen.getByLabelText("박소연 등급 변경")).toHaveValue("verified_doctor");
    expect(screen.getByRole("status")).toHaveTextContent(
      "박소연 회원 등급을 의사인증회원으로 변경했습니다",
    );
  });
});
