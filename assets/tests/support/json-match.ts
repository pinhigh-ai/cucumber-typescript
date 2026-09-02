export type MatchMode = 'exact' | 'partial';

type Predicate = (value: unknown) => boolean;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Tokens usable as expected values in feature files, e.g. "id": "{{uuid}}".
 * Add new ones here rather than embedding regexes in step definitions.
 */
const TOKENS: Record<string, Predicate> = {
  any: () => true,
  string: (v) => typeof v === 'string',
  number: (v) => typeof v === 'number' && Number.isFinite(v),
  boolean: (v) => typeof v === 'boolean',
  array: (v) => Array.isArray(v),
  object: (v) => typeof v === 'object' && v !== null && !Array.isArray(v),
  uuid: (v) => typeof v === 'string' && UUID_RE.test(v),
  iso8601: (v) => typeof v === 'string' && !Number.isNaN(Date.parse(v)),
};

const TOKEN_RE = /^\{\{([a-zA-Z0-9]+)\}\}$/;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function describe(value: unknown): string {
  return typeof value === 'string' ? JSON.stringify(value) : String(JSON.stringify(value));
}

function compare(
  actual: unknown,
  expected: unknown,
  mode: MatchMode,
  path: string,
  problems: string[],
): void {
  if (typeof expected === 'string') {
    const token = TOKEN_RE.exec(expected);
    if (token) {
      const predicate = TOKENS[token[1]];
      if (!predicate) {
        problems.push(`${path}: unknown matcher token {{${token[1]}}}`);
        return;
      }
      if (!predicate(actual)) {
        problems.push(`${path}: expected {{${token[1]}}} but got ${describe(actual)}`);
      }
      return;
    }
  }

  if (Array.isArray(expected)) {
    if (!Array.isArray(actual)) {
      problems.push(`${path}: expected an array but got ${describe(actual)}`);
      return;
    }
    if (actual.length !== expected.length) {
      problems.push(`${path}: expected ${expected.length} items but got ${actual.length}`);
      return;
    }
    expected.forEach((item, i) => compare(actual[i], item, mode, `${path}[${i}]`, problems));
    return;
  }

  if (isPlainObject(expected)) {
    if (!isPlainObject(actual)) {
      problems.push(`${path}: expected an object but got ${describe(actual)}`);
      return;
    }
    for (const key of Object.keys(expected)) {
      const childPath = path ? `${path}.${key}` : key;
      if (!(key in actual)) {
        problems.push(`${childPath}: missing from the actual value`);
        continue;
      }
      compare(actual[key], expected[key], mode, childPath, problems);
    }
    if (mode === 'exact') {
      for (const key of Object.keys(actual)) {
        if (!(key in expected)) {
          const childPath = path ? `${path}.${key}` : key;
          problems.push(`${childPath}: unexpected key with value ${describe(actual[key])}`);
        }
      }
    }
    return;
  }

  if (actual !== expected) {
    problems.push(`${path}: expected ${describe(expected)} but got ${describe(actual)}`);
  }
}

/** Returns a list of human-readable mismatches; empty means the values match. */
export function diffJson(actual: unknown, expected: unknown, mode: MatchMode): string[] {
  const problems: string[] = [];
  compare(actual, expected, mode, '$', problems);
  return problems;
}

export function assertJsonMatches(
  actual: unknown,
  expected: unknown,
  mode: MatchMode,
  label = 'response body',
): void {
  const problems = diffJson(actual, expected, mode);
  if (problems.length === 0) return;

  throw new Error(
    [
      `${label} did not match (${mode} comparison):`,
      ...problems.map((p) => `  - ${p}`),
      '',
      'Actual:',
      JSON.stringify(actual, null, 2),
    ].join('\n'),
  );
}

/** Resolves a dotted / bracketed path such as `items[0].id` against parsed JSON. */
export function jsonPath(value: unknown, path: string): unknown {
  const segments = path
    .replace(/\[(\d+)\]/g, '.$1')
    .split('.')
    .filter((s) => s.length > 0);

  let current: unknown = value;
  for (const segment of segments) {
    if (Array.isArray(current)) {
      current = current[Number(segment)];
    } else if (isPlainObject(current)) {
      current = current[segment];
    } else {
      throw new Error(`Cannot read "${segment}" of ${describe(current)} while resolving "${path}"`);
    }
  }
  return current;
}
