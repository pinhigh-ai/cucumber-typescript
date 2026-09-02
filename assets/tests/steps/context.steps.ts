import { Given, Then, DataTable } from '@cucumber/cucumber';
import { seedRecords, deleteRecords, truncateTable } from '../support/seed.js';
import { resolvePlaceholders } from '../support/placeholders.js';
import { jsonPath } from '../support/json-match.js';
import type { ApiWorld } from '../support/world.js';

/**
 * Rows are handed to the seed adapter as raw strings. Converting them to the
 * types the datastore expects is the adapter's job, since it is the only part
 * that knows the schema — see tests/support/seed.ts.
 *
 * Cleanup is registered immediately, before the step can fail on anything else.
 */
Given(
  'the following records exist in table {string}',
  async function (this: ApiWorld, tableName: string, data: DataTable) {
    const rows = data.hashes().map((row) =>
      Object.fromEntries(
        Object.entries(row).map(([column, value]) => [column, resolvePlaceholders(value, this)]),
      ),
    );
    const { keys } = await seedRecords(tableName, rows, this.mode);
    this.defer(`remove ${keys.length} row(s) from "${tableName}"`, () =>
      deleteRecords(tableName, keys, this.mode),
    );
  },
);

Given('no records exist in table {string}', async function (this: ApiWorld, tableName: string) {
  await truncateTable(tableName, this.mode);
});

Given(
  'the value {string} is stored as {string}',
  function (this: ApiWorld, value: string, key: string) {
    this.context.set(key, resolvePlaceholders(value, this));
  },
);

/** Namespaces a value to this scenario so parallel runs cannot collide. */
Given(
  'a scenario-unique {string} is stored as {string}',
  function (this: ApiWorld, prefix: string, key: string) {
    this.context.set(key, this.uniqueKey(prefix));
  },
);

Given(
  'the {string} client sets the header {string} to {string}',
  function (this: ApiWorld, client: string, name: string, value: string) {
    this.setHeader(client, name, resolvePlaceholders(value, this));
  },
);

/**
 * Capturing a value for a later step. Declared with Then because it reads
 * naturally after the assertions on the same response; Cucumber does not bind
 * behaviour to the keyword, so it can be invoked with And as well.
 */
Then(
  'the JSON path {string} in the response is stored as {string}',
  function (this: ApiWorld, path: string, key: string) {
    this.context.set(key, jsonPath(this.lastResponse().body, path));
  },
);

/**
 * Use after a When step that creates a resource the API itself can delete.
 * Registering the undo here keeps the scenario self-contained without teaching
 * the seed adapter about resources it never created.
 */
Then(
  'the created {string} at the JSON path {string} is removed after the scenario',
  function (this: ApiWorld, resourcePath: string, path: string) {
    const id = String(jsonPath(this.lastResponse().body, path));
    this.defer(`DELETE ${resourcePath}/${id}`, async () => {
      await fetch(new URL(`${resourcePath}/${id}`, this.baseUrl), {
        method: 'DELETE',
        headers: this.headersFor(this.lastClient),
      });
    });
  },
);
