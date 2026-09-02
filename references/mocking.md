# Mocked vs integration

Ask which mode the user wants before scaffolding or writing features. The request and
assertion steps are identical across modes; only the setup differs.

## Mocked (`@mocked`)

The app under test runs **in the test process**. The test's own HTTP call goes to
`http://127.0.0.1:<ephemeral port>`, and Nock intercepts the calls the app makes
outbound to downstream services.

```
cucumber process
├── test steps ──HTTP──► app (same process, listening on 127.0.0.1)
                          └── outbound HTTP ──X── intercepted by Nock
```

Two consequences worth internalizing:

- The app must be imported and started in-process. Starting it with `spawn`,
  `docker compose`, or `sam local` puts it in another process where Nock has no reach.
- `nock.disableNetConnect()` would also block the test's own call to the app, so
  loopback is explicitly re-enabled. That allowlist is in `hooks.ts`; keep it narrow.

Unstubbed outbound calls fail loudly rather than escaping to the real network. That is
the point — a silent real call in a "mocked" run is the failure mode this setup exists
to prevent.

### Verifying interactions

Stubbing what a downstream *returns* is only half the test. Assert what the app *sent*:

```gherkin
Then the "payments" service received 1 request to POST "/charges"
And the last request to the "payments" service had the following JSON body:
  """
  { "amount": 1250, "currency": "USD", "idempotencyKey": "{{any}}" }
  """
```

The `After` hook fails the scenario on unconsumed stubs. A stub that was set up and
never called usually means the app took a different path than the scenario claims, so
treating it as a failure catches a real class of bug.

## Integration (`@integration`)

Requests go to a real running endpoint from `BASE_URL`. Nock is not activated at all,
and the mock steps throw if used — a feature file mixing `@integration` with mock
stubs is a mistake worth surfacing immediately rather than quietly ignoring.

Data setup goes through `seed.ts` against a real datastore, and `After` cleans up what
the scenario created. Prefer scenario-scoped unique keys (a per-scenario prefix or
UUID) over shared fixtures so the suite can run concurrently and against a shared
environment.

Assertions that are exact in mocked mode often need to be partial here — real
environments add trace headers, timestamps, and version fields. Use `contains` plus
matcher tokens rather than pinning fields that are not part of the contract.

## Choosing per feature

Mode is a tag, so both can coexist in one suite, and the same scenario text can exist
in both modes when the contract is worth checking twice. If the user wants that, write
the feature once and keep the mode-specific `Given` stubs in a `Background` per file
rather than duplicating scenario bodies.

## Nock notes that bite people

- Interceptors are consumed once by default. For a call the app makes repeatedly, the
  stub step accepts a count, or use `.persist()` via the "always responds" wording.
- Nock matches on the exact query string unless told otherwise. The stub steps use
  `.query(true)` when no query is specified in the Gherkin, so add the query
  explicitly when it is part of what you are asserting.
- `nock.cleanAll()` runs in `After` regardless of outcome. Without it, a stub leaks
  into the next scenario and produces a pass that depends on execution order.
- Native `fetch` inside the app is interceptable by Nock v14+. On older Nock, the app's
  outbound `fetch` calls will slip through — check the installed major version before
  concluding a mock "doesn't work".
