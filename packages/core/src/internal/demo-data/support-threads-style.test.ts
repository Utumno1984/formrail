// @vitest-environment node
// Three style notes on the demo support threads (ticket #561, follow-up of #514), checked on 50,000
// cases from the texts alone. Each probe also counts what it looks at, so it cannot pass vacuously.
import { daysBetween, DEMO_TODAY } from './dates';
import { getSupportCase, makeSupportCases } from './index';

const SAMPLE = 50_000;
const threads = makeSupportCases(SAMPLE)
  .map((supportCase) => getSupportCase(supportCase.id)!)
  .filter((thread) => thread.comments.length > 0);
const daysAgoOf = (postedAt: string): number => daysBetween(postedAt.slice(0, 10), DEMO_TODAY);

describe('support threads: style notes of #561 (50,000 cases)', () => {
  it('"that is what I needed to go ahead" never meets a "Shall I go ahead?" in the same thread', () => {
    const problems: string[] = [];
    let proposals = 0;
    let thanks = 0;
    for (const thread of threads) {
      const texts = thread.comments.map((comment) => comment.text);
      if (texts.some((text) => text.includes('Shall I go ahead?'))) proposals++;
      if (texts.some((text) => text.includes('that is exactly the information I needed'))) thanks++;
      if (texts.some((text) => text.includes('what I needed to go ahead')) && texts.some((text) => text.includes('Shall I go ahead?'))) problems.push(thread.id);
    }
    expect(problems).toEqual([]);
    expect(proposals).toBeGreaterThan(1000);
    // The reworded thanks is still common: the fix did not just remove the sentence.
    expect(thanks).toBeGreaterThan(1000);
  });

  it('no message says it is preparing the quotation before the quantity is asked', () => {
    const problems: string[] = [];
    let quantityQuestions = 0;
    for (const thread of threads) {
      let asked = false;
      for (const comment of thread.comments) {
        if (comment.authorKind !== 'employee') continue;
        if (/quantity/.test(comment.text) && comment.text.includes('?')) {
          asked = true;
          quantityQuestions++;
        }
        if (/preparing the quotation/.test(comment.text) && !asked) problems.push(`${comment.id}: "${comment.text}"`);
      }
    }
    expect(problems).toEqual([]);
    expect(quantityQuestions).toBeGreaterThan(1000);
  });

  it('an employee reply posted 7 days or more after the message before it apologises; no other one does', () => {
    const problems: string[] = [];
    let late = 0;
    let onTime = 0;
    for (const thread of threads) {
      thread.comments.forEach((comment, k) => {
        if (comment.authorKind !== 'employee' || k === 0) return;
        const wait = daysAgoOf(thread.comments[k - 1]!.postedAt) - daysAgoOf(comment.postedAt);
        const apologises = /apologise/.test(comment.text);
        if (wait >= 7) {
          late++;
          if (!apologises) problems.push(`${comment.id}: ${wait} days, "${comment.text}"`);
          // The question of a message stays its last sentence.
          if (comment.text.includes('?') && !comment.text.endsWith('?')) problems.push(`${comment.id}: "${comment.text}"`);
        } else {
          onTime++;
          if (apologises) problems.push(`${comment.id}: ${wait} days but apologises`);
        }
      });
    }
    expect(problems).toEqual([]);
    expect(late).toBeGreaterThan(50);
    expect(onTime).toBeGreaterThan(10_000);
  });
});
