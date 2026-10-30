import type { AppState } from './types.ts';

export const MAX_ACTIVE_SCENARIOS = 60;

export function isScenarioArchived(state: Pick<AppState, 'archivedScenarioIds'>, scenarioId: string): boolean {
  return state.archivedScenarioIds?.includes(scenarioId) ?? false;
}

export function activeScenarios(state: Pick<AppState, 'scenarios' | 'archivedScenarioIds'>) {
  return state.scenarios.filter(scenario => !isScenarioArchived(state, scenario.id));
}
