import type { AppState, Fixture, Scenario } from './types.ts';
import { isScenarioArchived } from './scenario-library.ts';

/** Only facts used by the agent or payment harness bind a fixture to a scenario. */
export function fixtureMatchesScenario(fixture: Fixture, scenario: Scenario): boolean {
  return fixture.scenarioId === scenario.id &&
    (['id', 'message', 'capturedCents', 'priorRefundCents', 'requestedCents', 'supervisorApproved', 'fault'] as const)
      .every(field => fixture.scenario[field] === scenario[field]);
}

export function fixtureScenarioReady(state: Pick<AppState, 'scenarios' | 'archivedScenarioIds'>, fixture: Fixture): boolean {
  return !fixture.setAsideAt && !isScenarioArchived(state, fixture.scenarioId) &&
    state.scenarios.some(scenario => scenario.approved && fixtureMatchesScenario(fixture, scenario));
}
