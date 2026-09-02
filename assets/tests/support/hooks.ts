import { Before, After, setDefaultTimeout, type ITestCaseHookParameter } from '@cucumber/cucumber';
import nock from 'nock';
import { config, modeFromTags } from './config.js';
import { startApp, stopApp } from './app-server.js';
import { resetApplicationState } from './seed.js';
import type { ApiWorld } from './world.js';

setDefaultTimeout(30_000);

Before(async function (this: ApiWorld, scenario: ITestCaseHookParameter) {
  const tags = scenario.pickle.tags.map((t) => t.name);
  this.mode = modeFromTags(tags);

  if (this.mode === 'mocked') {
    // The app runs in this process so Nock can intercept its outbound calls.
    // Loopback stays allowed because the test's own request to the app is also
    // real HTTP through the same stack.
    nock.disableNetConnect();
    nock.enableNetConnect((host) => host.startsWith('127.0.0.1') || host.startsWith('localhost'));
    this.baseUrl = await startApp();
  } else {
    this.baseUrl = config.integrationBaseUrl;
  }

  await resetApplicationState(this.mode);
});

/**
 * Teardown runs in reverse registration order, so a scenario that creates a
 * customer and then an order for that customer removes the order first.
 *
 * Every task is attempted even if an earlier one throws — a single failing
 * cleanup must not strand the rest of the state. Failures are collected and
 * reported only when the scenario itself passed, so a real assertion failure is
 * never buried under cleanup noise.
 */
After(async function (this: ApiWorld, scenario: ITestCaseHookParameter) {
  const problems: string[] = [];

  for (const task of [...this.teardown].reverse()) {
    try {
      await task.run();
    } catch (error) {
      problems.push(`cleanup "${task.label}" failed: ${String(error)}`);
    }
  }
  this.teardown.length = 0;

  if (this.mode === 'mocked') {
    for (const { service, scope } of this.scopes) {
      if (!scope.isDone()) {
        problems.push(`stub never called — ${service}: ${scope.pendingMocks().join(', ')}`);
      }
    }
  }

  // Unconditional, and last: these must happen even if cleanup above threw,
  // or the next scenario inherits stubs and a listening socket.
  nock.cleanAll();
  nock.enableNetConnect();
  if (this.mode === 'mocked') await stopApp();

  const passed = scenario.result?.status === 'PASSED';
  if (passed && problems.length > 0 && config.failOnPendingMocks) {
    throw new Error(
      ['Scenario left the environment dirty:', ...problems.map((p) => `  - ${p}`)].join('\n'),
    );
  }
});
