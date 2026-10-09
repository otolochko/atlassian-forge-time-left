import { describe, it, expect } from 'vitest';
import { formatCountdown, formatSpan, formatDateTime } from './format';

const MIN = 60e3;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

describe('formatCountdown', () => {
  it('uses days when 1 day or more is left', () => {
    expect(formatCountdown(2 * DAY + 5 * HOUR + 12 * MIN + 30e3)).toBe('2d 05h 12m');
  });
  it('uses seconds when less than a day is left', () => {
    expect(formatCountdown(5 * HOUR + 12 * MIN + 30e3)).toBe('05h 12m 30s');
    expect(formatCountdown(0)).toBe('00h 00m 00s');
  });
  it('prefixes overdue time with a minus', () => {
    expect(formatCountdown(-(HOUR + 15 * MIN))).toBe('-1h 15m');
    expect(formatCountdown(-(15 * MIN))).toBe('-15m');
    expect(formatCountdown(-(DAY + 2 * HOUR))).toBe('-1d 02h 00m');
  });
});

describe('formatSpan', () => {
  it('formats compact spans', () => {
    expect(formatSpan(HOUR + 40 * MIN)).toBe('1h 40m');
    expect(formatSpan(17 * HOUR + 5 * MIN)).toBe('17h 5m');
    expect(formatSpan(2 * DAY + 3 * HOUR + 10 * MIN)).toBe('2d 3h');
    expect(formatSpan(10e3)).toBe('<1m');
    expect(formatSpan(-(30 * MIN))).toBe('30m');
  });
});

describe('formatDateTime', () => {
  it('formats in the given timezone', () => {
    const ms = Date.UTC(2026, 9, 8, 15, 0);
    expect(formatDateTime(ms, { locale: 'en-US', timeZone: 'Europe/Copenhagen' })).toBe('Oct 8, 17:00');
  });
});
