import { When } from '@cucumber/cucumber';
import { config } from '../support/config.js';
import { resolvePlaceholders } from '../support/placeholders.js';
import type { ApiWorld, CapturedResponse, HttpMethod } from '../support/world.js';

async function send(
  world: ApiWorld,
  client: string,
  method: HttpMethod,
  path: string,
  body?: string,
): Promise<void> {
  world.lastClient = client;
  const url = new URL(resolvePlaceholders(path, world), world.baseUrl).toString();
  const headers: Record<string, string> = { accept: 'application/json', ...world.headersFor(client) };
  if (body !== undefined) headers['content-type'] ??= 'application/json';

  const startedAt = performance.now();
  const response = await fetch(url, {
    method,
    headers,
    body,
    signal: AbortSignal.timeout(config.requestTimeoutMs),
  });
  const durationMs = performance.now() - startedAt;

  const rawBody = await response.text();
  let parsed: unknown = rawBody;
  if (rawBody.length > 0) {
    try {
      parsed = JSON.parse(rawBody);
    } catch {
      // Non-JSON responses stay as text so assertions can still report usefully.
    }
  }

  const captured: CapturedResponse = {
    status: response.status,
    headers: Object.fromEntries([...response.headers.entries()]),
    body: parsed,
    rawBody,
    durationMs,
  };
  world.response = captured;
}

When(
  'the {string} client sends a {method} request to {string}',
  async function (this: ApiWorld, client: string, method: HttpMethod, path: string) {
    await send(this, client, method, path);
  },
);

When(
  'the {string} client sends a {method} request to {string} with the following JSON body:',
  async function (
    this: ApiWorld,
    client: string,
    method: HttpMethod,
    path: string,
    docString: string,
  ) {
    // Resolved but not re-serialised, so the app receives exactly what the
    // feature file describes — including any deliberately malformed payload.
    await send(this, client, method, path, resolvePlaceholders(docString, this));
  },
);

When(
  'the {string} client sends a {method} request to {string} with the following body:',
  async function (
    this: ApiWorld,
    client: string,
    method: HttpMethod,
    path: string,
    docString: string,
  ) {
    await send(this, client, method, path, resolvePlaceholders(docString, this));
  },
);
