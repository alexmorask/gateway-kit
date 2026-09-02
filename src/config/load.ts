import { readFileSync } from 'node:fs';
import { parse as parseYaml } from 'yaml';
import { validateConfig } from './validate.ts';
import type { GatewayConfig } from './types.ts';

export function loadConfig(path: string): GatewayConfig {
  let text: string;
  try {
    text = readFileSync(path, 'utf8');
  } catch {
    throw new Error(`cannot read config file: ${path}`);
  }

  let parsed: unknown;
  try {
    parsed = parseYaml(text);
  } catch (err) {
    throw new Error(`config is not valid YAML: ${(err as Error).message}`);
  }

  return validateConfig(parsed);
}
