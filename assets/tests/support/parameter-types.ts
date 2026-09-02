import { defineParameterType } from '@cucumber/cucumber';
import type { HttpMethod } from './world.js';

/**
 * Constrains method parameters to real verbs and normalises casing, so
 * `sends a post request` and `sends a POST request` reach the same handler.
 */
defineParameterType({
  name: 'method',
  regexp: /GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS|get|post|put|patch|delete|head|options/,
  transformer: (value: string): HttpMethod => value.toUpperCase() as HttpMethod,
});
