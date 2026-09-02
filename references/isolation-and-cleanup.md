# Isolation and cleanup

Every scenario must pass when run alone, and must pass regardless of what ran
before it. That is not a stylistic preference — a suite with order dependence
cannot be run in parallel, cannot be filtered by tag, and produces failures that
disappear when you try to reproduce them.

The default profile runs with `order: 'random'` for exactly this reason. Cucumber
prints the seed on every run (`--order random:12345` reproduces it), so a failure
that only appears under one ordering is still debuggable.

## The rule

**Whatever a scenario changes, the scenario undoes.** State created in a `Given`,
a `When`, or incidentally by the application belongs to that scenario alone.

Register the undo at the moment the state is created, using the World's teardown
stack:

```ts
const { keys } = await seedRecords(model.name, rows, this.mode);
this.defer(`remove ${keys.length} row(s) from "${model.name}"`, () =>
  deleteRecords(model.name, keys, this.mode),
);
```

Registering immediately rather than at the end of the scenario matters: a step
that fails between creating the row and registering its cleanup leaks that row
into whatever runs next.

Teardown runs in reverse registration order, so a scenario that creates a
customer and then an order for that customer removes the order first and the
customer second. Foreign keys make this ordering load-bearing.

## What the After hook guarantees

The hook in `tests/support/hooks.ts`:

1. Runs every teardown task, **attempting all of them even if one throws** — a
   single failing cleanup must not strand the rest of the state.
2. Checks for Nock interceptors that were set up and never called.
3. Unconditionally calls `nock.cleanAll()`, re-enables net connect, and stops the
   in-process server. These happen last and outside the try, because the next
   scenario inherits a dirty HTTP stack otherwise.
4. Reports cleanup problems **only when the scenario itself passed**. On a
   failing scenario the assertion error is the useful one; burying it under
   cleanup noise wastes the debugging session.

## What actually leaks

Datastore rows are the obvious one. These are the ones that get missed:

- **Resources the API created that no `Given` seeded.** A `POST` under test
  creates a row; the scenario must delete it. Use
  `Then the created "..." at the JSON path "id" is removed after the scenario`,
  or register a `defer` in a project-specific step.
- **Nock interceptors.** A persisted stub (`always responds to`) survives the
  scenario without `cleanAll()`.
- **The in-process server.** Each mocked scenario starts one on an ephemeral
  port; failing to close it exhausts file descriptors over a long run.
- **Module-level state in the application** — caches, memoised config, connection
  pools, feature flag overrides, singletons initialised on first request. Reset
  these in `resetApplicationState()`, which the `Before` hook calls.
- **Environment variables** mutated by a step. Snapshot and restore via `defer`.
- **Fake timers or a frozen clock.** Restore in the same `defer` that installed it.
- **Module-level variables in the step definitions themselves.** Use the World.
  Module state is shared across scenarios in a worker and is the single most
  common cause of "passes alone, fails in the suite".

## Namespacing instead of cleaning

Cleanup is not always possible — append-only stores, audit logs, third-party
sandboxes. Namespace instead, so collisions cannot happen in the first place:

```gherkin
Given a scenario-unique "customer" is stored as "customerId"
When the "orders-api" client sends a POST request to "/v1/orders" with the following JSON body:
  """
  { "customerId": "{{ctx:customerId}}", "sku": "SKU-1001" }
  """
```

`world.uniqueKey('customer')` produces `customer-3f9a1c7d`, unique per scenario.
Prefer this over shared fixture ids for anything a concurrent run could touch.

## Before hooks

Keep `Before` for establishing a clean starting point, not for seeding shared
data. Tagged hooks work when the setup genuinely differs by mode:

```ts
Before({ tags: '@integration' }, async function (this: ApiWorld) {
  // integration-only preparation
});
```

`BeforeAll` is for process-level work that no scenario mutates — starting a test
container, loading a schema. The moment a `BeforeAll` seeds a row that a
scenario then modifies, ordering matters again and the suite is back to being
serial-only.

## Background is not shared state

`Background` steps re-run for every scenario in the file. That is the correct
behaviour and the reason `Background` is safe: it produces per-scenario state,
not shared state. Do not "optimise" it into a `BeforeAll`.

## Verifying isolation

Three checks, cheapest first:

```bash
npm run test:bdd:mocked -- --name "the scenario name"   # passes alone
npm run test:bdd:mocked                                  # passes in random order
npm run test:bdd:mocked -- --parallel 4                  # passes concurrently
```

Run the random-order suite in CI rather than a fixed order. Order dependence
found on a developer machine is an annoyance; found in a release pipeline it is
an outage-shaped delay.
