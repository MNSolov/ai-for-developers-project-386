import { spawn } from "node:child_process";
import { once } from "node:events";
import net from "node:net";
import { fileURLToPath } from "node:url";

// `next start` entry of the installed package, spawned through process.execPath
// so this script signals the actual server process, not an npm wrapper.
const nextCli = fileURLToPath(
  new URL("../node_modules/next/dist/bin/next", import.meta.url),
);

const host = "127.0.0.1";
const bootTimeoutMs = 30_000;
const pollIntervalMs = 200;
const shutdownGraceMs = 5_000;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Binds a throwaway TCP server to port 0 and returns the port the OS picked,
// so the smoke run never fights a developer's running server for port 3000.
const reservePort = () =>
  new Promise((resolve, reject) => {
    const probe = net.createServer();
    probe.once("error", reject);
    probe.listen(0, host, () => {
      const address = probe.address();
      if (address === null || typeof address === "string") {
        reject(new Error("probe server did not bind to a TCP port"));
        return;
      }
      const { port } = address;
      probe.close(() => resolve(port));
    });
  });

const waitForResponse = async (baseUrl, server, output) => {
  const deadline = Date.now() + bootTimeoutMs;
  for (;;) {
    if (server.exitCode !== null || server.signalCode !== null) {
      throw new Error(`\`next start\` exited during boot:\n${output.join("")}`);
    }
    if (Date.now() > deadline) {
      throw new Error(
        `no HTTP response from ${baseUrl} within ${bootTimeoutMs} ms:\n${output.join("")}`,
      );
    }
    try {
      return await fetch(baseUrl);
    } catch {
      await sleep(pollIntervalMs);
    }
  }
};

const stopServer = async (server, exited) => {
  server.kill("SIGTERM");
  const stoppedInGrace = await Promise.race([
    exited.then(() => true),
    sleep(shutdownGraceMs).then(() => false),
  ]);
  if (!stoppedInGrace) {
    server.kill("SIGKILL");
    await exited;
  }
};

const runSmokeCheck = async () => {
  const port = await reservePort();
  const baseUrl = `http://${host}:${port}/`;
  const server = spawn(process.execPath, [
    nextCli,
    "start",
    "-H",
    host,
    "-p",
    String(port),
  ]);
  const exited = once(server, "exit");
  const output = [];
  const collect = (chunk) => output.push(String(chunk));
  server.stdout?.on("data", collect);
  server.stderr?.on("data", collect);

  try {
    const response = await waitForResponse(baseUrl, server, output);
    const body = await response.text();

    const failures = [];
    if (response.status !== 200) {
      failures.push(`expected HTTP 200, got ${response.status}`);
    }
    const contentType = response.headers.get("content-type") ?? "";
    if (!contentType.startsWith("text/html")) {
      failures.push(`expected a text/html response, got "${contentType}"`);
    }
    if (!body.includes("</html>")) {
      failures.push(
        "expected a complete HTML document, response looks truncated",
      );
    }
    if (failures.length > 0) {
      throw new Error(
        `smoke check failed for ${baseUrl}:\n- ${failures.join("\n- ")}`,
      );
    }

    console.log(
      `smoke ok: ${baseUrl} answered HTTP ${response.status} with ${body.length} bytes of HTML`,
    );
  } finally {
    await stopServer(server, exited);
  }
};

runSmokeCheck().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
