export interface ActiveOperation { id: string; kind: string; startedAt: string }
export interface OperationStatus {
  active: ActiveOperation | null;
  lastFinished: (ActiveOperation & { finishedAt: string; outcome: 'completed' | 'failed' }) | null;
}
