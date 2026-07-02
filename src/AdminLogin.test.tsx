import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";
import App from "./App";

function renderAdminLogin(initialPath = "/admin/login") {
  window.localStorage.clear();
  window.history.pushState({}, "", initialPath);
  return render(<App />);
}

describe("SCR-011 admin login", () => {
  afterEach(() => {
    window.localStorage.clear();
  });

  it("renders the default login contract and shows empty field errors separately", async () => {
    const user = userEvent.setup();

    renderAdminLogin();

    expect(
      screen.getByRole("heading", { name: "관리자 로그인" }),
    ).toBeInTheDocument();
    expect(screen.getByText("운영자 관리 영역")).toBeInTheDocument();
    expect(screen.getByText("/admin/login · 공개")).toBeInTheDocument();
    expect(screen.getByTestId("scr-011-fld-01")).toHaveValue("");
    expect(screen.getByTestId("scr-011-fld-02")).toHaveValue("");

    await user.click(screen.getByTestId("scr-011-act-01"));

    expect(screen.getByText("이메일을 입력해 주세요.")).toBeInTheDocument();
    expect(screen.getByText("비밀번호를 입력해 주세요.")).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("shows loading and a recoverable error for invalid credentials", async () => {
    const user = userEvent.setup();

    renderAdminLogin();

    await user.type(screen.getByTestId("scr-011-fld-01"), "visitor@outside.test");
    await user.type(screen.getByTestId("scr-011-fld-02"), "wrong-password");
    await user.click(screen.getByTestId("scr-011-act-01"));

    expect(screen.getByTestId("scr-011-act-01")).toBeDisabled();
    expect(screen.getByTestId("scr-011-act-01")).toHaveTextContent("로그인 중...");

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("이메일 또는 비밀번호가 올바르지 않습니다.");
    expect(alert).toHaveTextContent("입력값을 확인한 후 다시 시도해 주세요.");
    expect(screen.getByTestId("scr-011-act-01")).toBeEnabled();
  });

  it("shows the permission state for an authenticated non-admin account", async () => {
    const user = userEvent.setup();

    renderAdminLogin();

    const password = screen.getByTestId("scr-011-fld-02");
    expect(password).toHaveAttribute("type", "password");

    await user.click(screen.getByRole("button", { name: "비밀번호 표시" }));
    expect(password).toHaveAttribute("type", "text");

    await user.type(screen.getByTestId("scr-011-fld-01"), "member@example.com");
    await user.type(password, "member-password");
    await user.click(screen.getByTestId("scr-011-act-01"));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "관리자 권한이 없는 계정입니다. 접근이 제한되었습니다.",
    );
  });

  it("submits ACT-01 and opens the admin dashboard for admin credentials", async () => {
    const user = userEvent.setup();

    renderAdminLogin();

    await user.type(screen.getByTestId("scr-011-fld-01"), "admin@example.com");
    await user.type(screen.getByTestId("scr-011-fld-02"), "admin");
    await user.click(screen.getByTestId("scr-011-act-01"));

    await waitFor(() => expect(window.location.pathname).toBe("/admin/dashboard"));
    // Route change and dashboard render are separate effects; await the heading
    // so the assertion does not race the post-navigation paint under load.
    expect(
      await screen.findByRole("heading", { name: "대시보드" }),
    ).toBeInTheDocument();
    expect(window.localStorage.getItem("aiga.admin.session")).toContain(
      "admin@example.com",
    );
  });
});
