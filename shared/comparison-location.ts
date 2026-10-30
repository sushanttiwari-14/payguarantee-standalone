export interface ComparisonLocation {
  open: boolean; baseline: string; candidate: string; query: string;
  outcome: 'all' | 'passed' | 'failed' | 'inconclusive';
}

export function readComparisonLocation(search: string, defaults: Pick<ComparisonLocation, 'baseline' | 'candidate'>): ComparisonLocation {
  const params = new URLSearchParams(search);
  const outcome = params.get('outcome');
  return {
    open: params.get('compare') === '1',
    baseline: params.get('baseline') || defaults.baseline,
    candidate: params.get('candidate') || defaults.candidate,
    query: params.get('q') || '',
    outcome: outcome === 'passed' || outcome === 'failed' || outcome === 'inconclusive' ? outcome : 'all',
  };
}

export function writeComparisonLocation(search: string, state: ComparisonLocation): string {
  const params = new URLSearchParams(search);
  params.set('view', 'runs');
  params.delete('run'); params.delete('case');
  for (const [key, value] of [['compare', state.open ? '1' : ''], ['baseline', state.baseline], ['candidate', state.candidate], ['q', state.query], ['outcome', state.outcome === 'all' ? '' : state.outcome]]) {
    if (value) params.set(key, value); else params.delete(key);
  }
  return `/app?${params.toString()}`;
}
