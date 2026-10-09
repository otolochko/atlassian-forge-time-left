// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@forge/bridge', () => ({ events: { on: vi.fn() } }));
vi.mock('../lib/config', () => ({ NO_START: 'none', readConfig: vi.fn() }));
vi.mock('../lib/jira', () => ({ jiraGet: vi.fn() }));
vi.mock('./useTicker', () => ({ useTicker: () => Date.UTC(2026, 9, 7) }));

import { events } from '@forge/bridge';
import { readConfig } from '../lib/config';
import { jiraGet } from '../lib/jira';
import DeadlinePanel from './DeadlinePanel';

const context = {
  extension: { issue: { key: 'TEST-1' }, project: { id: '10000' } },
  locale: 'en-US',
  timezone: 'UTC',
};
const changed = { changes: [{ changeType: 'updated' }] };
const issue = (dueDate) => ({
  fields: {
    created: '2026-10-01T00:00:00.000+0000',
    duedate: dueDate,
    status: { id: '1', name: 'Open', statusCategory: { key: 'new' } },
    resolutiondate: null,
  },
  names: { duedate: 'Deadline' },
});

function deferred() {
  let resolve, reject;
  const promise = new Promise((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

describe('DeadlinePanel refresh', () => {
  let container, root, unsubscribe;

  beforeEach(() => {
    vi.resetAllMocks();
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    vi.spyOn(Date, 'now').mockReturnValue(Date.UTC(2026, 9, 7));
    readConfig.mockResolvedValue({
      enabled: true,
      deadlineFieldId: 'duedate',
      startFieldId: null,
      warning: { type: 'hours', value: 4 },
      pauseStatusIds: [],
    });
    unsubscribe = vi.fn();
    events.on.mockResolvedValue({ unsubscribe });
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    if (root) await act(async () => root.unmount());
    container.remove();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it.each([
    ['success', 'success'],
    ['error', 'success'],
    ['success', 'error'],
    ['error', 'error'],
  ])('ignores an older %s after the latest %s', async (olderOutcome, latestOutcome) => {
    const older = deferred();
    const latest = deferred();
    jiraGet.mockImplementationOnce(() => older.promise).mockImplementationOnce(() => latest.promise);

    await act(async () => root.render(<DeadlinePanel context={context} />));
    const onChange = events.on.mock.calls[0][1];
    await act(async () => onChange(changed));
    expect(jiraGet).toHaveBeenCalledTimes(2);

    await act(async () => {
      if (latestOutcome === 'success') latest.resolve(issue('2026-10-12'));
      else latest.reject(new Error('Latest request failed'));
    });
    const latestText = container.textContent;
    if (latestOutcome === 'success') expect(latestText).toContain('Oct 12');
    else expect(latestText).toContain('Could not load the countdown');

    await act(async () => {
      if (olderOutcome === 'success') older.resolve(issue('2026-10-11'));
      else older.reject(new Error('Old request failed'));
    });
    expect(container.textContent).toBe(latestText);
  });

  it('shows a single short line and no own header; details go to the tooltip', async () => {
    jiraGet.mockResolvedValueOnce(issue('2026-10-01'));
    await act(async () => root.render(<DeadlinePanel context={context} />));

    expect(container.textContent).toContain('Breached');
    expect(container.textContent).toContain('Was due Oct 1, 23:59');
    expect(container.textContent).toContain('Overdue');
    expect(container.textContent).not.toContain('effective');
    expect(container.querySelector('.countdown').title).toBe('From "Deadline" · deadline Oct 1, 23:59');
  });

  it('accepts the latest success after an earlier error', async () => {
    const latest = deferred();
    jiraGet.mockRejectedValueOnce(new Error('Initial request failed'))
      .mockImplementationOnce(() => latest.promise);
    await act(async () => root.render(<DeadlinePanel context={context} />));
    expect(container.textContent).toContain('Could not load the countdown');
    await act(async () => events.on.mock.calls[0][1](changed));
    await act(async () => latest.resolve(issue('2026-10-13')));
    expect(container.textContent).toContain('Oct 13');
    expect(container.textContent).not.toContain('Could not load the countdown');
  });

  it('ignores an old context response and its subscription callback', async () => {
    const older = deferred();
    jiraGet.mockImplementationOnce(() => older.promise).mockResolvedValueOnce(issue('2026-10-14'));
    await act(async () => root.render(<DeadlinePanel context={context} />));
    const oldOnChange = events.on.mock.calls[0][1];
    const nextContext = { ...context, extension: { ...context.extension, issue: { key: 'TEST-2' } } };
    await act(async () => root.render(<DeadlinePanel context={nextContext} />));
    expect(container.textContent).toContain('Oct 14');
    expect(jiraGet.mock.calls[1][0]).toContain('/issue/TEST-2?');
    expect(unsubscribe).toHaveBeenCalledTimes(1);

    await act(async () => {
      oldOnChange(changed);
      older.resolve(issue('2026-10-11'));
    });
    expect(readConfig).toHaveBeenCalledTimes(2);
    expect(container.textContent).toContain('Oct 14');
    expect(container.textContent).not.toContain('Oct 11');
  });

  it('cleans up a delayed subscription and ignores callbacks after unmount', async () => {
    const subscription = deferred();
    const pending = deferred();
    events.on.mockReturnValueOnce(subscription.promise);
    jiraGet.mockImplementationOnce(() => pending.promise);
    await act(async () => root.render(<DeadlinePanel context={context} />));
    const onChange = events.on.mock.calls[0][1];
    await act(async () => root.unmount());
    root = null;

    await act(async () => {
      subscription.resolve({ unsubscribe });
      onChange(changed);
      pending.reject(new Error('Request completed after unmount'));
    });
    expect(unsubscribe).toHaveBeenCalledTimes(1);
    expect(readConfig).toHaveBeenCalledTimes(1);
    expect(container.textContent).toBe('');
  });
});
