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
    renderShell("/items/content-lung-checklist");

    expect(
      screen.getByRole("heading", { name: "폐암 치료 체크리스트" }),
    ).toBeInTheDocument();
    expect(screen.getByTestId("scr-006-fld-01")).toBeInTheDocument();
    expect(screen.getByTestId("scr-006-fld-02")).toBeInTheDocument();

    const metadata = screen.getByTestId("scr-006-fld-03");
    expect(within(metadata).getByText("published")).toBeInTheDocument();
    expect(within(metadata).getByText("free")).toBeInTheDocument();
    expect(within(metadata).getByText("폐암")).toBeInTheDocument();

    expect(screen.getByTestId("scr-006-act-01")).toBeInTheDocument();
    expect(screen.getByTestId("scr-006-act-02")).toBeInTheDocument();
  });

  it("gates the primary action behind auth and completes it after login", async () => {
    const user = userEvent.setup();
    renderShell("/items/content-lung-checklist");

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
    renderShell("/items/content-lung-checklist");

    await user.click(screen.getByTestId("scr-006-act-02"));

    expect(screen.getByText("저장하기 선택 완료")).toBeInTheDocument();
  });

  it("shows the empty state for an unknown item id", () => {
    renderShell("/items/kim-geongang");

    expect(screen.getByText("표시할 상세 정보가 없어요.")).toBeInTheDocument();
    expect(screen.queryByTestId("scr-006-fld-01")).not.toBeInTheDocument();
  });

  it("recovers from the error state via retry", async () => {
    const user = userEvent.setup();
    renderShell("/items/content-lung-checklist?state=error");

    expect(screen.getByText("일시적인 문제가 발생했어요.")).toBeInTheDocument();

    await user.click(screen.getByTestId("scr-006-retry"));

    expect(
      screen.getByRole("heading", { name: "폐암 치료 체크리스트" }),
    ).toBeInTheDocument();
  });

  it("renders the permission state when forced via query param", () => {
    renderShell("/items/content-lung-checklist?state=permission");

    expect(screen.getByText("접근 권한이 없어요.")).toBeInTheDocument();
    expect(screen.queryByTestId("scr-006-fld-01")).not.toBeInTheDocument();
  });

  it("renders the loading state when forced via query param", () => {
    renderShell("/items/content-lung-checklist?state=loading");

    expect(screen.getByRole("status", { name: "상세 정보를 불러오는 중" })).toBeInTheDocument();
  });
});
