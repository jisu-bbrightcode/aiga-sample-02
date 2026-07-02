import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { AppShell } from "./App";

function renderShell(initialPath = "/login") {
  window.history.pushState({}, "", initialPath);
  return render(<AppShell />);
}

describe("SCR-002 login screen", () => {
  it("renders the default state with required fields and actions", () => {
    renderShell();

    expect(
      screen.getByRole("heading", { name: "AIGA에 오신 것을 환영합니다" }),
    ).toBeInTheDocument();
    expect(screen.getByTestId("scr-002-fld-01")).toHaveAttribute(
      "data-field",
      "email",
    );
    expect(screen.getByTestId("scr-002-fld-02")).toHaveAttribute(
      "data-field",
      "password",
    );
    expect(screen.getByTestId("scr-002-fld-03")).toHaveAttribute(
      "data-field",
      "socialLogin",
    );
    expect(screen.getByTestId("scr-002-fld-04")).toHaveAttribute(
      "data-field",
      "loginButton",
    );

    expect(screen.getByTestId("scr-002-act-01")).toBeInTheDocument();
    expect(screen.getAllByTestId("scr-002-act-02")).toHaveLength(3);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("distinguishes empty, loading, and recoverable error states", async () => {
    const user = userEvent.setup();
    renderShell();

    await user.click(screen.getByTestId("scr-002-act-01"));

    expect(screen.getByRole("alert")).toHaveTextContent(
      "이메일과 비밀번호를 입력해 주세요.",
    );

    await user.type(screen.getByLabelText("이메일"), "doctor@aiga.test");
    await user.type(screen.getByLabelText("비밀번호"), "wrong");
    await user.click(screen.getByTestId("scr-002-act-01"));

    expect(screen.getByText("로그인 처리 중입니다.")).toBeInTheDocument();
    expect(screen.getByTestId("scr-002-act-01")).toBeDisabled();
    expect(
      await screen.findByText("이메일 또는 비밀번호가 올바르지 않습니다."),
    ).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "다시 입력" }));

    expect(
      screen.queryByText("이메일 또는 비밀번호가 올바르지 않습니다."),
    ).not.toBeInTheDocument();
  });
});
