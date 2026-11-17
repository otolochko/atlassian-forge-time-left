// Pure functions, no I/O. All times are epoch ms.
import { fromZonedTime } from 'date-fns-tz';

const HOUR = 3600e3;

/** Jira timestamps look like "2026-10-01T09:00:00.000+0200"; add the colon so every browser parses them */
export function parseJiraDate(s) {
  return s ? new Date(s.replace(/([+-]\d{2})(\d{2})$/, '$1:$2')).getTime() : null;
}

/**
 * Resolves a Jira field value to epoch ms.
 * Date-only values ("2026-10-08") mean the end of that day (23:59:59.999) in the given timezone.
 */
export function resolveDateField(value, type, timeZone) {
  if (!value) return null;
  if (type === 'date') return fromZonedTime(`${value}T23:59:59.999`, timeZone).getTime();
  return parseJiraDate(value);
}

/**
 * Countdown to a fixed deadline. The deadline comes from another system, so pause statuses
 * never move it: they only mark the issue as paused while it sits in one.
 */
export function computeClock({
  start,
  deadline,
  now,
  statusId,
  pauseStatusIds = [],
  completedAt = null,
  warning = null,
}) {
  if (deadline == null) return { state: 'no-deadline' };

  const end = completedAt ?? now;
  // No start: there is no total to measure progress against
  const goal = start != null ? Math.max(0, deadline - start) : null;
  const remaining = deadline - end;
  const isPaused = !completedAt && pauseStatusIds.includes(statusId);
  const elapsedFraction = start == null ? null : goal > 0 ? Math.min(1, Math.max(0, 1 - remaining / goal)) : 1;

  let state;
  if (completedAt) state = remaining >= 0 ? 'met' : 'missed';
  else if (remaining < 0) state = 'breached';
  else if (isPaused) state = 'paused';
  else if (isWarning(remaining, goal, warning)) state = 'warning';
  else state = 'on-track';

  return {
    state,
    remaining,
    goal,
    isPaused,
    elapsedFraction,
  };
}

function isWarning(remaining, goal, warning) {
  if (!warning) return false;
  if (warning.type === 'percent') return goal != null && remaining < (goal * warning.value) / 100;
  return remaining < warning.value * HOUR;
}
