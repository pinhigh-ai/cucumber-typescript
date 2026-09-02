import { Then } from '@cucumber/cucumber';
import assert from 'node:assert/strict';
import { assertJsonMatches, jsonPath } from '../support/json-match.js';
import { resolveJson, resolvePlaceholders } from '../support/placeholders.js';
import type { ApiWorld, HttpMethod } from '../support/world.js';

Then('the response status is {int}', function (this: ApiWorld, expected: number) {
  const response = this.lastResponse();
  assert.equal(
    response.status,
    expected,
    `Expected status ${expected} but got ${response.status}. Body:\n${response.rawBody}`,
  );
});

Then(
  'the response body matches the following JSON:',
  function (this: ApiWorld, docString: string) {
    assertJsonMatches(this.lastResponse().body, resolveJson(docString, this), 'exact');
  },
);

Then(
  'the response body contains the following JSON:',
  function (this: ApiWorld, docString: string) {
    assertJsonMatches(this.lastResponse().body, resolveJson(docString, this), 'partial');
  },
);

Then('the response body is empty', function (this: ApiWorld) {
  const raw = this.lastResponse().rawBody;
  assert.equal(raw.trim(), '', `Expected an empty body but got:\n${raw}`);
});

Then(
  'the response header {string} is {string}',
  function (this: ApiWorld, name: string, expected: string) {
    const actual = this.lastResponse().headers[name.toLowerCase()];
    assert.equal(actual, resolvePlaceholders(expected, this), `Header "${name}" mismatch.`);
  },
);

Then('the response header {string} is present', function (this: ApiWorld, name: string) {
  const actual = this.lastResponse().headers[name.toLowerCase()];
  assert.ok(actual !== undefined, `Expected header "${name}" to be present.`);
});

Then(
  'the JSON path {string} in the response equals {string}',
  function (this: ApiWorld, path: string, expected: string) {
    const actual = jsonPath(this.lastResponse().body, path);
    const resolved = resolvePlaceholders(expected, this);
    assert.equal(
      String(actual),
      resolved,
      `Expected "${path}" to equal ${resolved} but got ${JSON.stringify(actual)}.`,
    );
  },
);

Then(
  'the JSON path {string} in the response has {int} items',
  function (this: ApiWorld, path: string, expected: number) {
    const actual = jsonPath(this.lastResponse().body, path);
    assert.ok(Array.isArray(actual), `Expected "${path}" to be an array.`);
    assert.equal(actual.length, expected, `Expected ${expected} items at "${path}".`);
  },
);

Then('the response completes within {int} ms', function (this: ApiWorld, budget: number) {
  const { durationMs } = this.lastResponse();
  assert.ok(durationMs <= budget, `Response took ${durationMs.toFixed(0)}ms, budget ${budget}ms.`);
});

Then(
  'the {string} service received {int} request(s) to {method} {string}',
  function (this: ApiWorld, service: string, expected: number, method: HttpMethod, path: string) {
    const resolvedPath = resolvePlaceholders(path, this);
    const matches = this.recordedRequests.filter(
      (r) => r.service === service && r.method === method && r.path.split('?')[0] === resolvedPath,
    );
    assert.equal(
      matches.length,
      expected,
      `Expected ${expected} ${method} request(s) to ${service}${resolvedPath} but saw ${matches.length}. ` +
        `Recorded: ${JSON.stringify(this.recordedRequests.map((r) => `${r.method} ${r.path}`))}`,
    );
  },
);

Then(
  'the last request to the {string} service had the following JSON body:',
  function (this: ApiWorld, service: string, docString: string) {
    const matches = this.recordedRequests.filter((r) => r.service === service);
    const last = matches.at(-1);
    assert.ok(last, `No requests were recorded for the "${service}" service.`);
    assertJsonMatches(
      last.body,
      resolveJson(docString, this),
      'exact',
      `last request body sent to "${service}"`,
    );
  },
);

Then(
  'the last request to the {string} service had the header {string} set to {string}',
  function (this: ApiWorld, service: string, name: string, expected: string) {
    const last = this.recordedRequests.filter((r) => r.service === service).at(-1);
    assert.ok(last, `No requests were recorded for the "${service}" service.`);
    const actual = last.headers[name.toLowerCase()];
    assert.equal(
      Array.isArray(actual) ? actual[0] : actual,
      resolvePlaceholders(expected, this),
      `Header "${name}" on the outbound request to "${service}" did not match.`,
    );
  },
);
