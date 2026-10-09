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
 * Builds a status timeline from changelog histories.
 * @returns {Array<{ statusId: string, from: number, to: number | null }>}
 */
export function buildStatusTimeline(createdAt, currentStatusId, histories) {
  const changes = histories
    .flatMap((h) =>
      h.items
        .filter((i) => i.fieldId === 'status' || i.field === 'status')
        .map((i) => ({ at: parseJiraDate(h.created), fromId: i.from, toId: i.to }))
    )
    .sort((a, b) => a.at - b.at);

  const timeline = [];
  let cursor = createdAt;
  let status = changes.length ? changes[0].fromId : currentStatusId;
  for (const c of changes) {
    timeline.push({ statusId: status, from: cursor, to: c.at });
    cursor = c.at;
    status = c.toId;
  }
  timeline.push({ statusId: status, from: cursor, to: null });
  return timeline;
}

/** Total time spent in pause statuses within [windowStart, windowEnd] */
export function pausedWithin(timeline, pauseStatusIds, windowStart, windowEnd) {
  const pause = new Set(pauseStatusIds);
  let total = 0;
  for (const seg of timeline) {
    if (!pause.has(seg.statusId)) continue;
    const a = Math.max(seg.from, windowStart);
    const b = Math.min(seg.to ?? windowEnd, windowEnd);
    if (b > a) total += b - a;
  }
  return total;
}

/**
 * SLA-like clock. Pauses extend the effective deadline,
 * so the remaining time is frozen while the issue sits in a pause status.
 */
export function computeClock({
  start,
  deadline,
  now,
  timeline,
  pauseStatusIds = [],
  completedAt = null,
  warning = null,
}) {
  if (deadline == null) return { state: 'no-deadline' };

  const end = completedAt ?? now;
  // No start: every pause since creation counts, and there is no total to measure progress against
  const hasStart = start != null;
  const paused = pausedWithin(timeline, pauseStatusIds, hasStart ? start : -Infinity, end);
  const goal = hasStart ? Math.max(0, deadline - start) : null;
  const remaining = deadline + paused - end;
  const isPaused = !completedAt && pauseStatusIds.includes(timeline[timeline.length - 1].statusId);
  const elapsedFraction = !hasStart ? null : goal > 0 ? Math.min(1, Math.max(0, 1 - remaining / goal)) : 1;

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
    paused,
    isPaused,
    elapsedFraction,
    effectiveDeadline: deadline + paused,
  };
}

function isWarning(remaining, goal, warning) {
  if (!warning) return false;
  if (warning.type === 'percent') return goal != null && remaining < (goal * warning.value) / 100;
  return remaining < warning.value * HOUR;
}
