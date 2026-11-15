import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import Home from "./index";

// Tracer spec for the client's unit-test tier (issue #15): it pins the
// scaffold's observable behavior and proves the vitest + Testing Library
// machinery works. It moves into the home-page slice with the page itself
// (issue #16) and evolves into the landing spec (issue #17).
describe("home page (scaffold)", () => {
  it("renders the getting-started heading", () => {
    render(<Home />);

    expect(
      screen.getByRole("heading", { level: 1, name: /To get started/i }),
    ).toBeTruthy();
  });
});
