import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { UserEvent } from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { AppShell } from "./App";

function renderShell(initialPath = "/") {
  window.history.pushState({}, "", initialPath);
  return render(<AppShell />);
}

// Drives the review CTA -> auth modal -> login, resuming into the review form.
async function openReviewFormAs(user: UserEvent, email: string) {
  await user.click(screen.getByRole("button", { name: /리뷰 작성|내 리뷰 수정/ }));
  await user.type(screen.getByLabelText("이메일"), email);
  await user.type(screen.getByLabelText("비밀번호"), "password");
  await user.click(screen.getByRole("button", { name: "로그인" }));
}

describe("ReviewRating — public aggregate & display", () => {
  it("shows public review summary with expert-badged review authors", () => {
    renderShell();

    expect(
      screen.getByRole("heading", { name: "전문의 프로필 리뷰" }),
    ).toBeInTheDocument();
    expect(screen.getByText("평균 4.7")).toBeInTheDocument();
    expect(screen.getByText("3개 리뷰")).toBeInTheDocument();
    expect(screen.getAllByText(/전문가 뱃지/)[0]).toBeInTheDocument();
  });

  it("renders one expert badge per review author in the public list", () => {
    renderShell();

    const list = screen.getByRole("list", { name: "프로필 리뷰 목록" });
    const badges = within(list).getAllByText(/전문가 뱃지/);
    expect(badges).toHaveLength(3);
    expect(within(list).getByText("현장 적용성이 높습니다")).toBeInTheDocument();
    expect(within(list).getByText("근거와 한계를 함께 설명합니다")).toBeInTheDocument();
  });

  it("computes the average as a rounded one-decimal aggregate (5,4,5 -> 4.7)", () => {
    renderShell();

    // Distribution surfaces the raw counts backing the 평균 4.7 aggregate.
    const distribution = screen.getByLabelText("평점 분포");
    const fiveRow = within(distribution).getByText("5점").closest("div");
    const fourRow = within(distribution).getByText("4점").closest("div");
    expect(fiveRow).not.toBeNull();
    expect(fourRow).not.toBeNull();
    expect(within(fiveRow as HTMLElement).getByText("2")).toBeInTheDocument();
    expect(within(fourRow as HTMLElement).getByText("1")).toBeInTheDocument();
  });
});

describe("ReviewRating — verified doctor authoring", () => {
  it("lets a verified doctor write a review and updates the rating aggregate", async () => {
    const user = userEvent.setup();
    renderShell();

    await openReviewFormAs(user, "doctor@aiga.test");

    await user.click(screen.getByRole("button", { name: "5점 선택" }));
    await user.type(screen.getByLabelText("리뷰 제목"), "상담 흐름이 명확합니다");
    await user.type(
      screen.getByLabelText("리뷰 내용"),
      "동료 의료진이 바로 적용할 수 있는 설명과 근거가 좋았습니다.",
    );
    await user.click(screen.getByRole("button", { name: "리뷰 등록" }));

    expect(
      screen.getByText("박서연 프로필에 5점 리뷰가 등록되었습니다."),
    ).toBeInTheDocument();
    expect(screen.getByText("평균 4.8")).toBeInTheDocument();
    expect(screen.getByText("4개 리뷰")).toBeInTheDocument();
    expect(screen.getByText("상담 흐름이 명확합니다")).toBeInTheDocument();
  });

  it("validates that rating and body are required before submitting", async () => {
    const user = userEvent.setup();
    renderShell();

    await openReviewFormAs(user, "doctor@aiga.test");
    await user.click(screen.getByRole("button", { name: "리뷰 등록" }));

    expect(
      screen.getByText("평점과 리뷰 내용을 입력해 주세요."),
    ).toBeInTheDocument();
    // Aggregate stays untouched when submission is rejected.
    expect(screen.getByText("3개 리뷰")).toBeInTheDocument();
    expect(screen.getByText("평균 4.7")).toBeInTheDocument();
  });

  it("edits an existing review in place without inflating the review count", async () => {
    const user = userEvent.setup();
    renderShell();

    await openReviewFormAs(user, "doctor@aiga.test");
    await user.click(screen.getByRole("button", { name: "5점 선택" }));
    await user.type(screen.getByLabelText("리뷰 제목"), "첫 리뷰");
    await user.type(screen.getByLabelText("리뷰 내용"), "처음 남긴 리뷰 내용입니다.");
    await user.click(screen.getByRole("button", { name: "리뷰 등록" }));

    expect(screen.getByText("4개 리뷰")).toBeInTheDocument();

    // Re-open in edit mode and lower the rating.
    await user.click(screen.getByRole("button", { name: "내 리뷰 수정" }));
    await user.click(screen.getByRole("button", { name: "3점 선택" }));
    await user.click(screen.getByRole("button", { name: "리뷰 수정" }));

    expect(
      screen.getByText("박서연 프로필에 3점 리뷰가 수정되었습니다."),
    ).toBeInTheDocument();
    // Still four reviews — edit replaced the author's row rather than adding one.
    expect(screen.getByText("4개 리뷰")).toBeInTheDocument();
  });
});

describe("ReviewRating — authoring guards", () => {
  it("blocks a verified doctor from reviewing their own profile", async () => {
    const user = userEvent.setup();
    renderShell();

    // park.seoyeon@aiga.test is the review target profile owner.
    await openReviewFormAs(user, "park.seoyeon@aiga.test");

    expect(
      screen.getByText("본인 프로필에는 리뷰를 작성할 수 없습니다."),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "리뷰 등록" }),
    ).not.toBeInTheDocument();
  });

  it("blocks a general (non-verified) member from writing a review", async () => {
    const user = userEvent.setup();
    renderShell();

    await openReviewFormAs(user, "member@aiga.test");

    expect(
      screen.getByText("의사인증회원만 리뷰를 작성할 수 있습니다."),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "리뷰 등록" }),
    ).not.toBeInTheDocument();
  });
});
