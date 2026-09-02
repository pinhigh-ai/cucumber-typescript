export type TestMode = 'mocked' | 'integration';

export interface TestConfig {
  /** Base URL for integration runs. Ignored in mocked runs. */
  integrationBaseUrl: string;
  /** Per-request timeout for the test client. */
  requestTimeoutMs: number;
  /** Fail a scenario if any Nock interceptor went unused. */
  failOnPendingMocks: boolean;
}

export const config: TestConfig = {
  integrationBaseUrl: process.env.BASE_URL ?? 'http://127.0.0.1:3000',
  requestTimeoutMs: Number(process.env.BDD_REQUEST_TIMEOUT_MS ?? 10_000),
  failOnPendingMocks: process.env.BDD_ALLOW_PENDING_MOCKS !== 'true',
};

/**
 * Mode comes from the scenario's tags rather than the environment so a single
 * run can contain both kinds of scenario.
 */
export function modeFromTags(tags: readonly string[]): TestMode {
  if (tags.includes('@integration')) return 'integration';
  if (tags.includes('@mocked')) return 'mocked';
  throw new Error(
    'Scenario is missing a mode tag. Add @mocked or @integration to the scenario or feature.',
  );
}
