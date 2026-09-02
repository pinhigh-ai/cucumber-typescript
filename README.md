# cucumber-typescript

A Warp Agent Skill for writing Cucumber tests in TypeScript against HTTP APIs.

If you have never used Cucumber, start at [Part 1](#part-1--cucumber-in-fifteen-minutes).
If you have, skip to [Part 2](#part-2--the-conventions) for the conventions this skill
enforces, [Part 3](#part-3--the-example-steps) for the steps the scaffold starts you
with, or [Part 4](#part-4--installing-in-warp) to install it.

---

## Part 1 — Cucumber in fifteen minutes

### The idea

Cucumber splits a test into two files. One describes *what* should happen, in
structured English. The other says *how* to check it, in code.

The English file is a **feature file** (`.feature`), written in a syntax called
**Gherkin**:

```gherkin
Feature: Order creation

  Scenario: A valid order is created
    Given the following records exist in table "products"
      | sku      | name        | stock |
      | SKU-1001 | Blue widget | 5     |
    When the "orders-api" client sends a POST request to "/v1/orders"
    Then the response status is 201
```

The code file holds **step definitions** — one function per line of Gherkin:

```ts
Then('the response status is {int}', function (expected: number) {
  assert.equal(this.lastResponse().status, expected);
});
```

When Cucumber runs, it reads each line of the scenario, finds the step definition
whose pattern matches, and calls it. `Then the response status is 201` matches the
pattern above, and `201` arrives as the `expected` argument.

That is the whole mechanism. Everything else is detail.

### Why bother

Two reasons, and the second is the one that matters here.

The usual pitch is readability — non-engineers can read the feature file. In practice
that is oversold, and this skill explicitly does not chase it (see
[technical wording](#1-write-steps-for-engineers)).

The real payoff is **reuse**. Once `the response status is {int}` exists, every
scenario in the codebase gets it for free. A mature suite has maybe thirty step
definitions covering hundreds of scenarios, and a new test is written by assembling
existing sentences rather than writing new code. A suite where every scenario has its
own bespoke steps has all the indirection of Cucumber and none of the benefit — you'd
be better off with plain integration tests. This is why the skill is so insistent about
reusing and generalizing steps.

### Vocabulary

| Term | What it is |
| --- | --- |
| **Feature file** | A `.feature` file containing one `Feature:` and its scenarios |
| **Scenario** | One test case — a sequence of steps |
| **Step** | One line, starting with `Given`, `When`, `Then`, `And`, or `But` |
| **Step definition** | The TypeScript function bound to a step's pattern |
| **Glue** | Collective name for step definitions and support code |
| **World** | A fresh object per scenario, available as `this` in every step |
| **Hook** | `Before` / `After` functions that run around each scenario |
| **Tag** | `@label` above a `Feature` or `Scenario`, used for filtering |
| **Data table** | A pipe-delimited table attached to a step |
| **Doc string** | A `"""`-delimited block attached to a step |
| **Scenario Outline** | A scenario template run once per row of an `Examples` table |

### The three keywords

- **`Given`** — state that already exists before the test acts. Setup.
- **`When`** — the single action under test.
- **`Then`** — assertions about what happened.

`And` and `But` continue whatever keyword came before them, purely for readability.
`And` after a `Then` is another assertion.

Cucumber does not actually enforce this — `Given`, `When`, and `Then` are
interchangeable at runtime, and a step defined with `Given(...)` can be invoked with
`Then` in a feature file. The discipline is yours to keep, and it matters: a scenario
with three `When` steps is testing three things and will produce a failure message
that tells you nothing about which.

### How a step matches its definition

Patterns are written as **Cucumber Expressions** — plain sentences with typed
placeholders in braces:

| Placeholder | Matches | Arrives as |
| --- | --- | --- |
| `{int}` | `201` | `number` |
| `{float}` | `1.5` | `number` |
| `{word}` | `orders` (unquoted, no spaces) | `string` |
| `{string}` | `"orders-api"` (quoted) | `string`, quotes stripped |

So `the {string} client sends a request to {string}` matches
`the "orders-api" client sends a request to "/v1/orders"` and passes two strings.

You can define your own. This framework defines `{method}`, which matches HTTP verbs
and upper-cases them, so `sends a post request` and `sends a POST request` both work:

```ts
defineParameterType({
  name: 'method',
  regexp: /GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS|get|post|.../,
  transformer: (value: string) => value.toUpperCase() as HttpMethod,
});
```

One caveat worth knowing early: a parameter type's transformer only ever receives text
matched inside the *sentence* — its signature is `(...match: string[]) => T`. It never
sees an attached data table. cucumber-js has no equivalent of Cucumber-JVM's
`@DataTableType`, so table cells always arrive as strings and get converted in the step
definition or the seed adapter.

### The World

Steps need to pass data along — the `When` sends a request, the `Then` asserts on the
response. That happens through the **World**, a fresh object constructed for every
scenario and bound to `this`:

```ts
When('... sends a {method} request to {string}', async function (method, path) {
  this.response = await fetch(...);       // World
});

Then('the response status is {int}', function (expected) {
  assert.equal(this.lastResponse().status, expected);   // same World
});
```

Use the World, never module-level variables. Module state is shared across every
scenario in a worker process, which is the single most common cause of "passes alone,
fails in the suite".

Note the `function` keyword — arrow functions don't get `this` bound, so step
definitions that need the World must be regular functions.

### Data tables and doc strings

A step can carry a block of data. A **data table** for rows:

```gherkin
Given the following records exist in table "products"
  | sku      | name        | stock |
  | SKU-1001 | Blue widget | 5     |
```

```ts
Given('the following records exist in table {string}',
  async function (tableName: string, data: DataTable) {
    const rows = data.hashes();
    // [{ sku: 'SKU-1001', name: 'Blue widget', stock: '5' }]
  });
```

`data.hashes()` uses the first row as headers. Every value is a string — `stock` is
`'5'`, not `5`.

A **doc string** for a blob, usually JSON:

```gherkin
When the "orders-api" client sends a POST request to "/v1/orders" with the following JSON body:
  """
  { "sku": "SKU-1001", "quantity": 2 }
  """
```

The block arrives as the last argument, as a raw string.

### Scenario Outline

When two scenarios differ only by data, collapse them:

```gherkin
Scenario Outline: Invalid quantities are rejected
  When the "orders-api" client sends a POST request to "/v1/orders" with the following JSON body:
    """
    { "sku": "SKU-1001", "quantity": <quantity> }
    """
  Then the response status is <status>

  Examples:
    | quantity | status |
    | 0        | 400    |
    | -1       | 400    |
    | 9999     | 409    |
```

This runs three times. `<quantity>` is substituted before matching, and substitution
works inside doc strings and data tables too — which is what makes varying a JSON
payload practical.

### Hooks

`Before` and `After` run around every scenario. They are where setup that isn't part
of the test's story goes — starting the app, and cleaning up afterwards:

```ts
Before(async function () {
  this.baseUrl = await startApp();
});

After(async function () {
  await stopApp();
});
```

### Tags

```gherkin
@mocked @orders
Feature: Order creation
```

Tags filter runs: `cucumber-js --tags '@orders and not @wip'`. This framework uses
`@mocked` and `@integration` to select the test mode, and `@wip` to exclude
work in progress.

### Running it

Step definitions here are TypeScript, and Node can't run TypeScript directly, so `tsx`
transpiles on the fly:

```bash
NODE_OPTIONS="--import tsx" npx cucumber-js -p mocked
```

Three outcomes matter when reading the output:

- **undefined** — no step definition matched. Cucumber prints a snippet to copy.
- **ambiguous** — two definitions matched. Merge them; don't narrow one.
- **pending** — the definition exists but returned `'pending'`.

---

## Part 2 — The conventions

Each convention below shows the Gherkin and the step definition behind it.

### 1. Write steps for engineers

Skip the BDD persona prose. Name the actor, the protocol, and the target.

```gherkin
# too abstract to debug from
When the user makes a request to the system
Then the system responds successfully

# concrete
When the "orders-api" client sends a POST request to "/v1/orders"
Then the response status is 201
```

The second version tells you which client, which verb, which path, and which status.
When it fails at 3am, that difference is the whole ballgame.

### 2. Given is state, When is one action, Then is assertions

One `When` per scenario, almost always. If you're writing a second one, the first is
really a `Given`.

```gherkin
Scenario: A payment failure does not leave an order behind
  Given the "payments" service responds to POST "/charges" with status 502
  When the "orders-api" client sends a POST request to "/v1/orders" with the following JSON body:
    """
    { "sku": "SKU-1001", "quantity": 1 }
    """
  Then the response status is 502
  And the response body contains the following JSON:
    """
    { "error": { "code": "PAYMENT_UNAVAILABLE" } }
    """
```

A `Then` never performs an action, and a `When` never asserts. A `When` that checks
its own status code can't be reused by any scenario expecting an error.

### 3. Reuse before you write, generalize before you duplicate

Before writing a step, search the ones your project already has — not a reference
list, the actual definitions on disk:

```bash
rg -n "^\s*(Given|When|Then)\(" --glob '*.ts'
```

The skill does this at the start of every task. The result is the project's step
catalog, and it is the only catalog that matters; the steps in
[Part 3](#part-3--the-example-steps) are just where a new project starts.

Three outcomes, in order of preference:

1. **Exact match** → use it verbatim. Match on meaning, not wording. If a step says
   `sends a POST request to` and you were about to write `issues a POST request to`,
   that's the same step.
2. **Near match** → widen it with a parameter, then update *every* existing `.feature`
   call site.
3. **Neither** → write a new one, parameterized from the start.

Widening in practice:

```ts
// before — one scenario can use this
Then('the response status is 200', function () {
  assert.equal(this.lastResponse().status, 200);
});

// after — every scenario can
Then('the response status is {int}', function (expected: number) {
  assert.equal(this.lastResponse().status, expected);
});
```

Then rewrite the old call sites, run the whole suite, and delete the narrow version.
Leaving both defined produces an ambiguous-step failure the moment someone writes the
general wording.

### 4. Parameterize aggressively

Data that varies goes in `Examples`, not in copies of the scenario:

```gherkin
Scenario Outline: Invalid quantities are rejected before any charge is attempted
  When the "orders-api" client sends a POST request to "/v1/orders" with the following JSON body:
    """
    { "sku": "SKU-1001", "quantity": <quantity> }
    """
  Then the response status is <status>
  And the response body contains the following JSON:
    """
    { "error": { "code": "<errorCode>" } }
    """
  And the "payments" service received 0 requests to POST "/charges"

  Examples: rejected quantities
    | quantity | status | errorCode          |
    | 0        | 400    | QUANTITY_TOO_LOW   |
    | -1       | 400    | QUANTITY_TOO_LOW   |
    | 9999     | 409    | INSUFFICIENT_STOCK |
```

Keep one axis of variation per outline. An `Examples` table where half the columns are
irrelevant to most rows should be two outlines.

### 5. Compare JSON as objects, never as strings

Key order, whitespace, and number formatting must not affect the result.

```gherkin
Then the response body matches the following JSON:
  """
  {
    "id": "{{uuid}}",
    "sku": "SKU-1001",
    "total": 2500,
    "createdAt": "{{iso8601}}"
  }
  """
```

```ts
Then('the response body matches the following JSON:', function (docString: string) {
  assertJsonMatches(this.lastResponse().body, resolveJson(docString, this), 'exact');
});
```

Two flavours, and the choice matters:

- `matches` — **exact**. Every key in the response must be in the expected block and
  vice versa. Extra keys fail.
- `contains` — **partial**. The expected block is a subset; extra keys are ignored.

Prefer `contains` for responses carrying volatile fields, and `matches` when the
response shape is genuinely the contract.

### 6. Matcher tokens for volatile values

Rather than dropping to a partial match because one field is a UUID, assert its shape:

| Token | Passes when the value is |
| --- | --- |
| `{{any}}` | anything |
| `{{string}}` | a string |
| `{{number}}` | a finite number |
| `{{boolean}}` | a boolean |
| `{{array}}` | an array |
| `{{object}}` | an object |
| `{{uuid}}` | a UUID |
| `{{iso8601}}` | a parseable timestamp |

Tokens live in `assets/tests/support/json-match.ts`. Add new ones there rather than
writing regexes inside step definitions.

### 7. Carry values between steps with placeholders

`{{ctx:name}}` reads from the World's context; `{{env:NAME}}` reads the environment.

```gherkin
When the "orders-api" client sends a POST request to "/v1/orders" with the following JSON body:
  """
  { "sku": "SKU-1001", "quantity": 1 }
  """
Then the response status is 201
And the JSON path "id" in the response is stored as "orderId"
When the "orders-api" client sends a GET request to "/v1/orders/{{ctx:orderId}}"
Then the JSON path "sku" in the response equals "SKU-1001"
```

```ts
Then('the JSON path {string} in the response is stored as {string}',
  function (path: string, key: string) {
    this.context.set(key, jsonPath(this.lastResponse().body, path));
  });
```

This is one of the rare legitimate two-`When` scenarios — a read-back after a write.
If it becomes common in your suite, promote the write to a `Given`.

Note the deliberate syntax split: matcher tokens have no prefix (`{{uuid}}`),
placeholders do (`{{ctx:orderId}}`). One expected body can mix both.

### 8. Tables for setup, converted where the schema is known

```gherkin
Given the following records exist in table "orders"
  | orderId | orderType | orderAmount | orderTimestamp            |
  | 1001    | AA        | $302.23     | 2026-07-31T12:00:01.0000Z |
  | 1002    | BB        | $24.54      | 2026-07-31T14:05:02.0000Z |
```

```ts
Given('the following records exist in table {string}',
  async function (tableName: string, data: DataTable) {
    const rows = data.hashes().map((row) =>
      Object.fromEntries(
        Object.entries(row).map(([col, val]) => [col, resolvePlaceholders(val, this)]),
      ),
    );
    const { keys } = await seedRecords(tableName, rows, this.mode);
    this.defer(`remove ${keys.length} row(s) from "${tableName}"`,
      () => deleteRecords(tableName, keys, this.mode));
  });
```

Cells arrive as strings. `$302.23` is the string `"$302.23"` until something converts
it — and if it reaches the datastore that way, an assertion against the API's `30223`
fails for the wrong reason, or a string comparison passes when the stored value was
never a number.

Convert in `tests/support/seed.ts`, which is the only part that knows the schema. Zod
is a tidy way to do it:

```ts
const OrderRow = z.object({
  orderId: z.coerce.number().int(),
  orderType: z.enum(['AA', 'BB', 'CC']),
  orderAmount: z.string().transform(toMinorUnits),
  orderTimestamp: z.coerce.date(),
});
const parsed = rows.map((row) => OrderRow.parse(row));
```

Nothing forces that choice — plain functions are fine. What matters is doing it once
per table rather than in each step.

For assertions, prefer a JSON doc string over a table. The matcher compares
structurally; a table of strings against a JSON response invites exactly the mismatch
above.

### 9. Mocked or integration, chosen by tag

Ask which one before writing anything. The request and assertion steps are identical
across modes; only the setup differs.

**`@mocked`** — the app runs *inside the test process* and Nock intercepts its
outbound calls:

```
cucumber process
├── test steps ──HTTP──► app (same process, 127.0.0.1:<ephemeral>)
                          └── outbound HTTP ──X── intercepted by Nock
```

The app must be started in-process. Launching it with `spawn`, `docker compose`, or
`sam local` puts it in another process where Nock has no reach and the "mocks" silently
do nothing.

**`@integration`** — requests go to a real endpoint from `BASE_URL`, downstreams are
real, Nock is never activated, and the mock steps throw if used.

```gherkin
@mocked @orders
Feature: Order creation
```

```ts
Before(async function (scenario) {
  this.mode = modeFromTags(scenario.pickle.tags.map((t) => t.name));
  if (this.mode === 'mocked') {
    nock.disableNetConnect();
    nock.enableNetConnect((host) => host.startsWith('127.0.0.1'));
    this.baseUrl = await startApp();
  } else {
    this.baseUrl = config.integrationBaseUrl;
  }
});
```

Loopback is re-enabled because the test's own call to the app is real HTTP through the
same stack.

### 10. Assert what the app *sent*, not just what it got back

Stubbing a downstream's response is half a test. The other half is checking the request
the app made:

```gherkin
Given the "payments" service responds to POST "/charges" with status 201 and the following JSON body:
  """
  { "id": "ch_abc123", "status": "succeeded" }
  """
When the "orders-api" client sends a POST request to "/v1/orders" with the following JSON body:
  """
  { "sku": "SKU-1001", "quantity": 2 }
  """
Then the "payments" service received 1 request to POST "/charges"
And the last request to the "payments" service had the following JSON body:
  """
  { "amount": 2500, "currency": "USD", "idempotencyKey": "{{string}}" }
  """
```

The stub records each intercepted call into the World:

```ts
interceptor.reply(function (uri, requestBody) {
  world.recordedRequests.push({
    service, method, path: uri, body: requestBody, headers: this.req.headers,
  });
  return [status, responseBody];
});
```

The `After` hook also fails a passing scenario on stubs that were set up and never
called — usually a sign the app took a different path than the scenario claims.

### 11. Every scenario cleans up after itself

Scenarios run in random order (`order: 'random'` in the config) and must pass alone, in
any order, and in parallel. Register the undo at the moment state is created, not at
the end:

```ts
const { keys } = await seedRecords(tableName, rows, this.mode);
this.defer(`remove ${keys.length} row(s)`, () => deleteRecords(tableName, keys, this.mode));
```

Registering late means a failure between creation and registration leaks state into
whatever runs next. Teardown runs in reverse order, so a scenario that creates a
customer then an order removes the order first.

For resources the API itself creates:

```gherkin
Then the response status is 201
And the created "/v1/orders" at the JSON path "id" is removed after the scenario
```

When cleanup isn't possible — append-only stores, audit logs — namespace instead:

```gherkin
Given a scenario-unique "customer" is stored as "customerId"
```

That yields `customer-3f9a1c7d`, unique per scenario.

The `After` hook attempts every teardown task even if one throws, reports problems only
when the scenario itself passed (so a real failure is never buried under cleanup
noise), and unconditionally clears Nock and stops the server.

### 12. TypeScript only

Step definitions are always `.ts`. `tsx` strips types at runtime without checking them,
so a separate typecheck is part of the same CI job:

```json
"typecheck:bdd": "tsc -p tsconfig.cucumber.json --noEmit"
```

Without it, type errors in step definitions are silently discarded rather than reported.

### 13. Feature files are reviewed before step definitions exist

The skill writes the `.feature` file, proposes edge cases, and **stops for your
approval** before implementing any glue. Feature text is cheap to change; step
definitions are not.

At that gate it also proposes scenarios you didn't ask for — downstream timeouts,
missing auth, duplicate creation, malformed JSON, pagination edges — with a one-line
rationale each, drawn from `references/edge-cases.md`.

---

## Part 3 — The example steps

These are the steps the scaffold starts you with. They are **examples, not a standard**
— a plausible starting set for an HTTP API, shaped so the World, hooks, and JSON
matcher have something to demonstrate. Rename them, reshape them, or delete the ones
your project has no use for.

They are deliberately not a catalog. A project's real catalog is whatever step
definitions that project has accumulated, and the skill builds it by reading the
project — grepping for `Given(`/`When(`/`Then(` and the step text actually used across
its `.feature` files — every time it adds a scenario. That inventory is what governs
reuse and generalization decisions, not this list.

Two consequences worth stating plainly. If your project already has a working suite,
the skill adapts to *its* wording rather than importing these. And once these steps are
in your repo they are yours: widening `the response status is {int}` or renaming
`the {string} client sends a...` to match your house style is expected, not a
deviation.

What's below is here so you can see the conventions applied end to end, and so a
greenfield project doesn't start from an empty directory.

### Setup — `Given`

| Step | Attachment |
| --- | --- |
| `the following records exist in table {string}` | data table |
| `no records exist in table {string}` | |
| `the value {string} is stored as {string}` | |
| `a scenario-unique {string} is stored as {string}` | |
| `the {string} client sets the header {string} to {string}` | |

### Downstream stubs — `Given`, `@mocked` only

| Step | Attachment |
| --- | --- |
| `the {string} service responds to {method} {string} with status {int}` | |
| `the {string} service responds to {method} {string} with status {int} and the following JSON body:` | doc string |
| `the {string} service always responds to {method} {string} with status {int} and the following JSON body:` | doc string |
| `the {string} service is unreachable for {method} {string}` | |
| `the {string} service takes {int} ms to respond to {method} {string} with status {int}` | |

### Action — `When`

| Step | Attachment |
| --- | --- |
| `the {string} client sends a {method} request to {string}` | |
| `the {string} client sends a {method} request to {string} with the following JSON body:` | doc string |
| `the {string} client sends a {method} request to {string} with the following body:` | doc string |

### Assertions — `Then`

| Step | Attachment |
| --- | --- |
| `the response status is {int}` | |
| `the response body matches the following JSON:` | doc string (exact) |
| `the response body contains the following JSON:` | doc string (partial) |
| `the response body is empty` | |
| `the response header {string} is {string}` | |
| `the response header {string} is present` | |
| `the JSON path {string} in the response equals {string}` | |
| `the JSON path {string} in the response has {int} items` | |
| `the response completes within {int} ms` | |
| `the {string} service received {int} request(s) to {method} {string}` | |
| `the last request to the {string} service had the following JSON body:` | doc string |
| `the last request to the {string} service had the header {string} set to {string}` | |
| `the JSON path {string} in the response is stored as {string}` | captures a value |
| `the created {string} at the JSON path {string} is removed after the scenario` | registers cleanup |

---

## Part 4 — Installing in Warp

Warp discovers skills from `.agents/skills/` directories. Each skill is a folder
containing `SKILL.md`; supporting files sit alongside it.

### Global — available in every project

```bash
mkdir -p ~/.agents/skills
unzip cucumber-typescript.zip -d ~/.agents/skills/
```

### Project — committed, shared with the team

```bash
mkdir -p .agents/skills
unzip cucumber-typescript.zip -d .agents/skills/
git add .agents/skills/cucumber-typescript
```

Either way you should end up with:

```
.agents/skills/cucumber-typescript/
├── SKILL.md
├── README.md
├── references/
└── assets/
```

Warp picks it up on your next interaction — no restart, no registration step.

### Verifying

Ask the agent:

```
What skills do I have?
```

`cucumber-typescript` should appear with its description.

### Using it

Invoke explicitly with a slash command:

```
/cucumber-typescript add coverage for the order cancellation endpoint
```

Or just describe the task and let the agent pick it up:

```
Write Cucumber tests for POST /v1/orders — mocked, with the payments service stubbed
```

Both work. The slash command guarantees the skill loads; natural language relies on the
agent matching your request against the description, which is why the description is
written the way it is.

### Editing it later

```
/open-skill
```

Opens a menu of discovered skills and lets you open one in your editor.

### Two things to know about discovery

Skill discovery follows your **current working directory**. Inside a git repo, Warp
includes skills from your current directory up through the repo root — so a project
skill in `.agents/skills/` is visible anywhere in that repo, but not from a different
project.

If a global and a project skill share a name, Warp shows both in the slash-command menu
with their paths so you can pick.

---

## Part 5 — What lands in your project

The skill scaffolds this on first use:

```
cucumber.mjs                     # config + profiles (mocked / integration / wip)
tsconfig.cucumber.json
tests/
  features/*.feature
  steps/
    context.steps.ts             # Given: state setup
    http.steps.ts                # When: the request under test
    mock.steps.ts                # Given: Nock stubs
    assertion.steps.ts           # Then: status, body, headers, mock verification
  support/
    config.ts                    # env-driven config, mode detection
    world.ts                     # World, teardown stack, unique keys
    hooks.ts                     # Before/After, cleanup, Nock + server lifecycle
    parameter-types.ts           # {method}
    json-match.ts                # structural JSON comparison + matcher tokens
    placeholders.ts              # {{ctx:...}} / {{env:...}}
    app-server.ts                # ADAPTER
    services.ts                  # ADAPTER
    seed.ts                      # ADAPTER
```

Dependencies:

```bash
npm i -D @cucumber/cucumber tsx typescript nock @types/node
```

### The three adapters

Everything else is portable. These three are yours to write, and they throw explicit
"not wired" errors until you do — deliberately, because a `Given` step that silently
seeds nothing produces a green test that proves less than it appears to.

**`app-server.ts`** — start the app in-process and return its base URL. For an
Express/Fastify/Hono app that's `createApp().listen(0)`. For an API Gateway Lambda
handler, wrap it in a `node:http` server that converts the request into an event and
the result back into a response, and keep that translation in this file only.

**`services.ts`** — map logical downstream names used in Gherkin (`"payments"`) to the
base URLs the app actually calls. Feature files reference the name, never the host, so
the same feature runs against any environment.

**`seed.ts`** — `seedRecords`, `deleteRecords`, `truncateTable`, and
`resetApplicationState`. This is where table rows get converted from strings to whatever
the datastore expects, and where in-process caches and singletons get reset between
scenarios.

### Running

```bash
npm run test:bdd:mocked        # @mocked scenarios
npm run test:bdd:integration   # @integration scenarios, needs BASE_URL
npm run test:bdd               # everything except @wip
npm run typecheck:bdd          # tsx doesn't typecheck; this does
```

Verify isolation, cheapest check first:

```bash
npm run test:bdd:mocked -- --name "the scenario name"   # passes alone
npm run test:bdd:mocked                                  # passes in random order
npm run test:bdd:mocked -- --parallel 4                  # passes concurrently
```

---

## Reference files

| File | Covers |
| --- | --- |
| `SKILL.md` | The workflow the agent follows |
| `references/framework-setup.md` | Scaffolding, dependencies, adapters |
| `references/gherkin-style.md` | Feature file phrasing, outlines, tables, tags |
| `references/step-reuse.md` | Cataloging the project's steps, matching, generalizing |
| `references/mocking.md` | Nock, mocked vs integration |
| `references/isolation-and-cleanup.md` | Cleanup, hooks, scenario independence |
| `references/edge-cases.md` | Edge case categories for the review gate |
