import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";
import { AppShell } from "./App";

function renderShell(initialPath = "/search") {
  window.history.pushState({}, "", initialPath);
  return render(<AppShell />);
}

describe("SCR-004 integrated search", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("renders default state, then separates empty state after a no-result query", async () => {
    const user = userEvent.setup();
    renderShell();

    const queryInput = screen.getByTestId("scr-004-fld-01");

    expect(
      screen.getByRole("heading", { name: "통합 검색" }),
    ).toBeInTheDocument();
    expect(queryInput).toHaveAttribute("type", "search");
    expect(screen.getByTestId("scr-004-act-01")).toBeInTheDocument();
    expect(screen.getByText("증상이 있으신가요?")).toBeInTheDocument();
    expect(
      screen.queryByText("검색 결과가 없습니다"),
    ).not.toBeInTheDocument();

    await user.type(queryInput, "없는검색어");

    expect(screen.getByText("검색 중...")).toBeInTheDocument();
    expect(await screen.findByText("검색 결과가 없습니다")).toBeInTheDocument();
    expect(
      screen.queryByText("증상이 있으신가요?"),
    ).not.toBeInTheDocument();
  });

  it("searches across result tabs, applies filters, and selects a result", async () => {
    const user = userEvent.setup();
    renderShell();

    await user.type(screen.getByTestId("scr-004-fld-01"), "폐암");

    expect(await screen.findByText("폐암 치료 체크리스트")).toBeInTheDocument();
    expect(screen.getByTestId("scr-004-fld-02")).toBeInTheDocument();
    expect(screen.getByTestId("scr-004-fld-03")).toBeInTheDocument();
    expect(screen.getByTestId("scr-004-fld-04")).toBeInTheDocument();
    expect(screen.getAllByTestId("scr-004-act-02")).toHaveLength(1);
    expect(screen.getByTestId("scr-004-act-02")).toHaveAttribute("data-result-type", "content");

    await user.click(screen.getByRole("tab", { name: "커뮤니티 (1)" }));

    expect(screen.getByText("폐암 수술 후 회복 경험")).toBeInTheDocument();
    expect(screen.getAllByTestId("scr-004-act-02")).toHaveLength(1);
    expect(screen.getByTestId("scr-004-act-02")).toHaveAttribute("data-result-type", "community");

    await user.click(screen.getByRole("button", { name: "디렉터리" }));

    expect(await screen.findByText("김건강")).toBeInTheDocument();
    expect(screen.getAllByText("서울대학교병원").length).toBeGreaterThan(0);
    expect(screen.queryByText("폐암 치료 체크리스트")).not.toBeInTheDocument();
    expect(screen.getAllByTestId("scr-004-act-02")).toHaveLength(2);
    for (const result of screen.getAllByTestId("scr-004-act-02")) {
      expect(result).toHaveAttribute("data-result-type", "directory");
      expect(within(result).queryByText("ContentItem · free")).not.toBeInTheDocument();
      expect(within(result).queryByText("커뮤니티 · 김건강")).not.toBeInTheDocument();
    }

    await user.click(screen.getAllByTestId("scr-004-act-02")[0]);

    expect(
      screen.getByText("김건강 결과를 선택했습니다."),
    ).toBeInTheDocument();
  });

  it("shows recoverable error and guest permission states", async () => {
    const user = userEvent.setup();
    renderShell();

    const queryInput = screen.getByTestId("scr-004-fld-01");

    await user.type(queryInput, "error");

    expect(
      await screen.findByText("일시적인 문제가 발생했어요."),
    ).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "다시 시도" }));

    expect(screen.getByText("검색 중...")).toBeInTheDocument();
    expect(
      await screen.findByText("일시적인 문제가 발생했어요."),
    ).toBeInTheDocument();

    await user.clear(queryInput);
    await user.type(queryInput, "폐암");
    expect(await screen.findByText("폐암 치료 체크리스트")).toBeInTheDocument();

    await user.clear(queryInput);
    await user.type(queryInput, "감기");

    expect(
      await screen.findByText("오늘 검색을 모두 사용했어요."),
    ).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "가입하고 계속 검색" }));

    expect(
      screen.getByRole("dialog", { name: "로그인이 필요합니다" }),
    ).toBeInTheDocument();
    expect(screen.getByText("통합 검색 계속 이용")).toBeInTheDocument();
  });
});
