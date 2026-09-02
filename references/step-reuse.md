# Step reuse

A suite with one step definition per scenario has failed at the only thing Cucumber is
good for. Treat the step library as a small internal DSL that grows by widening, not by
accumulating near-duplicates.

## Build the catalog first

Before writing any Gherkin, enumerate what exists:

```bash
rg -n "^\s*(Given|When|Then|defineStep)\(" --glob '*.ts' --glob '*.js'
```

For each hit, record the pattern text, the parameter types, and the file. Also list the
distinct step text actually used across `*.feature` files — definitions with zero call
sites are dead and are fair game to delete or repurpose.

Everything found this way carries equal weight. Steps that arrived with the scaffold
have no special status: if the project has evolved its own wording, that wording wins,
and a scaffold step nobody calls is as dead as any other.

## The decision, per step

For every step you are about to write, in this order:

1. **Exact match exists** → use it verbatim. Match on meaning, not wording; if an
   existing step says `sends a POST request to` and you were about to write `issues a
   POST request to`, that is the same step.
2. **Near match exists** → generalize it. See below.
3. **Neither** → write a new one, parameterized from the start. Ask what would vary in
   the next scenario and make that a parameter now.

The bar for "near match" is deliberately low. If two steps would share more than half
their body, they are one step.

## Generalizing an existing step

Widening a step is a refactor with call sites, and you own all of them.

Typical widenings:

| Before | After |
| --- | --- |
| `Then the response status is 200` | `Then the response status is {int}` |
| `When a POST request is sent to {string}` | `When the {string} client sends a {word} request to {string}` |
| `Given an order exists` | `Given the following {string} records exist:` (data table) |
| `Then the response body contains an error` | `Then the response body contains the following JSON:` (doc string) |

Procedure:

1. Change the pattern and signature in the definition file.
2. Update the implementation to honour the new parameter, keeping the old behaviour as
   the value that existing call sites will pass.
3. Rewrite **every** `.feature` call site to the new wording. Search by the old literal
   text; do not rely on memory of which files use it.
4. Run the full suite, not just the new feature, and confirm no undefined steps.
5. List the rewritten call sites in your final report so the user can review the blast
   radius.

Do not leave the old narrow step defined "for compatibility". Two definitions where one
is a special case of the other produce ambiguous-step failures the moment someone
writes the general wording.

## Parameter types

Prefer built-in types: `{int}`, `{float}`, `{word}`, `{string}`. They keep patterns
readable and give you real types in TypeScript.

Define a custom parameter type when a domain concept appears in three or more steps —
for example an HTTP method that should be constrained and upper-cased:

```ts
defineParameterType({
  name: 'method',
  regexp: /GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS/,
  transformer: (s: string) => s.toUpperCase() as HttpMethod,
});
```

Put custom types in `tests/support/parameter-types.ts` so they load before the step
files. A custom type used in only one step is usually a sign the step is too specific.

## Anti-patterns

- **Scenario-named steps** — `Given the happy path setup is complete`. Opaque, and
  reusable by exactly one scenario.
- **Steps that assert and act** — a `When` that also checks the status code. It makes
  the failure message useless and blocks reuse from any scenario expecting an error.
- **Conditional bodies** — `if (thing === 'order') { ... } else { ... }`. Two steps
  wearing a trench coat; either split them or parameterize the difference properly.
- **Sharing state through module globals** — use the World. Parallel workers each get
  their own World instance; module state is shared and will produce flaky cross-talk.
