/** @type {import('dependency-cruiser').IConfiguration} */
module.exports = {
  options: {
    // don't cruise inside installed packages; their internals are not ours to fix
    doNotFollow: { path: "node_modules" },
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
      // NestJS keeps spec files next to sources in src/; they are test code
      from: { path: "^src/", pathNot: "\\.spec\\.ts$" },
      to: { dependencyTypes: ["npm-dev"] },
    },
  ],
};
