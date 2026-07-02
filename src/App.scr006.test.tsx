import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";
import { AppShell } from "./App";

function renderShell(initialPath: string) {
  window.history.pushState({}, "", initialPath);
  return render(<AppShell />);
}

describe("SCR-006 content detail (Content Catalog)", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("renders the default detail with header, metadata, and related actions", () => {
    renderShell("/items/ITEM-0001");

    expect(
      screen.getByRole("heading", { name: "선택한 항목의 상세 정보" }),
    ).toBeInTheDocument();
    expect(screen.getByTestId("scr-006-fld-01")).toBeInTheDocument();
    expect(screen.getByTestId("scr-006-fld-02")).toBeInTheDocument();

    const metadata = screen.getByTestId("scr-006-fld-03");
    expect(within(metadata).getByText("활성")).toBeInTheDocument();
    expect(within(metadata).getByText("공개")).toBeInTheDocument();
    expect(within(metadata).getByText("2026.07.01")).toBeInTheDocument();

    expect(screen.getByTestId("scr-006-act-01")).toBeInTheDocument();
    expect(screen.getByTestId("scr-006-act-02")).toBeInTheDocument();
  });

  it("gates the primary action behind auth and completes it after login", async () => {
    const user = userEvent.setup();
    renderShell("/items/ITEM-0001");

    await user.click(screen.getByTestId("scr-006-act-01"));

    // Guest → auth modal is required before the protected action resolves.
    const dialog = screen.getByRole("dialog", { name: "로그인이 필요합니다" });
    expect(within(dialog).getByText("주요 액션 선택")).toBeInTheDocument();

    await user.type(within(dialog).getByLabelText("이메일"), "member@aiga.test");
    await user.click(within(dialog).getByRole("button", { name: "로그인" }));

    expect(await screen.findByText("주요 액션 완료")).toBeInTheDocument();
  });

  it("selects a related item without requiring auth", async () => {
    const user = userEvent.setup();
    renderShell("/items/ITEM-0001");

    await user.click(screen.getByTestId("scr-006-act-02"));

    expect(screen.getByText("관련 항목 1 선택 완료")).toBeInTheDocument();
  });

  it("shows the empty state for an unknown item id", () => {
    renderShell("/items/does-not-exist");

    expect(screen.getByText("표시할 상세 정보가 없어요.")).toBeInTheDocument();
    expect(screen.queryByTestId("scr-006-fld-01")).not.toBeInTheDocument();
  });

  it("recovers from the error state via retry", async () => {
    const user = userEvent.setup();
    renderShell("/items/ITEM-0001?state=error");

    expect(screen.getByText("일시적인 문제가 발생했어요.")).toBeInTheDocument();

    await user.click(screen.getByTestId("scr-006-retry"));

    expect(
      screen.getByRole("heading", { name: "선택한 항목의 상세 정보" }),
    ).toBeInTheDocument();
  });

  it("renders the permission state when forced via query param", () => {
    renderShell("/items/ITEM-0001?state=permission");

    expect(screen.getByText("접근 권한이 없어요.")).toBeInTheDocument();
    expect(screen.queryByTestId("scr-006-fld-01")).not.toBeInTheDocument();
  });

  it("renders the loading state when forced via query param", () => {
    renderShell("/items/ITEM-0001?state=loading");

    expect(screen.getByRole("status", { name: "상세 정보를 불러오는 중" })).toBeInTheDocument();
  });
});
