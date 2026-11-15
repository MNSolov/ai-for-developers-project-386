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
      // Spec files live next to the pages they test in app/; they are test code
      from: { path: "^(app|components|lib)/", pathNot: "\\.spec\\.tsx?$" },
      to: { dependencyTypes: ["npm-dev"] },
    },
  ],
};
