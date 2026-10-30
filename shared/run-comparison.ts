import type { CaseResult, Check, Run, Scenario } from './types.ts';

export type CaseChange = 'regressed' | 'fixed' | 'resolved' | 'unresolved' | 'unchanged' | 'added' | 'removed' | 'not-comparable';
export interface ComparedCase {
  scenarioId: string;
  before?: CaseResult;
  after?: CaseResult;
  change: CaseChange;
  checks: { name: string; before?: Check; after?: Check }[];
}
export interface RunComparison {
  comparable: boolean;
  reasons: string[];
  cases: ComparedCase[];
  summary: { regressed: number; fixed: number; resolved: number; unresolved: number; unchanged: number };
}

// Compare the inputs that affect evaluation. Library titles, review state and generation
// metadata may change without changing what the decision component was asked to do.
function facts(s: Scenario) {
  return JSON.stringify([s.id, s.message, s.capturedCents, s.priorRefundCents, s.requestedCents, s.supervisorApproved, s.fault]);
}

/** Describes recorded outcomes; never infers an improvement from incomparable or missing cases. */
export function compareRuns(base: Run, candidate: Run): RunComparison {
  const reasons: string[] = [];
  if (base.origin || candidate.origin) reasons.push('Imported file results are unverified external evidence. Replay them locally before comparing observed outcomes.');
  if (base.id === candidate.id) reasons.push('Select two different runs.');
  if (base.provider !== candidate.provider) reasons.push('Evidence sources differ.');
  if (!base.provenance?.verifierVersion || !candidate.provenance?.verifierVersion || base.provenance.verifierVersion !== candidate.provenance.verifierVersion) {
    reasons.push('Evaluator versions differ or were not recorded.');
  }
  const policy = (run: Run) => JSON.stringify([run.policy.id, run.policy.name, run.policy.currency, run.policy.limitCents, run.policy.version]);
  if (policy(base) !== policy(candidate)) reasons.push('The tested policies differ.');
  const before = new Map(base.results.map(result => [result.scenario.id, result]));
  const after = new Map(candidate.results.map(result => [result.scenario.id, result]));
  if (!before.size || !after.size || before.size !== base.results.length || after.size !== candidate.results.length) reasons.push('Case identities are empty or duplicated.');
  if (before.size !== after.size || [...before.keys()].some(id => !after.has(id))) reasons.push('The selected case sets differ.');
  if ([...before].some(([id, result]) => after.has(id) && facts(result.scenario) !== facts(after.get(id)!.scenario))) reasons.push('The recorded customer requests or payment facts differ.');
  const comparable = reasons.length === 0;
  const cases = [...new Set([...before.keys(), ...after.keys()])].map(scenarioId => {
    const a = before.get(scenarioId), b = after.get(scenarioId);
    const aChecks = new Map(a?.checks.map(check => [check.name, check]) || []);
    const bChecks = new Map(b?.checks.map(check => [check.name, check]) || []);
    const checks = [...new Set([...aChecks.keys(), ...bChecks.keys()])].filter(name => aChecks.get(name)?.status !== bChecks.get(name)?.status)
      .map(name => ({ name, before: aChecks.get(name), after: bChecks.get(name) }));
    let change: CaseChange;
    if (!a) change = 'added';
    else if (!b) change = 'removed';
    else if (!comparable) change = 'not-comparable';
    else if (a.verdict === 'pass' && b.verdict !== 'pass') change = 'regressed';
    else if (a.verdict === 'fail' && b.verdict === 'pass') change = 'fixed';
    else if (a.verdict === 'inconclusive' && b.verdict === 'pass') change = 'resolved';
    else if (a.verdict !== b.verdict) change = 'unresolved';
    else change = 'unchanged';
    return { scenarioId, before: a, after: b, change, checks };
  });
  return {
    comparable, reasons, cases,
    summary: {
      regressed: cases.filter(item => item.change === 'regressed').length,
      fixed: cases.filter(item => item.change === 'fixed').length,
      resolved: cases.filter(item => item.change === 'resolved').length,
      unresolved: candidate.results.filter(item => item.verdict !== 'pass').length,
      unchanged: cases.filter(item => item.change === 'unchanged').length,
    },
  };
}
