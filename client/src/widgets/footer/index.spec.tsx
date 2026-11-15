import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Footer } from "./index";

describe("site footer", () => {
  it("carries the product tagline under the brand", () => {
    render(<Footer />);

    expect(screen.getByText(/Календарь звонков/)).toBeTruthy();
    expect(screen.getByText(/запись на встречи/)).toBeTruthy();
  });
});
