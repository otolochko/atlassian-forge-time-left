import { describe, it, expect } from 'vitest';
import {
  parseJiraDate,
  resolveDateField,
  computeClock,
} from './clock';

const H = 3600e3;
const T0 = Date.UTC(2026, 9, 1, 0, 0, 0); // issue start
const warning4h = { type: 'hours', value: 4 };

describe('computeClock', () => {
  it('1. no deadline gives no-deadline', () => {
    expect(computeClock({ start: T0, deadline: null, now: T0, statusId: 'open' }).state).toBe(
      'no-deadline'
    );
  });

  it('2. on track, due soon by hours, due soon by percent', () => {
    const deadline = T0 + 100 * H;
    const base = { start: T0, deadline, statusId: 'open', warning: warning4h };
    expect(computeClock({ ...base, now: T0 + 10 * H }).state).toBe('on-track');
    expect(computeClock({ ...base, now: deadline - 2 * H }).state).toBe('warning');
    const pct = { ...base, warning: { type: 'percent', value: 10 } };
    expect(computeClock({ ...pct, now: T0 + 80 * H }).state).toBe('on-track'); // 20% left
    expect(computeClock({ ...pct, now: T0 + 95 * H }).state).toBe('warning'); // 5% left
  });

  it('3. breached when remaining is negative', () => {
    const r = computeClock({ start: T0, deadline: T0 + H, now: T0 + 3 * H, statusId: 'open' });
    expect(r.state).toBe('breached');
    expect(r.remaining).toBe(-2 * H);
  });

  it('4. paused only labels the issue: the deadline and the countdown are unchanged', () => {
    const args = { start: T0, deadline: T0 + 10 * H, statusId: 'wait', pauseStatusIds: ['wait'] };
    const a = computeClock({ ...args, now: T0 + 3 * H });
    const b = computeClock({ ...args, now: T0 + 7 * H });
    expect(a.state).toBe('paused');
    expect(a.isPaused).toBe(true);
    expect(a.remaining).toBe(7 * H);
    expect(b.remaining).toBe(3 * H);
  });

  it('7. met, missed, and pauses after completion are ignored', () => {
    const deadline = T0 + 10 * H;
    const met = computeClock({
      start: T0,
      deadline,
      now: T0 + 50 * H,
      statusId: 'open',
      completedAt: T0 + 8 * H,
    });
    expect(met.state).toBe('met');
    expect(met.remaining).toBe(2 * H);

    const missed = computeClock({
      start: T0,
      deadline,
      now: T0 + 50 * H,
      statusId: 'open',
      completedAt: T0 + 12 * H,
    });
    expect(missed.state).toBe('missed');
    expect(missed.remaining).toBe(-2 * H);

    const after = computeClock({
      start: T0,
      deadline,
      now: T0 + 50 * H,
      statusId: 'wait',
      pauseStatusIds: ['wait'],
      completedAt: T0 + 9 * H,
    });
    expect(after.isPaused).toBe(false);
    expect(after.state).toBe('met');
  });

  it('8. deadline before start: no crash, elapsedFraction = 1', () => {
    const r = computeClock({ start: T0, deadline: T0 - H, now: T0, statusId: 'open' });
    expect(r.goal).toBe(0);
    expect(r.elapsedFraction).toBe(1);
  });

  it('breached wins over paused', () => {
    const r = computeClock({
      start: T0,
      deadline: T0 + H,
      now: T0 + 5 * H,
      statusId: 'wait',
      pauseStatusIds: ['wait'],
    });
    expect(r.state).toBe('breached');
    expect(r.isPaused).toBe(true);
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

  it('a datetime without an offset is read in the given zone, not the browser zone', () => {
    // Europe/Kyiv: EEST (+03:00) in August, EET (+02:00) in November
    expect(resolveDateField('2026-08-21 13:59:22', 'datetime', 'UTC', 'Europe/Kyiv')).toBe(
      Date.UTC(2026, 7, 21, 10, 59, 22)
    );
    expect(resolveDateField('2026-11-23 12:00:00', 'datetime', 'UTC', 'Europe/Kyiv')).toBe(
      Date.UTC(2026, 10, 23, 10, 0, 0)
    );
    // Without a separate zone it falls back to the user's zone
    expect(resolveDateField('2026-11-23T12:00:00', 'datetime', 'Europe/Kyiv')).toBe(
      Date.UTC(2026, 10, 23, 10, 0, 0)
    );
    // An explicit offset wins over the zone
    expect(resolveDateField('2026-11-23T12:00:00.000+0300', 'datetime', 'UTC', 'Europe/Kyiv')).toBe(
      Date.UTC(2026, 10, 23, 9, 0, 0)
    );
  });

  it('a fixed UTC+2 zone ignores daylight saving all year', () => {
    expect(resolveDateField('2026-08-21 13:59:22', 'datetime', 'UTC', 'Etc/GMT-2')).toBe(Date.UTC(2026, 7, 21, 11, 59, 22));
    expect(resolveDateField('2026-11-23 12:00:00', 'datetime', 'UTC', 'Etc/GMT-2')).toBe(Date.UTC(2026, 10, 23, 10, 0, 0));
  });

  it('unreadable text gives null', () => {
    expect(resolveDateField('soon', 'datetime', 'UTC')).toBeNull();
    expect(resolveDateField('2026-13-45 99:99:99', 'datetime', 'UTC', 'Europe/Kyiv')).toBeNull();
  });

  it('datetime values are parsed as Jira timestamps; empty gives null', () => {
    expect(resolveDateField('2026-10-01T09:00:00.000+0200', 'datetime', 'UTC')).toBe(
      Date.UTC(2026, 9, 1, 7)
    );
    expect(resolveDateField(null, 'date', 'UTC')).toBeNull();
  });

  it('no start: no progress, percent never warns', () => {
    const r = computeClock({
      start: null,
      deadline: T0 + 10 * H,
      now: T0 + H,
      statusId: 'open',
      warning: { type: 'percent', value: 99 },
    });
    expect(r.goal).toBeNull();
    expect(r.elapsedFraction).toBeNull();
    expect(r.state).toBe('on-track');
  });
});
