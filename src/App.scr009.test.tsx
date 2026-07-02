import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";
import { AppShell } from "./App";

const DRAFT_KEY = "aiga.content-editor.draft";

function renderShell(initialPath = "/items/new") {
  window.history.pushState({}, "", initialPath);
  return render(<AppShell />);
}

async function login(user: ReturnType<typeof userEvent.setup>) {
  // From the editor permission panel, open the auth modal and sign in.
  await user.click(screen.getByRole("button", { name: "로그인하러 가기" }));
  const dialog = screen.getByRole("dialog", { name: "로그인이 필요합니다" });
  await user.type(within(dialog).getByLabelText("이메일"), "member@aiga.test");
  await user.click(within(dialog).getByRole("button", { name: "로그인" }));
}

describe("SCR-009 content editor (Content Catalog)", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("shows the permission gate for guests", () => {
    renderShell();

    expect(screen.getByTestId("scr-009-permission")).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "로그인이 필요합니다" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "로그인하러 가기" }),
    ).toBeInTheDocument();
  });

  it("renders the editor form after login with save disabled until valid", async () => {
    const user = userEvent.setup();
    renderShell();

    await login(user);

    expect(screen.getByRole("heading", { name: "작성/편집" })).toBeInTheDocument();
    expect(screen.getByTestId("scr-009-fld-01")).toBeInTheDocument();
    expect(screen.getByTestId("scr-009-fld-02")).toBeInTheDocument();
    expect(screen.getByTestId("scr-009-fld-03")).toBeInTheDocument();
    expect(screen.getByTestId("scr-009-fld-04")).toBeInTheDocument();
    expect(screen.getByTestId("scr-009-fld-05")).toBeInTheDocument();
    expect(screen.getByTestId("scr-009-fld-06")).toBeInTheDocument();
    expect(screen.getByLabelText("상태")).toHaveValue("draft");

    // Empty draft → save disabled (required title + body missing).
    expect(screen.getByTestId("scr-009-act-01")).toBeDisabled();

    // Title only is still not enough.
    await user.type(screen.getByLabelText("제목"), "폐암 치료 후기");
    expect(screen.getByTestId("scr-009-act-01")).toBeDisabled();

    // Title + body → save enabled.
    await user.type(screen.getByLabelText("내용"), "치료 경과와 회복 과정을 정리했습니다.");
    expect(screen.getByTestId("scr-009-act-01")).toBeEnabled();
  });

  it("persists a draft to localStorage and shows the success state on save", async () => {
    const user = userEvent.setup();
    renderShell();

    await login(user);

    await user.type(screen.getByLabelText("제목"), "위암 정기검진 정리");
    await user.selectOptions(screen.getByLabelText("카테고리"), "free");
    await user.type(screen.getByLabelText("요약"), "검진 전후로 확인할 핵심 내용을 정리했습니다.");
    await user.type(screen.getByLabelText("질환 태그"), "위암, 정기검진");
    await user.type(screen.getByLabelText("내용"), "검진 주기와 준비물을 공유합니다.");

    await user.click(screen.getByTestId("scr-009-act-01"));

    expect(await screen.findByText("임시 저장되었습니다.")).toBeInTheDocument();

    const stored = JSON.parse(window.localStorage.getItem(DRAFT_KEY) ?? "{}");
    expect(stored).toMatchObject({
      title: "위암 정기검진 정리",
      category: "free",
      conditionTags: ["위암", "정기검진"],
      status: "draft",
      summary: "검진 전후로 확인할 핵심 내용을 정리했습니다.",
      body: "검진 주기와 준비물을 공유합니다.",
    });
    expect(stored.savedAt).toEqual(expect.any(String));
  });

  it("cancels back to the community route", async () => {
    const user = userEvent.setup();
    renderShell();

    await login(user);
    await user.click(screen.getByTestId("scr-009-act-02"));

    expect(window.location.pathname).toBe("/community");
  });
});
