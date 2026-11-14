import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { once } from 'node:events';
import net from 'node:net';
import path from 'node:path';
import type { ChildProcess } from 'node:child_process';

// The entry `npm run start:prod` runs. `npm run test:smoke` builds it first;
// running this suite directly requires `npm run build`.
const productionEntry = path.join(import.meta.dirname, '..', 'dist', 'main.js');

const host = '127.0.0.1';
const bootTimeoutMs = 20_000;
const pollIntervalMs = 100;
const shutdownGraceMs = 5_000;

const sleep = (ms: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, ms));

// Binds a throwaway TCP server to port 0 and returns the port the OS picked,
// so the smoke run never fights a developer's running server for port 3000.
function reservePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const probe = net.createServer();
    probe.once('error', reject);
    probe.listen(0, host, () => {
      const address = probe.address();
      if (address === null || typeof address === 'string') {
        reject(new Error('probe server did not bind to a TCP port'));
        return;
      }
      const { port } = address;
      probe.close(() => resolve(port));
    });
  });
}

async function stopProcess(
  server: ChildProcess,
  exited: Promise<unknown>,
): Promise<void> {
  server.kill('SIGTERM');
  const stoppedInGrace = await Promise.race([
    exited.then(() => true),
    sleep(shutdownGraceMs).then(() => false),
  ]);
  if (!stoppedInGrace) {
    server.kill('SIGKILL');
    await exited;
  }
}

describe('api launch (smoke)', () => {
  it(
    'boots the production build and serves GET /',
    { timeout: bootTimeoutMs + 10_000 },
    async () => {
      if (!existsSync(productionEntry)) {
        throw new Error(
          `production build not found at ${productionEntry} — run \`npm run build\` (or \`npm run test:smoke\`, which builds first)`,
        );
      }

      const port = await reservePort();
      const baseUrl = `http://${host}:${port}/`;
      const server = spawn(process.execPath, [productionEntry], {
        env: { ...process.env, PORT: String(port) },
        stdio: ['ignore', 'pipe', 'pipe'],
      });
      const exited = once(server, 'exit');
      const output: string[] = [];
      server.stdout?.on('data', (chunk) => output.push(String(chunk)));
      server.stderr?.on('data', (chunk) => output.push(String(chunk)));
      let exitDetails: string | null = null;
      server.once('exit', (code, signal) => {
        exitDetails =
          signal === null ? `exit code ${code}` : `killed by ${signal}`;
      });

      try {
        const deadline = Date.now() + bootTimeoutMs;
        let response: Response | undefined;
        while (response === undefined) {
          if (exitDetails !== null) {
            const reason: string = exitDetails;
            throw new Error(
              `server exited during boot (${reason}):\n${output.join('')}`,
            );
          }
          if (Date.now() > deadline) {
            throw new Error(
              `no HTTP response from ${baseUrl} within ${bootTimeoutMs} ms:\n${output.join('')}`,
            );
          }
          try {
            response = await fetch(baseUrl);
          } catch {
            await sleep(pollIntervalMs);
          }
        }

        expect(response.status).toBe(200);
        expect(await response.text()).toBe('Hello World!');
      } finally {
        await stopProcess(server, exited);
      }
    },
  );
});
