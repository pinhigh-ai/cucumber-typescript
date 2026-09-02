---
name: cucumber-typescript
description: Write Gherkin feature files and TypeScript step definitions for cucumber-js against HTTP APIs, scaffolding the framework, Nock mocking, and structural JSON assertions. Use when the user mentions Cucumber, Gherkin, .feature files, scenario outlines, or step definitions, or asks for acceptance, integration, or end-to-end tests of an HTTP endpoint or Lambda-backed API — even without saying "Cucumber". Also use when adding a scenario to an existing suite, when step definitions have drifted or duplicated, or when wiring TypeScript into an existing cucumber-js project.
---

# Cucumber + TypeScript

Write feature files and step definitions for cucumber-js in TypeScript, targeting HTTP APIs.

The whole reason a project pays the Cucumber tax is step reuse. A suite where every
scenario has its own bespoke steps is worse than plain integration tests — it has all
the indirection and none of the payoff. So the single most important behavior in this
skill is: **look before you write, and generalize before you duplicate.**

## Operating principles

**Steps are written for engineers, not product owners.** Skip BDD persona prose. A step
should name the actor, the protocol, and the target concretely.

- Bad: `When the user makes a request to the system`
- Good: `When the "orders-api" client sends a POST request to "/v1/orders" with the following JSON body:`

**Given = existing state. When = the one action under test. Then = assertions only.**
A scenario has exactly one `When` in almost every case. If you find yourself writing a
second `When`, the first one is really a `Given`.

**JSON is compared as objects.** Never string-compare response bodies. Key order,
whitespace, and numeric formatting must not affect the result. Use the matcher in
`assets/tests/support/json-match.ts`.

**Parameterize aggressively.** Values that vary between scenarios belong in
`Scenario Outline` `Examples` tables or step parameters, not in copies of the scenario.

**Every scenario cleans up after itself.** Scenarios run in random order and must pass
alone, in any order, and in parallel. State created by a scenario is undone by that
scenario, registered at creation time rather than at the end.
See `references/isolation-and-cleanup.md`.

## Workflow

Follow these in order. Gate 4 is a hard stop.

### 1. Inventory what already exists

Before anything else, build a picture of the current suite:

- Find feature files: `**/*.feature`
- Find step definitions: grep for `Given(`, `When(`, `Then(`, `defineStep(`
- Note the cucumber config (`cucumber.mjs`, `cucumber.js`, `cucumber.json`, or
  `package.json#cucumber`) and whether TypeScript is already wired in

Produce a short internal catalog of every existing step signature. This per-project
inventory is the authority for reuse decisions — build it fresh each time rather than
assuming the scaffold's example steps are what the project uses. Details in
`references/step-reuse.md`.

### 2. Determine test mode

Ask the user whether this is a **mocked** test or a **full integration** test, unless
they already said. The answer changes the scaffolding and the steps you use:

- **Mocked** — the app under test is started in-process by the test run, and Nock
  intercepts the app's *outbound* HTTP calls to downstream services. Tagged `@mocked`.
- **Integration** — requests go to a real running endpoint (local or deployed), and
  downstream services are real. Tagged `@integration`. Nock is disabled.

Both modes share the same request and assertion steps; only the `Given` mocking steps
and the hooks differ. See `references/mocking.md`.

### 3. Scaffold the framework if absent

If the project has no working cucumber-js + TypeScript setup, create it from
`assets/`. Keep the wiring intact — the World, hooks, JSON matcher, and placeholder
resolver are designed to fit together. The step definitions in `assets/tests/steps/`
are examples rather than a fixed library: keep the ones that fit, and rename or drop
the rest to match the project's domain. Follow
`references/framework-setup.md` for the dependency list, npm scripts, and the
project-specific adapters (`app-server.ts`, `services.ts`, `seed.ts`) that must be
wired by hand.

If a setup already exists, adapt to it rather than replacing it, and follow its
existing step wording rather than importing the examples. Port only what is missing —
usually the JSON matcher and the cleanup hooks.

### 4. Draft the feature file, then stop for review

Write the `.feature` file only. No step definitions yet.

- Reuse existing step text verbatim wherever it fits.
- Where an existing step *almost* fits, plan a generalization (see step 5) and write
  the feature against the generalized wording.
- Use `Scenario Outline` + `Examples` whenever two scenarios differ only by data.
- Use a table step (`in table "orders"`) for state setup involving more than one field
  or more than one row.
- Follow `references/gherkin-style.md` for phrasing, doc strings, and tags.

Then append a **recommended edge cases** section: scenarios the user did not ask for
but probably wants. Work through `references/edge-cases.md` and propose the ones that
actually apply — with a one-line rationale each, not a generic checklist dump.

Present the draft and explicitly ask for review and approval before implementing step
definitions. Do not proceed on your own initiative; the point of the gate is that
feature text is cheap to change and step definitions are not.

### 5. Implement or extend step definitions

After approval:

- For each step in the feature, resolve it against the catalog from step 1.
- **Reuse** an existing definition if it matches.
- **Generalize** an existing definition when it nearly matches — add a parameter,
  then update *every* existing `.feature` call site to the new wording. This is
  expected and encouraged; a widening refactor is cheaper than a near-duplicate step.
- **Create** a new definition only when neither applies, and write it parameterized
  from the start.

All step definitions are TypeScript (`.ts`). Never emit `.js` step definitions.
Type the World, the parameters, and the response shape.

Two things to get right while implementing:

- **A step definition that needs typed values from a data table converts them itself.**
  Cell values arrive as strings; a Zod schema in the step or in the seed adapter is a
  reasonable way to turn `$302.23` into cents. Keep the conversion next to the thing
  that knows the schema rather than spreading it across steps.
- **Any step that creates state registers its own undo** via `world.defer(...)` at the
  point of creation, so the scenario stays independent.

### 6. Run and iterate

Run the appropriate profile (`npm run test:bdd:mocked` or `:integration`). Fix
undefined, ambiguous, and pending steps until the suite is green. Ambiguous step
errors are a signal that two definitions should be merged — merge them rather than
narrowing the regex.

Then confirm independence, because a suite that only passes in one order is not
finished: run the new scenario alone (`-- --name "..."`), then run the whole suite
again. The default profile already randomises order, so a second green run over a
different ordering is meaningful evidence.

### 7. Report

Summarize: scenarios added, steps reused vs. generalized vs. created, and any call
sites you rewrote during a generalization.

## Reference files

Read these as needed rather than all upfront:

| File | Read it when |
| --- | --- |
| `README.md` | The user is new to Cucumber, or wants worked examples of the conventions |
| `references/framework-setup.md` | Scaffolding, dependencies, npm scripts, TS wiring |
| `references/gherkin-style.md` | Writing feature files, outlines, doc strings, tags |
| `references/step-reuse.md` | Cataloging, matching, and generalizing steps |
| `references/mocking.md` | Nock setup, mocked vs integration hooks |
| `references/isolation-and-cleanup.md` | Cleanup, hooks, and scenario independence |
| `references/edge-cases.md` | Recommending additional scenarios at the review gate |

`assets/` holds the framework template: cucumber config, TypeScript config, World,
hooks, JSON matcher, placeholder resolver, and a set of example step definitions to
build on.
