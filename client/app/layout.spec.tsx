import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import RootLayout, { metadata } from "./layout";

// The root layout renders <html>/<body>, which react-dom strips when
// mounted into a test container div, so the spec observes its real output
// instead: the server-rendered document, exactly what Next.js ships to
// the browser.
const renderDocument = () => {
  const html = renderToString(
    <RootLayout params={Promise.resolve({})}>
      <p>Контент страницы</p>
    </RootLayout>,
  );
  return new DOMParser().parseFromString(html, "text/html");
};

describe("root layout", () => {
  it("renders the document in Russian", () => {
    expect(renderDocument().documentElement.getAttribute("lang")).toBe("ru");
  });

  it("wraps the page content in the document shell", () => {
    expect(renderDocument().body.textContent).toContain("Контент страницы");
  });

  it("carries the product metadata", () => {
    expect(metadata.title).toBe("Календарь звонков");
    // The domain language of GLOSSARY.md: the запись word family, never
    // «бронирование», in product-facing texts.
    expect(metadata.description).toContain("запис");
    expect(metadata.description).not.toContain("бронирован");
  });
});
