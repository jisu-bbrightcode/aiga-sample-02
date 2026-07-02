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

    // Default subcategory 위암 → both 위암 doctors are visible.
    const list = screen.getByTestId("scr-005-fld-03");
    expect(within(list).getByText("김건강")).toBeInTheDocument();
    expect(within(list).getByText("박건강")).toBeInTheDocument();

    // Total count comes from itemTotalsBySubcategory (위암 = 20).
    expect(screen.getByText("20")).toBeInTheDocument();
  });

  it("re-sorts the list when a different sort option is chosen", async () => {
    const user = userEvent.setup();
    renderShell();

    // Default sort = 환자 경험 (patientScore): 김건강(98) before 박건강(95).
    let cards = screen.getAllByTestId("scr-005-act-03");
    expect(cards[0]).toHaveTextContent("김건강");

    // 동료 추천 (peerScore): 박건강(97) before 김건강(93).
    await user.click(screen.getByRole("radio", { name: "동료 추천" }));
    cards = screen.getAllByTestId("scr-005-act-03");
    expect(cards[0]).toHaveTextContent("박건강");

    // 거리 (distanceKm asc): 김건강(1.2km) before 박건강(3.1km).
    await user.click(screen.getByRole("radio", { name: "거리" }));
    cards = screen.getAllByTestId("scr-005-act-03");
    expect(cards[0]).toHaveTextContent("김건강");
  });

  it("filters by subcategory and shows the empty state when there are no matches", async () => {
    const user = userEvent.setup();
    renderShell();

    // 갑상선암 has no directory items → empty state panel.
    await user.click(screen.getByRole("button", { name: "갑상선암" }));

    expect(screen.getByText("검색 결과가 없어요")).toBeInTheDocument();
    expect(screen.queryByTestId("scr-005-fld-03")).not.toBeInTheDocument();
  });

  it("switching top-level category resets the active subcategory group", async () => {
    const user = userEvent.setup();
    renderShell();

    await user.click(screen.getByRole("tab", { name: "척추/관절" }));

    // First subcategory chip of the new group becomes active/available.
    expect(screen.getByRole("button", { name: "허리디스크" })).toBeInTheDocument();
    // 척추/관절 has no seeded directory items → empty state.
    expect(screen.getByText("검색 결과가 없어요")).toBeInTheDocument();
  });

  it("navigates to the detail route (SCR-006) when a list card is activated", async () => {
    const user = userEvent.setup();
    renderShell();

    await user.click(screen.getAllByTestId("scr-005-act-03")[0]);

    expect(window.location.pathname).toBe("/items/kim-geongang");
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
