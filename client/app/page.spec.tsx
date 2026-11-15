import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import Home from "./page";

describe("home page", () => {
  it("shows the hero heading and the service pitch", () => {
    render(<Home />);

    expect(
      screen.getByRole("heading", {
        level: 1,
        name: "Встречи по расписанию, а не по договорённостям",
      }),
    ).toBeTruthy();
    expect(
      screen.getByText(/создайте тип встречи, отправьте ссылку/),
    ).toBeTruthy();
  });

  it("leads to the booking page", () => {
    render(<Home />);

    const bookingLinks = screen.getAllByRole("link", { name: "Записаться" });
    expect(bookingLinks).not.toHaveLength(0);
    for (const link of bookingLinks) {
      expect(link.getAttribute("href")).toBe("/booking");
    }
  });

  it("shows the three how-it-works steps from the README flow", () => {
    render(<Home />);

    expect(
      screen.getByRole("heading", { level: 2, name: "Как это работает" }),
    ).toBeTruthy();
    expect(screen.getByText("Создайте тип встречи")).toBeTruthy();
    expect(screen.getByText("Поделитесь ссылкой")).toBeTruthy();
    expect(screen.getByText("Гость выберет слот")).toBeTruthy();
  });
});
