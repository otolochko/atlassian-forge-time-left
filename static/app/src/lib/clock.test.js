import { describe, it, expect } from 'vitest';
import {
  parseJiraDate,
  resolveDateField,
  buildStatusTimeline,
  computeClock,
} from './clock';

const H = 3600e3;
const T0 = Date.UTC(2026, 9, 1, 0, 0, 0); // issue start
const single = (statusId = 'open') => [{ statusId, from: T0, to: null }];
const warning4h = { type: 'hours', value: 4 };

describe('computeClock', () => {
  it('1. no deadline gives no-deadline', () => {
    expect(computeClock({ start: T0, deadline: null, now: T0, timeline: single() }).state).toBe(
      'no-deadline'
    );
  });

  it('2. on track, due soon by hours, due soon by percent', () => {
    const deadline = T0 + 100 * H;
    const base = { start: T0, deadline, timeline: single(), warning: warning4h };
    expect(computeClock({ ...base, now: T0 + 10 * H }).state).toBe('on-track');
    expect(computeClock({ ...base, now: deadline - 2 * H }).state).toBe('warning');
    const pct = { ...base, warning: { type: 'percent', value: 10 } };
    expect(computeClock({ ...pct, now: T0 + 80 * H }).state).toBe('on-track'); // 20% left
    expect(computeClock({ ...pct, now: T0 + 95 * H }).state).toBe('warning'); // 5% left
  });

  it('3. breached when remaining is negative', () => {
    const r = computeClock({ start: T0, deadline: T0 + H, now: T0 + 3 * H, timeline: single() });
    expect(r.state).toBe('breached');
    expect(r.remaining).toBe(-2 * H);
  });

  it('4. currently paused: remaining stays the same', () => {
    const timeline = [
      { statusId: 'open', from: T0, to: T0 + 2 * H },
      { statusId: 'wait', from: T0 + 2 * H, to: null },
    ];
    const args = { start: T0, deadline: T0 + 10 * H, timeline, pauseStatusIds: ['wait'] };
    const a = computeClock({ ...args, now: T0 + 3 * H });
    const b = computeClock({ ...args, now: T0 + 7 * H });
    expect(a.state).toBe('paused');
    expect(a.isPaused).toBe(true);
    expect(a.remaining).toBe(8 * H);
    expect(b.remaining).toBe(a.remaining);
  });

  it('5. multiple pauses are summed', () => {
    const timeline = [
      { statusId: 'open', from: T0, to: T0 + H },
      { statusId: 'wait', from: T0 + H, to: T0 + 3 * H }, // 2h
      { statusId: 'open', from: T0 + 3 * H, to: T0 + 4 * H },
      { statusId: 'wait', from: T0 + 4 * H, to: T0 + 5 * H }, // 1h
      { statusId: 'open', from: T0 + 5 * H, to: null },
    ];
    const r = computeClock({
      start: T0,
      deadline: T0 + 10 * H,
      now: T0 + 6 * H,
      timeline,
      pauseStatusIds: ['wait'],
    });
    expect(r.paused).toBe(3 * H);
    expect(r.effectiveDeadline).toBe(T0 + 13 * H);
    expect(r.remaining).toBe(7 * H);
  });

  it('6. pauses before start are ignored (custom start field)', () => {
    const start = T0 + 5 * H;
    const timeline = [
      { statusId: 'wait', from: T0, to: T0 + 7 * H }, // 2h of it is after start
      { statusId: 'open', from: T0 + 7 * H, to: null },
    ];
    const r = computeClock({
      start,
      deadline: start + 10 * H,
      now: start + 8 * H,
      timeline,
      pauseStatusIds: ['wait'],
    });
    expect(r.paused).toBe(2 * H);
    const before = computeClock({
      start: T0 + 8 * H,
      deadline: T0 + 20 * H,
      now: T0 + 9 * H,
      timeline,
      pauseStatusIds: ['wait'],
    });
    expect(before.paused).toBe(0);
  });

  it('7. met, missed, and pauses after completion are ignored', () => {
    const deadline = T0 + 10 * H;
    const met = computeClock({
      start: T0,
      deadline,
      now: T0 + 50 * H,
      timeline: single(),
      completedAt: T0 + 8 * H,
    });
    expect(met.state).toBe('met');
    expect(met.remaining).toBe(2 * H);

    const missed = computeClock({
      start: T0,
      deadline,
      now: T0 + 50 * H,
      timeline: single(),
      completedAt: T0 + 12 * H,
    });
    expect(missed.state).toBe('missed');
    expect(missed.remaining).toBe(-2 * H);

    const timeline = [
      { statusId: 'open', from: T0, to: T0 + 9 * H },
      { statusId: 'wait', from: T0 + 9 * H, to: null }, // after completion
    ];
    const after = computeClock({
      start: T0,
      deadline,
      now: T0 + 50 * H,
      timeline,
      pauseStatusIds: ['wait'],
      completedAt: T0 + 9 * H,
    });
    expect(after.paused).toBe(0);
    expect(after.isPaused).toBe(false);
    expect(after.state).toBe('met');
  });

  it('8. deadline before start: no crash, elapsedFraction = 1', () => {
    const r = computeClock({ start: T0, deadline: T0 - H, now: T0, timeline: single() });
    expect(r.goal).toBe(0);
    expect(r.elapsedFraction).toBe(1);
  });

  it('9. no status changes gives a single-segment timeline', () => {
    const timeline = buildStatusTimeline(T0, 'open', []);
    expect(timeline).toEqual([{ statusId: 'open', from: T0, to: null }]);
    const r = computeClock({ start: T0, deadline: T0 + 5 * H, now: T0 + H, timeline });
    expect(r.state).toBe('on-track');
  });

  it('breached wins over paused', () => {
    const timeline = [
      { statusId: 'open', from: T0, to: T0 + 2 * H },
      { statusId: 'wait', from: T0 + 2 * H, to: null },
    ];
    const r = computeClock({
      start: T0,
      deadline: T0 + H,
      now: T0 + 5 * H,
      timeline,
      pauseStatusIds: ['wait'],
    });
    expect(r.state).toBe('breached');
    expect(r.isPaused).toBe(true);
  });
});

