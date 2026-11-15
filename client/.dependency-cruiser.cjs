/** @type {import('dependency-cruiser').IConfiguration} */
module.exports = {
  options: {
    // don't cruise inside installed packages; their internals are not ours to fix
    doNotFollow: { path: "node_modules" },
    // resolve the `@/*` path aliases declared in tsconfig.json
    tsConfig: { fileName: "tsconfig.json" },
  },
  forbidden: [
    {
      name: "no-circular",
      severity: "error",
      comment: "circular imports break module initialization order",
      from: {},
      to: { circular: true },
    },
    {
      name: "not-unresolvable",
      severity: "error",
      comment: "imports that cannot be resolved fail at runtime",
      from: {},
      to: { couldNotResolve: true },
    },
    {
      name: "not-to-dev-dependencies",
      severity: "error",
      comment: "production code must not import devDependencies",
      // Spec files live next to the code they test; they are test code
      from: { path: "^(app|src)/", pathNot: "\\.spec\\.tsx?$" },
      to: { dependencyTypes: ["npm-dev"] },
    },
    // --- Feature-Sliced Design (docs/adr/0001-fsd-for-the-nextjs-client.md) ---
    //
    // Layers, top to bottom: app > _pages > widgets > shared (the `app/`
    // directory is Next.js routing only). Imports flow only downward. A
    // slice is a folder under its layer whose public API is its index.ts(x);
    // slices are single-module today (the code lives in the index file
    // itself), so every same-layer import is a cross-slice import.
    {
      name: "fsd-no-upward-from-shared",
      severity: "error",
      comment: "shared is the bottom layer and must not import above it",
      from: { path: "^src/shared/" },
      to: { path: "^(app/|src/(_pages|widgets)/)" },
    },
    {
      name: "fsd-no-upward-from-widgets",
      severity: "error",
      comment: "widgets may import shared only, not the layers above them",
      from: { path: "^src/widgets/" },
      to: { path: "^(app/|src/_pages/)" },
    },
    {
      name: "fsd-no-upward-from-pages",
      severity: "error",
      comment: "screens may import widgets and shared, not app/ routing",
      from: { path: "^src/_pages/" },
      to: { path: "^app/" },
    },
    {
      name: "fsd-no-cross-slice-in-shared",
      severity: "error",
      comment: "slices never import each other within a layer",
      from: { path: "^src/shared/", pathNot: "\\.spec\\.tsx?$" },
      to: { path: "^src/shared/" },
    },
    {
      name: "fsd-no-cross-slice-in-widgets",
      severity: "error",
      comment: "slices never import each other within a layer",
      from: { path: "^src/widgets/", pathNot: "\\.spec\\.tsx?$" },
      to: { path: "^src/widgets/" },
    },
    {
      name: "fsd-no-cross-slice-in-pages",
      severity: "error",
      comment: "slices never import each other within a layer",
      from: { path: "^src/_pages/", pathNot: "\\.spec\\.tsx?$" },
      to: { path: "^src/_pages/" },
    },
    {
      name: "fsd-no-deep-imports-from-app",
      severity: "error",
      comment: "a slice is imported only through its public index, never deep",
      from: { path: "^app/" },
      to: {
        path: "^src/(_pages|widgets|shared)/[^/]+/.+",
        pathNot: "index\\.tsx?$",
      },
    },
    {
      name: "fsd-no-deep-imports-from-pages",
      severity: "error",
      comment: "a slice is imported only through its public index, never deep",
      from: { path: "^src/_pages/" },
      to: {
        path: "^src/(widgets|shared)/[^/]+/.+",
        pathNot: "index\\.tsx?$",
      },
    },
    {
      name: "fsd-no-deep-imports-from-widgets",
      severity: "error",
      comment: "a slice is imported only through its public index, never deep",
      from: { path: "^src/widgets/" },
      to: {
        path: "^src/shared/[^/]+/.+",
        pathNot: "index\\.tsx?$",
      },
    },
  ],
};
