import type { ApiWorld } from './world.js';

const PLACEHOLDER_RE = /\{\{(ctx|env):([^}]+)\}\}/g;

/**
 * Replaces {{ctx:name}} and {{env:NAME}} in step text, doc strings, and data
 * tables. Deliberately distinct from the matcher tokens in json-match.ts
 * ({{uuid}}, {{any}}), which have no prefix and are left untouched here so an
 * expected body can mix both.
 */
export function resolvePlaceholders(text: string, world: ApiWorld): string {
  return text.replace(PLACEHOLDER_RE, (_match, kind: string, name: string) => {
    const key = name.trim();
    if (kind === 'env') {
      const value = process.env[key];
      if (value === undefined) {
        throw new Error(`Environment variable "${key}" referenced by {{env:${key}}} is not set.`);
      }
      return value;
    }
    const value = world.getContext(key);
    return typeof value === 'string' ? value : JSON.stringify(value);
  });
}

export function resolveJson(text: string, world: ApiWorld): unknown {
  const resolved = resolvePlaceholders(text, world);
  try {
    return JSON.parse(resolved);
  } catch (error) {
    throw new Error(
      `Doc string is not valid JSON after placeholder resolution:\n${resolved}\n\n${String(error)}`,
    );
  }
}