describe('buildStatusTimeline', () => {
  it('builds segments from unordered histories and ignores other fields', () => {
    const histories = [
      {
        created: '2026-10-01T05:00:00.000+0000',
        items: [{ fieldId: 'status', from: '2', to: '3' }],
      },
      {
        created: '2026-10-01T03:00:00.000+0000',
        items: [
          { fieldId: 'status', from: '1', to: '2' },
          { fieldId: 'priority', from: 'a', to: 'b' },
        ],
      },
    ];
    const created = Date.UTC(2026, 9, 1, 1);
    const tl = buildStatusTimeline(created, '3', histories);
    expect(tl.map((s) => s.statusId)).toEqual(['1', '2', '3']);
    expect(tl[0].from).toBe(created);
    expect(tl[0].to).toBe(Date.UTC(2026, 9, 1, 3));
    expect(tl[2].to).toBeNull();
  });
});

describe('parseJiraDate', () => {
  it('10. handles +0200, -0500, Z and null', () => {
    expect(parseJiraDate('2026-10-01T09:00:00.000+0200')).toBe(Date.UTC(2026, 9, 1, 7));
    expect(parseJiraDate('2026-10-01T09:00:00.000-0500')).toBe(Date.UTC(2026, 9, 1, 14));
    expect(parseJiraDate('2026-10-01T09:00:00.000Z')).toBe(Date.UTC(2026, 9, 1, 9));
    expect(parseJiraDate(null)).toBeNull();
  });
});

describe('resolveDateField', () => {
  it('11. date-only means end of day in the timezone, across DST', () => {
    // Europe/Copenhagen: CEST (+02:00) until 2026-10-25, CET (+01:00) after
    expect(resolveDateField('2026-10-24', 'date', 'Europe/Copenhagen')).toBe(
      Date.UTC(2026, 9, 24, 21, 59, 59, 999)
    );
    expect(resolveDateField('2026-10-25', 'date', 'Europe/Copenhagen')).toBe(
      Date.UTC(2026, 9, 25, 22, 59, 59, 999)
    );
  });

  it('datetime values are parsed as Jira timestamps; empty gives null', () => {
    expect(resolveDateField('2026-10-01T09:00:00.000+0200', 'datetime', 'UTC')).toBe(
      Date.UTC(2026, 9, 1, 7)
    );
    expect(resolveDateField(null, 'date', 'UTC')).toBeNull();
  });

  it('9. no start: counts all pauses, no progress, percent never warns', () => {
    const timeline = [
      { statusId: 'wait', from: T0 - 2 * H, to: T0 },
      { statusId: 'open', from: T0, to: null },
    ];
    const r = computeClock({
      start: null,
      deadline: T0 + 10 * H,
      now: T0 + H,
      timeline,
      pauseStatusIds: ['wait'],
      warning: { type: 'percent', value: 99 },
    });
    expect(r.paused).toBe(2 * H);
    expect(r.goal).toBeNull();
    expect(r.elapsedFraction).toBeNull();
    expect(r.state).toBe('on-track');
  });
});
