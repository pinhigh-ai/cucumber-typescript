# Recommending edge cases

At the review gate, propose scenarios the user did not ask for. Work through the
categories below, pick the ones that genuinely apply to the endpoint in question, and
present each with a one-line rationale.

Resist dumping the whole list. Five well-chosen suggestions get added; twenty get
skimmed and ignored. Order them by what would actually break in production.

Format each as a scenario title plus rationale, not full Gherkin — the user is
deciding what to include, not reviewing syntax:

```
- Scenario: Order creation is rejected when the payments service times out
  Rationale: the handler has no explicit timeout, so a slow downstream currently
  surfaces as a 502 with no error code.
```

## Input validation

- Missing required fields; null vs. absent (these are different, and APIs often differ)
- Wrong type for a field (string where number expected)
- Boundary values: 0, -1, max int, empty string, empty array, empty object body
- Oversized payloads and oversized individual string fields
- Unicode, emoji, and combining characters in fields that flow to storage or search
- Unexpected extra fields — accepted and ignored, or rejected?
- Malformed JSON body (not just wrong-shaped JSON)

## Identity and access

- Missing credentials, expired credentials, malformed token
- Valid credentials without the required scope or role
- A valid identity acting on another tenant's resource — the classic IDOR check
- Authorization applied to the collection endpoint as well as the item endpoint

## Resource state

- Target does not exist → 404 rather than 500
- Target exists but is soft-deleted, archived, or otherwise not-actionable
- Duplicate creation: is the second call a 409, or idempotent?
- Repeating the same request with the same idempotency key
- Concurrent modification / stale version token

## Downstream failure (mocked mode especially)

- Downstream returns 5xx
- Downstream returns 4xx (often mishandled — it usually should not surface verbatim)
- Downstream times out or the connection is refused
- Downstream returns a 200 with an unexpected body shape
- Downstream is slow enough to trip a circuit breaker or retry
- Retry behaviour: does the app retry a non-idempotent call it should not retry?

## Contract and protocol

- Wrong HTTP method on a valid path → 405
- Unsupported `Content-Type` and unsupported `Accept`
- Query parameter handling: absent, empty, repeated, unknown
- Pagination: first page, last page, page past the end, invalid cursor
- Trailing slashes and case sensitivity in paths, if the router is ambiguous about them

## Persistence and side effects

- The failure path leaves no partial write behind
- The success path is visible on a subsequent read (write-then-read consistency)
- Events or messages emitted exactly once, not zero or twice

## Observability

Worth a scenario only when the project treats these as contract:

- Correlation/trace ID is propagated to downstream calls
- Error responses carry a stable machine-readable error code, not just a message

## What not to suggest

- Scenarios that only re-test a framework's own validation with different field names
- Performance and load characteristics — Cucumber is the wrong tool
- Combinatorial explosions of an `Examples` table that add rows without adding risk
