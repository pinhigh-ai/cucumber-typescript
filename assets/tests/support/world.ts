import { setWorldConstructor, World, type IWorldOptions } from '@cucumber/cucumber';
import { randomUUID } from 'node:crypto';
import type { Scope } from 'nock';
import type { TestMode } from './config.js';

export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' | 'HEAD' | 'OPTIONS';

export interface CapturedResponse {
  status: number;
  headers: Record<string, string>;
  /** Parsed JSON when the body is JSON, otherwise the raw text. */
  body: unknown;
  rawBody: string;
  durationMs: number;
}

export interface RecordedRequest {
  service: string;
  method: HttpMethod;
  path: string;
  body: unknown;
  headers: Record<string, string | string[] | undefined>;
}

export interface TeardownTask {
  label: string;
  run: () => Promise<void> | void;
}

/**
 * One World instance per scenario. Anything a step needs to hand to a later step
 * lives here — never in module-level variables, which are shared across parallel
 * workers and produce order-dependent flakiness.
 */
export class ApiWorld extends World {
  mode: TestMode = 'mocked';
  /** Base URL of the system under test for this scenario. */
  baseUrl = '';
  /** Short id unique to this scenario, for namespacing created data. */
  readonly scenarioId = randomUUID().slice(0, 8);
  response?: CapturedResponse;
  /** Name of the client that sent the most recent request. */
  lastClient = 'default';

  /** Values captured by steps and referenced as {{ctx:name}}. */
  readonly context = new Map<string, unknown>();
  /** Headers applied to the next request, keyed by client name. */
  readonly clientHeaders = new Map<string, Record<string, string>>();
  /** Active Nock scopes, checked for completeness in the After hook. */
  readonly scopes: { service: string; scope: Scope }[] = [];
  /** Every downstream request Nock intercepted, in order. */
  readonly recordedRequests: RecordedRequest[] = [];
  /** Undo actions, run in reverse order by the After hook. */
  readonly teardown: TeardownTask[] = [];

  constructor(options: IWorldOptions) {
    super(options);
  }

  /**
   * Register an undo action at the moment the state is created, not at the end
   * of the scenario. Registering late means a failure between creation and
   * registration leaks the state into whatever runs next.
   */
  defer(label: string, run: () => Promise<void> | void): void {
    this.teardown.push({ label, run });
  }

  /**
   * A value unique to this scenario, so concurrent runs against a shared
   * environment cannot collide on natural keys.
   *   uniqueKey('order') -> 'order-3f9a1c7d'
   */
  uniqueKey(prefix: string): string {
    return `${prefix}-${this.scenarioId}`;
  }

  lastResponse(): CapturedResponse {
    if (!this.response) {
      throw new Error(
        'No response captured yet. A Then step ran before any When step sent a request.',
      );
    }
    return this.response;
  }

  headersFor(client: string): Record<string, string> {
    return this.clientHeaders.get(client) ?? {};
  }

  setHeader(client: string, name: string, value: string): void {
    const existing = this.clientHeaders.get(client) ?? {};
    existing[name] = value;
    this.clientHeaders.set(client, existing);
  }

  getContext(key: string): unknown {
    if (!this.context.has(key)) {
      const known = [...this.context.keys()].join(', ') || '(none)';
      throw new Error(`No value stored in context under "${key}". Stored keys: ${known}`);
    }
    return this.context.get(key);
  }
}

setWorldConstructor(ApiWorld);
