import type { Target, Upstream } from '../config/types.ts';

export interface TargetSelector {
  next(key: string, upstream: Upstream): string;
}

function roundRobin(targets: Target[], index: number): string {
  return targets[index % targets.length]!.url;
}

function weighted(targets: Target[], index: number): string {
  const total = targets.reduce((sum, t) => sum + t.weight, 0);
  let position = index % total;
  for (const target of targets) {
    if (position < target.weight) return target.url;
    position -= target.weight;
  }
  return targets[0]!.url;
}

export function createTargetSelector(): TargetSelector {
  const cursors = new Map<string, number>();

  return {
    next(key, upstream) {
      if (upstream.kind === 'single') return upstream.url;
      const index = cursors.get(key) ?? 0;
      cursors.set(key, index + 1);
      return upstream.balance === 'weighted_round_robin'
        ? weighted(upstream.targets, index)
        : roundRobin(upstream.targets, index);
    },
  };
}
