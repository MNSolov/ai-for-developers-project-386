import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import BookingPage from "./index";

describe("booking page (stub)", () => {
  it("announces that booking arrives at the next stage", () => {
    render(<BookingPage />);

    expect(
      screen.getByRole("heading", { level: 1, name: "Запись на встречу" }),
    ).toBeTruthy();
    expect(screen.getByText(/Запись пока в разработке/)).toBeTruthy();
  });

  it("links back to the home page", () => {
    render(<BookingPage />);

    expect(
      screen.getByRole("link", { name: "На главную" }).getAttribute("href"),
    ).toBe("/");
  });
});
