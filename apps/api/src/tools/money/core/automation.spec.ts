import { dueTasks, type SchedulerState } from './automation';

const state = (s: Partial<SchedulerState>): SchedulerState => ({
  today: '2026-10-28',
  minutes: 12 * 60,
  lastRun: { recurring: '2026-10-28', rates: '2026-10-27', prices: '2026-10-27', snapshot: '2026-10-01' },
  snapshots: ['2026-09-30'],
  hasPriceFeeds: true,
  ...s,
});
const tasks = (s: Partial<SchedulerState>) => dueTasks(state(s)).map((t) => t.task);

describe('the daily money schedule', () => {
  it('runs each task once a day after its hour', () => {
    expect(tasks({})).toEqual([]);
    expect(tasks({ minutes: 17 * 60 + 15 })).toEqual(['rates']);
    expect(tasks({ minutes: 19 * 60 })).toEqual(['rates', 'prices']);
    expect(tasks({ minutes: 19 * 60, lastRun: { recurring: '2026-10-28', rates: '2026-10-28', prices: '2026-10-28' } })).toEqual([]);
    expect(tasks({ minutes: 19 * 60, hasPriceFeeds: false })).toEqual(['rates']);
  });

  it('catches up at once after a day or more without a run', () => {
    expect(tasks({ minutes: 60, lastRun: { recurring: '2026-10-25', rates: '2026-10-25', prices: '2026-10-27' } })).toEqual(['recurring', 'rates']);
    expect(tasks({ minutes: 60, lastRun: {} })).toEqual(['recurring', 'rates', 'prices']);
  });

  it('takes the quarter-end snapshot on the days after, once', () => {
    const october = dueTasks(state({ today: '2026-10-01', minutes: 7 * 60, lastRun: { recurring: '2026-10-01', rates: '2026-09-30', prices: '2026-09-30' }, snapshots: [] }));
    expect(october.find((t) => t.task === 'snapshot')?.payload).toEqual({ date: '2026-09-30', label: 'Q3 2026' });
    expect(tasks({ today: '2026-10-10', minutes: 7 * 60, snapshots: ['2026-09-30'] })).not.toContain('snapshot');
    expect(tasks({ today: '2026-10-20', minutes: 7 * 60, snapshots: [] })).not.toContain('snapshot');
  });
});
