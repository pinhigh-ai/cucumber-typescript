# Gherkin style

Feature files here are technical documentation for engineers. Precision beats
readability-for-executives.

## Phrasing

Name the actor, the protocol, and the target. Compare:

```gherkin
# too abstract to debug from
When the user makes a request to the system
Then the system responds successfully

# concrete
When the "orders-api" client sends a POST request to "/v1/orders"
Then the response status is 201
```

Guidelines:

- `Given` describes state that already exists. Past or present tense, never an action
  the test performs as its subject: `Given the following "order" records exist:`
- `When` is the single action under test. One per scenario.
- `Then` asserts. No side effects, no setup, no requests.
- `And` / `But` continue the previous keyword's role — an `And` after `When` is still
  an action, so avoid it unless the action genuinely has two parts.

Quote all string parameters in the feature text (`"orders-api"`, `"/v1/orders"`) so the
`{string}` parameter type picks them up cleanly.

## Scenario Outline and Examples

Use an outline the moment two scenarios differ only by data. Put the varying values in
the `Examples` table and give the table a name when there is more than one.

```gherkin
Scenario Outline: Order creation rejects invalid quantities
  Given the following "product" records exist:
    | sku      | name        | stock |
    | SKU-1001 | Blue widget | 5     |
  When the "orders-api" client sends a POST request to "/v1/orders" with the following JSON body:
    """
    { "sku": "SKU-1001", "quantity": <quantity> }
    """
  Then the response status is <status>
  And the response body contains the following JSON:
    """
    { "error": { "code": "<errorCode>" } }
    """

  Examples: rejected quantities
    | quantity | status | errorCode          |
    | 0        | 400    | QUANTITY_TOO_LOW   |
    | -1       | 400    | QUANTITY_TOO_LOW   |
    | 9999     | 409    | INSUFFICIENT_STOCK |
```

Placeholders (`<quantity>`) work inside doc strings and data tables as well as in step
text — that is what makes JSON payload variation practical.

Keep one axis of variation per outline. An `Examples` table with eight columns where
half are irrelevant to most rows should be two outlines.

## Doc strings for JSON

Request payloads and expected bodies go in triple-quoted doc strings containing valid
JSON. The step definitions parse them into objects; comparison is structural, so
formatting and key order in the feature file are purely cosmetic.

Two assertion flavours exist, and the choice matters:

- `Then the response body matches the following JSON:` — exact. Every key in the
  actual response must be present in the expected block and vice versa.
- `Then the response body contains the following JSON:` — partial. The expected block
  is a subset; extra keys in the response are ignored. Prefer this for responses
  carrying volatile fields.

For volatile values inside an exact match, use matcher tokens rather than dropping to
a partial match:

```gherkin
Then the response body matches the following JSON:
  """
  {
    "id": "{{uuid}}",
    "createdAt": "{{iso8601}}",
    "sku": "SKU-1001",
    "total": "{{number}}"
  }
  """
```

Available tokens: `{{any}}`, `{{string}}`, `{{number}}`, `{{boolean}}`, `{{uuid}}`,
`{{iso8601}}`, `{{array}}`, `{{object}}`. They are defined in
`assets/tests/support/json-match.ts`; add new ones there rather than inventing regexes
inside step definitions.

## Referencing captured values

Values captured from an earlier step are interpolated with `{{ctx:name}}`, and
environment values with `{{env:NAME}}`:

```gherkin
When the "orders-api" client sends a POST request to "/v1/orders" with the following JSON body:
  """
  { "sku": "SKU-1001", "quantity": 2 }
  """
And the JSON path "id" in the response is stored as "orderId"
When the "orders-api" client sends a GET request to "/v1/orders/{{ctx:orderId}}"
```

Note that this is one of the rare legitimate two-`When` cases — a read-back after a
write. If it becomes common, promote the write to a `Given` step instead.

## Data tables

Use a table for state setup with more than one field or more than one row:

```gherkin
Given the following records exist in table "orders"
  | orderId | orderType | orderAmount | orderTimestamp            |
  | 1001    | AA        | $302.23     | 2026-07-31T12:00:01.0000Z |
  | 1002    | BB        | $24.54      | 2026-07-31T14:05:02.0000Z |
```

Cell values reach the step definition as strings, so a step that needs real types
converts them — most naturally in the seed adapter, which is the only part that knows
the table's schema. Zod works well for this:

```ts
const OrderRow = z.object({
  orderId: z.coerce.number().int(),
  orderType: z.enum(['AA', 'BB', 'CC']),
  orderAmount: z.string().transform(toMinorUnits),
  orderTimestamp: z.coerce.date(),
});
```

Whatever the mechanism, do the conversion once per table rather than in each step, and
don't let `"$302.23"` reach the datastore as a string.

Note that cucumber-js parameter types cannot help here — their transformer only ever
receives text matched inside the step sentence (`(...match: string[]) => T`) and never
sees the attached table. There is no JS equivalent of Cucumber-JVM's `@DataTableType`.

For assertions, prefer a JSON doc string over a table. The JSON matcher compares
structurally and supports `{{uuid}}`-style tokens; a table of strings compared against
a JSON response invites exactly the string-vs-number mismatch above.

## Tags

- `@mocked` / `@integration` — required on every feature or scenario; the profiles
  select on them and the hooks branch on them.
- `@wip` — excluded from the default profile.
- Domain tags (`@orders`, `@auth`) are useful for selective runs; keep them lowercase
  and singular-domain.

Tag at the `Feature` level when the whole file shares a mode, which is the common case.

## Background

Use `Background` for `Given` state shared by every scenario in the file. Never put a
`When` in a `Background` — that hides the action under test.
