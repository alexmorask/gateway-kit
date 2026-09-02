import type { RouteConfig } from './config/types.ts';

export type RouteMatch =
  | { kind: 'matched'; route: RouteConfig }
  | { kind: 'not_found' }
  | { kind: 'method_not_allowed'; allow: string[] };

function pathnameOf(url: string): string {
  const q = url.indexOf('?');
  return q === -1 ? url : url.slice(0, q);
}

function pathMatches(routePath: string, pathname: string): boolean {
  return pathname === routePath || pathname.startsWith(`${routePath}/`);
}

export function matchRoute(routes: RouteConfig[], method: string, url: string): RouteMatch {
  const pathname = pathnameOf(url);
  const candidates = routes
    .filter((route) => pathMatches(route.path, pathname))
    .sort((a, b) => b.path.length - a.path.length);

  const best = candidates[0];
  if (!best) return { kind: 'not_found' };
  if (!best.methods.includes(method.toUpperCase())) {
    return { kind: 'method_not_allowed', allow: best.methods };
  }
  return { kind: 'matched', route: best };
}

export function forwardPath(route: RouteConfig, url: string): string {
  if (!route.stripPrefix) return url;
  const q = url.indexOf('?');
  const pathname = q === -1 ? url : url.slice(0, q);
  const query = q === -1 ? '' : url.slice(q);
  const stripped = pathname.slice(route.path.length) || '/';
  return `${stripped}${query}`;
}
