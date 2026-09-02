import { createServer, type Server } from 'node:http';
import { AddressInfo } from 'node:net';

/**
 * PROJECT ADAPTER — wire this to the real application.
 *
 * In mocked mode the app must run inside this process, because Nock patches
 * this process's HTTP stack. Starting the app with spawn/docker/sam-local puts
 * it beyond Nock's reach and the "mocks" will silently do nothing.
 *
 * Two common shapes:
 *
 * 1. An HTTP framework app (Express/Fastify/Hono):
 *      import { createApp } from '../../src/app.js';
 *      server = createApp().listen(0);
 *
 * 2. A Lambda handler behind API Gateway: wrap the handler in a node:http
 *    server that converts the request into an event and the result back into a
 *    response. Keep that translation here and nowhere else.
 */

let server: Server | undefined;

export async function startApp(): Promise<string> {
  if (server) throw new Error('startApp() called while a server is already running.');

  server = createServer((_req, res) => {
    res.statusCode = 501;
    res.setHeader('content-type', 'application/json');
    res.end(
      JSON.stringify({
        error: 'tests/support/app-server.ts has not been wired to the application yet.',
      }),
    );
  });

  await new Promise<void>((resolve, reject) => {
    server!.once('error', reject);
    server!.listen(0, '127.0.0.1', resolve);
  });

  const { port } = server.address() as AddressInfo;
  return `http://127.0.0.1:${port}`;
}

export async function stopApp(): Promise<void> {
  if (!server) return;
  const current = server;
  server = undefined;
  await new Promise<void>((resolve, reject) => {
    current.close((error) => (error ? reject(error) : resolve()));
  });
}
