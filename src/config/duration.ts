const UNIT_MS: Record<string, number> = {
  ms: 1,
  s: 1_000,
  m: 60_000,
  h: 3_600_000,
};

export function parseDuration(value: string): number {
  const match = value.trim().match(/^(\d+)(ms|s|m|h)$/);
  if (!match) {
    throw new Error(`invalid duration: ${JSON.stringify(value)} (expected e.g. "30s", "1m", "2h")`);
  }
  const [, amount, unit] = match;
  return Number(amount) * UNIT_MS[unit!]!;
}
