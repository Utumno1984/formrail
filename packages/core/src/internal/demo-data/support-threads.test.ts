// @vitest-environment node
// The plan of a support thread (ticket #514): every status, every number of employee messages a thread
// can have, and the fewest days a thread can spread over, on many seeds. The planner must never run out
// of moves, and the plan must keep the order of a conversation.
import { createRowRng, hashSeed } from './rng';
import { planMoves, type DemoSupportCaseStatus, type EmployeeMove } from './support-cases';

/** Employee messages a thread can have, by status (half of `commentCount`, see `COMMENT_RANGE`). */
const EMPLOYEES: readonly (readonly [DemoSupportCaseStatus, readonly number[]])[] = [
  ['new', [0]],
  ['open', [0, 1, 2]],
  ['pending', [1, 2, 3]],
  ['resolved', [1, 2, 3, 4]],
  ['closed', [1, 2, 3, 4]],
];
const SEEDS = 3000;
const SEED = hashSeed('test/support-threads');

describe('planMoves', () => {
  it.each(EMPLOYEES)('%s: never runs out of moves, keeps the order of a conversation and the reminders within the days', (status, counts) => {
    const problems: string[] = [];
    let plans = 0;
    for (const employees of counts) {
      for (const maxChases of [1, 2, 3]) {
        for (let seed = 0; seed < SEEDS; seed++) {
          const label = `${status}, ${employees} employee messages, ${maxChases} reminder days, seed ${seed}`;
          let moves: EmployeeMove[];
          try {
            moves = planMoves(createRowRng(SEED, seed), status, employees, maxChases);
          } catch (error) {
            problems.push(`${label}: ${String(error)}`);
            continue;
          }
          plans++;
          if (moves.length !== employees) problems.push(`${label}: ${moves.length} moves`);
          const endsWithEmployee = status === 'pending' || status === 'resolved' || status === 'closed';
          const free = endsWithEmployee ? moves.slice(0, -1) : moves;
          const last = moves[moves.length - 1];
          // A move that asks nothing is followed by a reminder, each on a new day.
          const reminders = free.filter((move) => move === 'ack' || move === 'progress').length;
          if (reminders > maxChases) problems.push(`${label}: ${reminders} reminders`);
          if (moves.filter((move) => move === 'ask').length > 1 || moves.filter((move) => move === 'propose').length > 1) problems.push(`${label}: ${moves.join(' ')}`);
          if (moves.includes('ask') && moves.includes('propose') && moves.indexOf('ask') > moves.indexOf('propose')) problems.push(`${label}: asks after proposing`);
          if (moves.indexOf('ack') > 0 || (moves.length > 0 && moves[0] === 'progress')) problems.push(`${label}: ${moves.join(' ')}`);
          if (free.includes('resolve')) problems.push(`${label}: resolves before the end`);
          if (status === 'pending' && last !== 'ask' && last !== 'propose') problems.push(`${label}: pending ends with ${last}`);
          if ((status === 'resolved' || status === 'closed') && last !== 'resolve') problems.push(`${label}: ${status} ends with ${last}`);
        }
      }
    }
    expect(problems.slice(0, 10)).toEqual([]);
    expect(plans).toBe(counts.length * 3 * SEEDS);
  });

  it('uses every kind of move where the status allows it', () => {
    const seen = new Set<string>();
    for (let seed = 0; seed < 500; seed++) {
      for (const move of planMoves(createRowRng(SEED, seed), 'resolved', 4, 1)) seen.add(move);
    }
    expect([...seen].sort()).toEqual(['ack', 'ask', 'progress', 'propose', 'resolve']);
  });
});
