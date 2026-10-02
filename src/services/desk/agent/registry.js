/**
 * registry.js — every tool the planner can choose, in one catalog.
 */

import { TOOLS as BASE_TOOLS } from './tools.js';
import { UNDERSTAND_TOOLS } from './understandTools.js';

export const TOOLS = { ...BASE_TOOLS, ...UNDERSTAND_TOOLS };
export const TOOL_NAMES = Object.keys(TOOLS);

/** Tool catalog text for the planner prompt. */
export function toolCatalog() {
  return TOOL_NAMES.map((name) => `- ${name}: ${TOOLS[name].description}\n  args: ${TOOLS[name].args}`).join('\n');
}
