import React, { useEffect, useState } from 'react';
import { events } from '@forge/bridge';
import Lozenge from '@atlaskit/lozenge';
import SectionMessage from '@atlaskit/section-message';
import { buildStatusTimeline, computeClock, parseJiraDate, resolveDateField } from '../lib/clock';
import { NO_START, readConfig } from '../lib/config';
import { formatCountdown, formatDateTime, formatSpan } from '../lib/format';
import { jiraGet } from '../lib/jira';
import { useTicker } from './useTicker';

const DAY = 24 * 3600e3;
const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

// `title` names the number above it; `tone` colors the countdown and progress bar; `appearance` is the Atlaskit Lozenge color
const BADGES = {
  'on-track': { title: 'Time remaining', label: 'On track', tone: 'success', appearance: 'success' },
  warning: { title: 'Time remaining', label: 'Due soon', tone: 'warning', appearance: 'moved' },
  paused: { title: 'Time remaining', label: 'Paused', tone: 'neutral', appearance: 'default' },
  breached: { title: 'Overdue', label: 'Breached', tone: 'danger', appearance: 'removed' },
  met: { title: 'Left at completion', label: 'Met', tone: 'success', appearance: 'success' },
  missed: { title: 'Late at completion', label: 'Missed', tone: 'danger', appearance: 'removed' },
  'no-deadline': { title: 'Time remaining', label: 'No deadline', tone: 'neutral', appearance: 'default' },
};

class PanelError extends Error {}

async function loadChangelog(key) {
  const histories = [];
  for (let startAt = 0; ; ) {
    const page = await jiraGet(`/rest/api/3/issue/${key}/changelog?startAt=${startAt}&maxResults=100`);
    histories.push(...page.values);
    if (page.isLast || page.values.length === 0) return histories;
    startAt += page.values.length;
  }
}

async function load(context) {
  const { issue, project } = context.extension;
  const config = await readConfig(project.id);
  if (!config || !config.enabled) return { config: null };

  const fieldIds = [config.deadlineFieldId, config.startFieldId].filter((id) => id && id !== NO_START);
  const fields = ['status', 'created', 'resolutiondate', 'statuscategorychangedate', ...fieldIds];
  const data = await jiraGet(`/rest/api/3/issue/${issue.key}?fields=${fields.join(',')}&expand=names`);
  if (!(config.deadlineFieldId in data.fields)) throw new PanelError('field-missing');

  const f = data.fields;
  const tz = context.timezone;
  // Date-only values (e.g. Due date) look like "2026-10-08"; datetime values carry a time
  const resolve = (id) =>
    f[id] ? resolveDateField(f[id], DATE_ONLY.test(f[id]) ? 'date' : 'datetime', tz) : null;

  const created = parseJiraDate(f.created);
  const start = config.startFieldId === NO_START ? null : (config.startFieldId && resolve(config.startFieldId)) ?? created;
  const histories = config.pauseStatusIds.length ? await loadChangelog(issue.key) : [];
  const timeline = buildStatusTimeline(created, f.status.id, histories);
  const done = f.status.statusCategory?.key === 'done';

  return {
    config,
    deadline: resolve(config.deadlineFieldId),
    deadlineFieldName: data.names?.[config.deadlineFieldId] ?? config.deadlineFieldId,
    start,
    timeline,
    statusName: f.status.name,
    completedAt: done ? parseJiraDate(f.resolutiondate) ?? parseJiraDate(f.statuscategorychangedate) : null,
  };
}

const MINUTE = 60e3;

// One short line under the timer; the lozenge already names the state
function subline(d, clock, fmt) {
  switch (clock.state) {
    case 'no-deadline':
      return null;
    case 'paused':
      return `Paused in "${d.statusName}"`;
    case 'met':
      return `Done ${fmt(d.completedAt)} · ${formatSpan(clock.remaining)} to spare`;
    case 'missed':
      return `Done ${fmt(d.completedAt)} · ${formatSpan(clock.remaining)} late`;
    case 'breached':
      return `Was due ${fmt(clock.effectiveDeadline)}`;
    default:
      return `Due ${fmt(clock.effectiveDeadline)}${clock.paused >= MINUTE ? ` · ${formatSpan(clock.paused)} paused` : ''}`;
  }
}

