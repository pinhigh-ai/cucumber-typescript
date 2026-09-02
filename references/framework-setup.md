# Framework setup

Scaffold this only if the project lacks a working cucumber-js + TypeScript setup.
Copy from `assets/` and then wire the three project-specific adapters at the bottom.

## Layout

```
cucumber.mjs                     # config + profiles (mocked / integration)
tsconfig.cucumber.json           # TS config for the test tree
tests/
  features/*.feature
  steps/                         # example definitions — reshape per project
    context.steps.ts             # Given: state setup
    http.steps.ts                # When: the request under test
    mock.steps.ts                # Given: Nock stubs for downstream services
    assertion.steps.ts           # Then: status, body, headers, mock verification
  support/
    config.ts                    # env-driven config, mode detection
    world.ts                     # custom World, teardown stack, unique keys
    hooks.ts                     # Before/After, cleanup, Nock + server lifecycle
    parameter-types.ts           # {method}
    json-match.ts                # deep JSON comparison
    placeholders.ts              # {{ctx:...}} / {{env:...}} resolution
    app-server.ts                # ADAPTER: start/stop the app in-process
    services.ts                  # ADAPTER: logical name -> downstream base URL
    seed.ts                      # ADAPTER: seed/delete/reset test data
```

## Dependencies

```bash
npm i -D @cucumber/cucumber tsx typescript nock @types/node
```

- `tsx` is the TypeScript translation layer. It is preferred over `ts-node` because it
  handles ESM and current Node releases without loader flags churn.
- `nock` is only exercised in mocked mode, but is a dev dependency in both.

If the app under test is an Express/Fastify/Hono app, no extra HTTP client is needed —
the steps use the built-in `fetch`.

## package.json scripts

```json
{
  "scripts": {
    "test:bdd": "NODE_OPTIONS=\"--import tsx\" cucumber-js",
    "test:bdd:mocked": "NODE_OPTIONS=\"--import tsx\" cucumber-js -p mocked",
    "test:bdd:integration": "NODE_OPTIONS=\"--import tsx\" cucumber-js -p integration",
    "test:bdd:wip": "NODE_OPTIONS=\"--import tsx\" cucumber-js -p wip"
  }
}
```

Using `NODE_OPTIONS="--import tsx"` rather than cucumber's `--loader` flag avoids the
deprecated loader hooks on Node 20+. On Windows-only teams, add `cross-env`.

If the repo is CommonJS (`"type"` absent or `"commonjs"` in package.json), the config
file still works as `cucumber.mjs` because of the explicit `.mjs` extension.

## tsconfig

`tsconfig.cucumber.json` extends the project tsconfig and just widens `include` to the
test tree. `tsx` does not typecheck at runtime, so add a typecheck script:

```json
"typecheck:bdd": "tsc -p tsconfig.cucumber.json --noEmit"
```

Run it as part of the same CI job as the suite. Without it, type errors in step
definitions are silently stripped rather than reported.

## The three adapters

These are the only files that must be written per project. Everything else is portable.

### `support/app-server.ts`

Starts the application in-process so Nock can intercept its outbound calls, and
returns the base URL the tests should hit. Implement `startApp()` / `stopApp()`
against whatever the app actually exposes:

- Express/Fastify/Hono: import the app factory, call `listen(0)`, read the assigned port.
- API Gateway Lambda handler: wrap the handler in a small `node:http` server that
  converts `IncomingMessage` to an APIGatewayProxyEvent and the handler result back to
  an HTTP response. Keep that conversion in this file only.

Never start the app via `spawn` in mocked mode — a child process has its own module
registry and Nock will not intercept anything inside it.

In integration mode `startApp()` is a no-op and the base URL comes from
`BASE_URL` in the environment.

### `support/services.ts`

Maps logical downstream names used in Gherkin (`"payments"`, `"vet-profile"`) to base
URLs. Nock stubs are registered against these. The names in feature files should read
as service names, not hostnames — hostnames change per environment, feature files
should not.

### `support/seed.ts`

Implements `seedRecords`, `deleteRecords`, `truncateTable`, and
`resetApplicationState`. Rows arrive as raw strings straight from the feature file's
data table, so this is where they get converted to whatever the datastore expects — a
Zod schema per table is a tidy way to do it, but nothing requires one. Back it with
whatever the project uses — a local DynamoDB table, a test container, an in-memory
repository. In mocked mode this is often an in-memory fake; in integration mode it
writes to a real test datastore.

`deleteRecords` must be idempotent, since teardown may run after a partial failure.
`resetApplicationState` runs in `Before` and is where in-process caches, memoised
config, and feature-flag overrides get cleared — the state that otherwise makes
scenarios order-dependent.

If a project genuinely has no persistent state, leave these throwing a clear
"not wired" error rather than silently passing — a green test that seeded nothing is
worse than a failing one.
