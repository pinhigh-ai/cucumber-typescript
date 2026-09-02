import { Given } from '@cucumber/cucumber';
import nock from 'nock';
import { baseUrlFor } from '../support/services.js';
import { resolveJson, resolvePlaceholders } from '../support/placeholders.js';
import type { ApiWorld, HttpMethod, RecordedRequest } from '../support/world.js';

function requireMockedMode(world: ApiWorld, step: string): void {
  if (world.mode !== 'mocked') {
    throw new Error(
      `"${step}" is only valid in a @mocked scenario. This scenario is tagged @integration, ` +
        'where downstream services are real.',
    );
  }
}

interface StubOptions {
  status: number;
  body?: unknown;
  persist?: boolean;
  error?: { code: string };
  delayMs?: number;
}

function stub(
  world: ApiWorld,
  service: string,
  method: HttpMethod,
  path: string,
  options: StubOptions,
): void {
  const resolvedPath = resolvePlaceholders(path, world);
  const scope = nock(baseUrlFor(service));

  let interceptor = scope.intercept(resolvedPath, method);
  // Without an explicit query in the Gherkin, any query string matches — the
  // scenario is not asserting on it.
  if (!resolvedPath.includes('?')) interceptor = interceptor.query(true);
  if (options.delayMs) interceptor = interceptor.delayConnection(options.delayMs);

  if (options.error) {
    interceptor.replyWithError(options.error);
  } else {
    interceptor.reply(function (uri, requestBody) {
      const recorded: RecordedRequest = {
        service,
        method,
        path: uri,
        body: requestBody,
        headers: this.req.headers as Record<string, string | string[] | undefined>,
      };
      world.recordedRequests.push(recorded);
      return [options.status, options.body ?? ''];
    });
  }

  if (options.persist) scope.persist();
  world.scopes.push({ service, scope });
}

Given(
  'the {string} service responds to {method} {string} with status {int}',
  function (this: ApiWorld, service: string, method: HttpMethod, path: string, status: number) {
    requireMockedMode(this, 'responds to');
    stub(this, service, method, path, { status });
  },
);

Given(
  'the {string} service responds to {method} {string} with status {int} and the following JSON body:',
  function (
    this: ApiWorld,
    service: string,
    method: HttpMethod,
    path: string,
    status: number,
    docString: string,
  ) {
    requireMockedMode(this, 'responds to');
    stub(this, service, method, path, { status, body: resolveJson(docString, this) });
  },
);

Given(
  'the {string} service always responds to {method} {string} with status {int} and the following JSON body:',
  function (
    this: ApiWorld,
    service: string,
    method: HttpMethod,
    path: string,
    status: number,
    docString: string,
  ) {
    requireMockedMode(this, 'always responds to');
    stub(this, service, method, path, {
      status,
      body: resolveJson(docString, this),
      persist: true,
    });
  },
);

Given(
  'the {string} service is unreachable for {method} {string}',
  function (this: ApiWorld, service: string, method: HttpMethod, path: string) {
    requireMockedMode(this, 'is unreachable for');
    stub(this, service, method, path, { status: 0, error: { code: 'ECONNREFUSED' } });
  },
);

Given(
  'the {string} service takes {int} ms to respond to {method} {string} with status {int}',
  function (
    this: ApiWorld,
    service: string,
    delayMs: number,
    method: HttpMethod,
    path: string,
    status: number,
  ) {
    requireMockedMode(this, 'takes ... ms to respond to');
    stub(this, service, method, path, { status, delayMs });
  },
);
