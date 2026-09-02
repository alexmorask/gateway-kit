import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseDuration } from '../src/config/duration.ts';

test('parses second, minute, and hour units to milliseconds', () => {
  assert.equal(parseDuration('30s'), 30_000);
  assert.equal(parseDuration('1s'), 1_000);
  assert.equal(parseDuration('60s'), 60_000);
  assert.equal(parseDuration('1m'), 60_000);
  assert.equal(parseDuration('2h'), 7_200_000);
  assert.equal(parseDuration('500ms'), 500);
});

test('tolerates surrounding whitespace', () => {
  assert.equal(parseDuration('  10s '), 10_000);
});

test('rejects malformed durations', () => {
  assert.throws(() => parseDuration('30'));
  assert.throws(() => parseDuration('30x'));
  assert.throws(() => parseDuration('abc'));
  assert.throws(() => parseDuration(''));
  assert.throws(() => parseDuration('-5s'));
});
