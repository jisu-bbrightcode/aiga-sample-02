import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { AppShell } from "./App";

function renderShell(initialPath = "/") {
  window.history.pushState({}, "", initialPath);
  return render(<AppShell />);
}

describe("AppShell", () => {
  it("keeps public browse content visible for signed-out visitors", () => {
    renderShell();

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
    renderShell();

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
});
