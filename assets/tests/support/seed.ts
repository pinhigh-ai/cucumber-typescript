import type { TestMode } from './config.js';

/**
 * PROJECT ADAPTER — create and remove pre-existing state for Given steps.
 *
 * Rows arrive as raw strings, exactly as written in the feature file's data
 * table. Converting them is this adapter's job, because it is the only part of
 * the framework that knows the schema. Where a table carries values that are
 * not strings in the datastore — amounts, timestamps, enums — parse them here.
 * A Zod schema is a good fit and keeps the conversion in one place:
 *
 *   const OrderRow = z.object({
 *     orderId: z.coerce.number().int(),
 *     orderType: z.enum(['AA', 'BB', 'CC']),
 *     orderAmount: z.string().transform(toMinorUnits),
 *     orderTimestamp: z.coerce.date(),
 *   });
 *   const parsed = rows.map((row) => OrderRow.parse(row));
 *
 * Nothing forces that choice — plain functions are fine. What matters is that
 * "$302.23" does not reach the datastore as the string "$302.23".
 *
 * In mocked mode this usually writes to an in-memory fake or a local test
 * container. In integration mode it writes to the real test datastore.
 *
 * These deliberately throw until wired: a Given step that silently seeds
 * nothing produces a green test that proves less than it appears to.
 */

export interface SeedResult {
  /** Identifiers of the rows created, used to undo them after the scenario. */
  keys: string[];
}

export async function seedRecords(
  table: string,
  rows: readonly Record<string, string>[],
  mode: TestMode,
): Promise<SeedResult> {
  throw new Error(
    `seedRecords() is not wired yet (table "${table}", ${rows.length} row(s), mode ${mode}). ` +
      'Implement it in tests/support/seed.ts.',
  );
}

/** Remove specific rows created during a scenario. Must be idempotent. */
export async function deleteRecords(
  table: string,
  keys: readonly string[],
  mode: TestMode,
): Promise<void> {
  throw new Error(
    `deleteRecords() is not wired yet (table "${table}", ${keys.length} key(s), mode ${mode}). ` +
      'Implement it in tests/support/seed.ts.',
  );
}

/** Empty a table outright, for the "no records exist" step. */
export async function truncateTable(table: string, mode: TestMode): Promise<void> {
  throw new Error(
    `truncateTable() is not wired yet (table "${table}", mode ${mode}). ` +
      'Implement it in tests/support/seed.ts.',
  );
}

/**
 * Runs in a Before hook. Use it to reset in-process state the application holds
 * between requests — caches, connection pools, module-level singletons, feature
 * flag overrides. Anything that survives a scenario is a source of order
 * dependence, which is what the random run order is designed to expose.
 *
 * Leave it as a no-op if the app genuinely holds no such state.
 */
export async function resetApplicationState(_mode: TestMode): Promise<void> {
  // no-op by default
}
