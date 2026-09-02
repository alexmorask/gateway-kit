import { test } from 'node:test';
import assert from 'node:assert/strict';
import { matchRoute, forwardPath } from '../src/router.ts';
import type { RouteConfig } from '../src/config/types.ts';

function route(path: string, methods: string[], stripPrefix = false): RouteConfig {
  return { path, methods, stripPrefix, upstream: { kind: 'single', url: 'http://x' }, timeoutMs: 1000 };
}

const routes = [
  route('/api/users', ['GET', 'POST']),
  route('/api/users/admin', ['GET']),
  route('/api/products', ['GET'], true),
];

test('matches an exact path and an allowed method', () => {
  const m = matchRoute(routes, 'GET', '/api/users');
  assert.equal(m.kind, 'matched');
  assert.equal(m.kind === 'matched' && m.route.path, '/api/users');
});

test('matches a subpath and prefers the longest matching prefix', () => {
  const m = matchRoute(routes, 'GET', '/api/users/admin/settings');
  assert.equal(m.kind === 'matched' && m.route.path, '/api/users/admin');
});

test('does not treat a sibling with a shared string prefix as a match', () => {
  assert.equal(matchRoute(routes, 'GET', '/api/users-secret').kind, 'not_found');
});

test('unknown path is not_found', () => {
  assert.equal(matchRoute(routes, 'GET', '/nope').kind, 'not_found');
});

test('known path with a disallowed method is method_not_allowed with the allow list', () => {
  const m = matchRoute(routes, 'DELETE', '/api/users');
  assert.equal(m.kind, 'method_not_allowed');
  assert.deepEqual(m.kind === 'method_not_allowed' && m.allow, ['GET', 'POST']);
});

test('forwardPath strips the route prefix when strip_prefix is set, preserving the query', () => {
  assert.equal(forwardPath(route('/api/products', ['GET'], true), '/api/products/123?x=1'), '/123?x=1');
});

test('forwardPath yields / when the path equals the route exactly and strip_prefix is set', () => {
  assert.equal(forwardPath(route('/api/products', ['GET'], true), '/api/products'), '/');
});

test('forwardPath keeps the full path when strip_prefix is not set', () => {
  assert.equal(forwardPath(route('/api/users', ['GET']), '/api/users/7?q=z'), '/api/users/7?q=z');
});