// Full details live in the tooltip
function tooltip(d, clock, fmt) {
  const parts = [`From "${d.deadlineFieldName}"`, `deadline ${fmt(d.deadline)}`];
  if (clock.paused > 0) parts.push(`effective ${fmt(clock.effectiveDeadline)}`, `paused ${formatSpan(clock.paused)}`);
  return parts.join(' · ');
}

export default function DeadlinePanel({ context }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    let active = true;
    let latestRequest = 0;
    const refresh = async () => {
      if (!active) return;
      const request = ++latestRequest;
      try {
        const result = await load(context);
        // An issue edit may start another refresh while this one is still loading.
        if (!active || request !== latestRequest) return;
        setData(result);
        setError(null);
      } catch (e) {
        if (!active || request !== latestRequest) return;
        setError(e instanceof PanelError ? e.message : 'request-failed');
      }
    };

    refresh();
    // Fires after status/field edits; may arrive a few seconds late
    const sub = events.on('JIRA_ISSUE_CHANGED', (e) => {
      if (e.changes?.some((c) => c.changeType === 'updated')) refresh();
    });
    return () => {
      active = false;
      sub.then((s) => s.unsubscribe()).catch(() => {});
    };
  }, [context]);

  const running = data?.deadline != null && !data.completedAt;
  const probe = running
    ? computeClock({ ...data, now: Date.now(), pauseStatusIds: data.config.pauseStatusIds, warning: data.config.warning })
    : null;
  const soon = probe && !probe.isPaused && Math.abs(probe.remaining) < DAY;
  const now = useTicker(soon ? 1000 : 30000);

  let body;
  if (error === 'field-missing') {
    body = (
      <SectionMessage appearance="warning">
        The configured deadline field no longer exists. Ask a Jira administrator to update the settings.
      </SectionMessage>
    );
  } else if (error) {
    body = <SectionMessage appearance="error">Could not load the countdown. Try reloading the issue.</SectionMessage>;
  } else if (!data) {
    body = <p className="muted">Loading…</p>;
  } else if (!data.config) {
    body = <p className="muted">Time left is not configured for this project.</p>;
  } else {
    const fmt = (ms) => formatDateTime(ms, { locale: context.locale, timeZone: context.timezone });
    const clock = computeClock({
      start: data.start,
      deadline: data.deadline,
      now,
      timeline: data.timeline,
      pauseStatusIds: data.config.pauseStatusIds,
      completedAt: data.completedAt,
      warning: data.config.warning,
    });
    const badge = BADGES[clock.state];
    const line = subline(data, clock, fmt);

    body = (
      <div
        className={`countdown tone-${badge.tone}`}
        title={clock.state === 'no-deadline' ? undefined : tooltip(data, clock, fmt)}
      >
        <div className="head">
          <svg className="icon" width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <circle cx="8" cy="8" r="6.25" />
            <path d="M8 4.5V8l2.25 1.5" />
          </svg>
          <span className="title">{badge.title}</span>
        </div>
        <div className="row">
          {clock.state !== 'no-deadline' && <span className="time">{formatCountdown(clock.remaining)}</span>}
          {clock.state === 'breached' && clock.isPaused && <span className="hint">paused</span>}
          <span className="badge">
            <Lozenge appearance={badge.appearance} maxWidth="100%">{badge.label}</Lozenge>
          </span>
        </div>
        {clock.state !== 'no-deadline' && clock.elapsedFraction != null && (
          <div className="bar" aria-hidden="true">
            <div className="fill" style={{ width: `${Math.round(clock.elapsedFraction * 100)}%` }} />
          </div>
        )}
        {line && <p className="sub">{`${line} · from field "${data.deadlineFieldName}"`}</p>}
        {/* Announces state changes only, never every tick */}
        <span className="sr-only" aria-live="polite">{badge.label}</span>
      </div>
    );
  }

  // Jira renders the panel title and collapse control itself
  return <section className="panel">{body}</section>;
}
