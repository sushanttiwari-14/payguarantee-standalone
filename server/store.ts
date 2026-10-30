import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import type { AppState } from '../shared/types.ts';
import { defaultPolicy, curatedScenarios } from '../shared/fixtures.ts';

const defaultFile = fileURLToPath(new URL('../.payproof/state.json', import.meta.url));
export class Store {
  private state?: AppState;
  private queue: Promise<unknown> = Promise.resolve();
  constructor(private file = defaultFile) {}
  async read(): Promise<AppState> {
    if (!this.state) {
      try { this.state = JSON.parse(await readFile(this.file, 'utf8')); }
      catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw new Error('Saved state could not be read. Preserve .payproof/state.json and repair it before continuing.');
        this.state = { policy: structuredClone(defaultPolicy), scenarios: structuredClone(curatedScenarios), runs: [], fixtures: [] };
      }
    }
    return structuredClone(this.state!);
  }
  async update<T>(mutate: (state: AppState) => T | Promise<T>): Promise<T> {
    const task = this.queue.then(async () => {
      const next = await this.read();
      const result = await mutate(next);
      await mkdir(path.dirname(this.file), { recursive: true });
      const temporary = `${this.file}.${randomUUID()}.tmp`;
      await writeFile(temporary, JSON.stringify(next, null, 2), { mode: 0o600 });
      await rename(temporary, this.file);
      this.state = next;
      return structuredClone(result);
    });
    this.queue = task.catch(() => undefined);
    return task;
  }
}
