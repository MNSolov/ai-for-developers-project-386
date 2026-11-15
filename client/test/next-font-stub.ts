// Test-environment stub for `next/font/google`. The real module only works
// inside a Next.js build, where it fetches and self-hosts font files at
// build time; a plain vitest run is no such environment (importing it in a
// spec yields "Geist is not a function"). Specs that render modules using
// next/font — app/layout.tsx today — get this stub with the same call
// shape via the resolve.alias in vitest.config.ts. Font loading itself is
// covered by the launch-smoke suite, not by unit specs.
type FontFn = (options: Record<string, unknown>) => {
  className: string;
  variable: string;
  style: { fontFamily: string };
};

const fontFn =
  (name: string): FontFn =>
  () => ({
    className: `stub-${name}-className`,
    variable: `--stub-${name}-variable`,
    style: { fontFamily: `stub-${name}` },
  });

export const Geist = fontFn("geist");
export const Geist_Mono = fontFn("geist-mono");
