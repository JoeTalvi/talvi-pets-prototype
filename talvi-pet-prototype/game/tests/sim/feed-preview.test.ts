import { spawnSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';
import { loadContent } from '../../src/content/load';
import type { SimEvent } from '../../src/sim/events';
import { reduce } from '../../src/sim/reduce';
import { initialState, type GameState } from '../../src/sim/state';
import { feedArgs, feedRows, runFeedPreview } from '../../tools/feed-preview';
import { deepFreeze, orientationDone } from './helpers';

const real = loadContent();
type Roundup = Extract<SimEvent, { type: 'roundup.fired' }>;

/** The game side: a fresh state, `debugSetSeed {1234}`, then the feed driven by `tick` alone. */
function gameRoundups(seed: number, max: number): Roundup[] {
  let state: GameState = orientationDone(initialState(real, 0));
  for (const action of [{ type: 'debugSetSeed', seed } as const, { type: 'debugSetEventInterval', ms: 250 } as const])
    state = reduce(real, state, action).state;
  const fired: Roundup[] = [];
  for (let ticks = 0; fired.length < max && ticks < max * 10; ticks++) {
    const result = reduce(real, state, { type: 'tick', dtMs: 50, move: { x: 0, y: 0 } });
    fired.push(...result.events.filter((event): event is Roundup => event.type === 'roundup.fired'));
    state = result.state;
  }
  return fired;
}

describe('TOOL-004 feed preview', () => {
  it('VERIFY-TOOL-004 rows equal the roundup.fired events of a reduced game after debugSetSeed {1234} (real content; the feed stops at the goal before 40)', () => {
    const { rows } = feedRows(deepFreeze(real), 1234, 40, 20000);
    const game = gameRoundups(1234, 40);
    expect(rows.length).toBe(game.length);
    expect(rows.length).toBeGreaterThan(0);
    rows.forEach((row, index) => expect({ merchantId: row.merchantId, amountCents: row.amountCents, changeCents: row.changeCents,
      currentCents: row.currentCents }).toEqual({ merchantId: game[index].merchantId, amountCents: game[index].amountCents,
      changeCents: game[index].changeCents, currentCents: game[index].currentCents }));
  });

  it('VERIFY-TOOL-004 goalCents 1500 flags → phase 1 at the first row whose total ≥ 300', () => {
    const { rows } = feedRows(real, 1234, 40, 20000);
    const first = rows.find(row => row.currentCents >= 300)!;
    expect(real.projects.find(project => project.id === first.projectId)!.goalCents).toBe(1500);
    expect(first.reached).toBe(1);
    expect(rows.filter(row => row.index < first.index).every(row => row.reached === null)).toBe(true);
    expect(runFeedPreview(real, feedArgs(['--seed', '1234'])).lines.find(line => line.includes('→ phase 1'))).toMatch(/^\s+\d+ /);
  });

  it('VERIFY-TOOL-004 reruns are identical, --seeds prints one summary line per seed, JSON is plain', () => {
    const options = feedArgs(['--seed', '1234', '--count', '40']);
    expect(runFeedPreview(real, options).lines).toEqual(runFeedPreview(real, options).lines);
    const seeds = runFeedPreview(real, feedArgs(['--seeds', '1,2,3'])).lines;
    expect(seeds).toHaveLength(3);
    expect(seeds.every(line => line.startsWith('summary  seed '))).toBe(true);
    const json = runFeedPreview(real, feedArgs(['--seed', '6', '--format', 'json'])).lines[0];
    expect(JSON.parse(json).rows[0].index).toBe(1);
    expect(runFeedPreview(real, feedArgs(['--seed', '6', '--format', 'csv'])).lines[0]).toMatch(/^index,t,merchantId/);
  });

  it('VERIFY-TOOL-004 CLI exits 0 on a run and 3 on an unknown flag', () => {
    const cli = (args: string[]) => spawnSync(process.execPath, ['node_modules/tsx/dist/cli.mjs', 'tools/feed-preview.ts', ...args], { encoding: 'utf8' });
    const ok = cli(['--seed', '1234', '--count', '5']);
    expect(ok.status).toBe(0);
    expect(ok.stdout.trim().split('\n').at(-1)).toMatch(/^summary  seed 1234  rows 5/);
    expect(cli(['--bogus']).status).toBe(3);
  }, 30000);
});
