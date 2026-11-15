import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Header } from "./index";

describe("site header", () => {
  it("links back home through the brand", () => {
    render(<Header />);

    expect(
      screen
        .getByRole("link", { name: "Календарь звонков" })
        .getAttribute("href"),
    ).toBe("/");
  });

  it("leads to the booking page", () => {
    render(<Header />);

    expect(
      screen.getByRole("link", { name: "Записаться" }).getAttribute("href"),
    ).toBe("/booking");
  });
});
