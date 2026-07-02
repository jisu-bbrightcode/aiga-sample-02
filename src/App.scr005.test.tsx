import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";
import { AppShell } from "./App";

function renderShell(initialPath = "/items") {
  window.history.pushState({}, "", initialPath);
  return render(<AppShell />);
}

describe("SCR-005 content list (Content Catalog)", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("renders the default list with category/sort/list/pagination fields", () => {
    renderShell();

    expect(screen.getByRole("heading", { name: "목록" })).toBeInTheDocument();
    expect(screen.getByTestId("scr-005-fld-01")).toBeInTheDocument();
    expect(screen.getByTestId("scr-005-fld-02")).toBeInTheDocument();
    expect(screen.getByTestId("scr-005-fld-03")).toBeInTheDocument();
    expect(screen.getByTestId("scr-005-fld-04")).toBeInTheDocument();

    // Default category 자유(free) → public ContentItem cards are visible.
    const list = screen.getByTestId("scr-005-fld-03");
    expect(within(list).getByText("폐암 치료 체크리스트")).toBeInTheDocument();
    expect(within(list).getByText("항암 치료 중 식사 기록")).toBeInTheDocument();
    expect(within(list).queryByText("김건강")).not.toBeInTheDocument();

    const toolbar = screen.getByTestId("scr-005-fld-02").closest(".scr-items-toolbar");
    expect(toolbar).not.toBeNull();
    expect(within(toolbar as HTMLElement).getByText("2")).toBeInTheDocument();
  });

  it("re-sorts the list when a different sort option is chosen", async () => {
    const user = userEvent.setup();
    renderShell();

    // Default sort = 최신순: newest published ContentItem first.
    let cards = screen.getAllByTestId("scr-005-act-03");
    expect(cards[0]).toHaveTextContent("폐암 치료 체크리스트");

    await user.click(screen.getByRole("radio", { name: "조회순" }));
    cards = screen.getAllByTestId("scr-005-act-03");
    expect(cards[0]).toHaveTextContent("항암 치료 중 식사 기록");

    await user.click(screen.getByRole("radio", { name: "제목순" }));
    cards = screen.getAllByTestId("scr-005-act-03");
    expect(cards[0]).toHaveTextContent("항암 치료 중 식사 기록");
  });

  it("filters by subcategory and shows the empty state when there are no matches", async () => {
    const user = userEvent.setup();
    renderShell();

    await user.click(screen.getByRole("tab", { name: "공지" }));

    expect(screen.getByText("검색 결과가 없어요")).toBeInTheDocument();
    expect(screen.queryByTestId("scr-005-fld-03")).not.toBeInTheDocument();
  });

  it("switching category shows only ContentItem records for that category", async () => {
    const user = userEvent.setup();
    renderShell();

    await user.click(screen.getByRole("tab", { name: "질문/답변" }));

    expect(screen.getByText("진료 전 질문 준비법")).toBeInTheDocument();
    expect(screen.queryByText("폐암 치료 체크리스트")).not.toBeInTheDocument();
  });

  it("navigates to the detail route (SCR-006) when a list card is activated", async () => {
    const user = userEvent.setup();
    renderShell();

    await user.click(screen.getAllByTestId("scr-005-act-03")[0]);

    expect(window.location.pathname).toBe("/items/content-lung-checklist");
  });

  it("renders the loading state when forced via query param", () => {
    const { container } = renderShell("/items?state=loading");

    // Toolbar chrome stays mounted; content area shows the loading skeleton.
    expect(screen.getByRole("tablist", { name: "카테고리" })).toBeInTheDocument();
    expect(container.querySelector('[data-state="loading"]')).toBeInTheDocument();
    expect(screen.queryByTestId("scr-005-fld-03")).not.toBeInTheDocument();
  });

  it("renders the error state with a recoverable retry", async () => {
    const user = userEvent.setup();
    renderShell("/items?state=error");

    expect(screen.getByText("일시적인 문제가 발생했어요.")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "새로 고침" }));

    // Retry resets to default and shows the list again.
    expect(screen.getByTestId("scr-005-fld-03")).toBeInTheDocument();
  });

  it("renders the permission state when forced via query param", () => {
    renderShell("/items?state=permission");

    expect(screen.getByText("접근 권한이 필요합니다")).toBeInTheDocument();
    expect(screen.queryByTestId("scr-005-fld-03")).not.toBeInTheDocument();
  });
});
