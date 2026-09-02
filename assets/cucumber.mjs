// Run with: NODE_OPTIONS="--import tsx" cucumber-js -p mocked
//
// Support files are imported before step files so custom parameter types are
// registered before any step expression that uses them is compiled.

const common = {
  import: ['tests/support/**/*.ts', 'tests/steps/**/*.ts'],
  paths: ['tests/features/**/*.feature'],
  format: ['summary', 'progress-bar', 'html:reports/cucumber.html'],
  formatOptions: { snippetInterface: 'async-await' },
  publishQuiet: true,
  strict: true,
  // Random order is a forcing function for scenario independence. The seed is
  // printed on every run, so `--order random:12345` reproduces a failure.
  order: 'random',
};

export default {
  ...common,
  tags: 'not @wip',
};

export const mocked = {
  ...common,
  tags: '@mocked and not @wip',
};

export const integration = {
  ...common,
  tags: '@integration and not @wip',
  // Real environments are slower and less tolerant of parallelism.
  parallel: 1,
};

export const wip = {
  ...common,
  tags: '@wip',
};
