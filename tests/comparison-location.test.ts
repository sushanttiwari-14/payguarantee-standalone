import test from 'node:test';
import assert from 'node:assert/strict';
import { readComparisonLocation, writeComparisonLocation } from '../shared/comparison-location.ts';

test('comparison and filter state round-trips into a reloadable URL without old evidence selection', () => {
  const state = { open: true, baseline: 'baseline-id', candidate: 'candidate-id', query: 'merchant v2 & retry', outcome: 'inconclusive' as const };
  const url = writeComparisonLocation('?view=lab&run=old&case=old-case', state);
  const params = new URL(url, 'http://localhost').searchParams;
  assert.equal(params.get('view'), 'runs');
  assert.equal(params.has('run'), false); assert.equal(params.has('case'), false);
  assert.deepEqual(readComparisonLocation(params.toString(), { baseline: 'other', candidate: 'another' }), state);
  const closed = writeComparisonLocation(params.toString(), { ...state, open: false, query: '', outcome: 'all' });
  assert.deepEqual(readComparisonLocation(closed.split('?')[1], { baseline: '', candidate: '' }), { ...state, open: false, query: '', outcome: 'all' });
});

test('fresh or malformed navigation uses safe default filters without losing requested run identities', () => {
  assert.deepEqual(readComparisonLocation('?view=runs&baseline=missing&outcome=bogus', { baseline: 'newest', candidate: 'second' }), { open: false, baseline: 'missing', candidate: 'second', query: '', outcome: 'all' });
});
