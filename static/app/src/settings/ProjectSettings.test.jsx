// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../lib/config', () => ({
  NO_START: 'none',
  readConfig: vi.fn(),
  validateConfig: vi.fn(),
  writeConfig: vi.fn(),
}));
vi.mock('../lib/jira', () => ({ JiraError: class extends Error {}, jiraGet: vi.fn() }));

import { readConfig } from '../lib/config';
import { jiraGet } from '../lib/jira';
import ProjectSettings from './ProjectSettings';

const context = { extension: { project: { id: '10000', key: 'TEST' } } };

describe('ProjectSettings', () => {
  let container, root;

  beforeEach(() => {
    vi.resetAllMocks();
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    jiraGet.mockImplementation(async (path) =>
      path.endsWith('/field')
        ? [{ id: 'duedate', name: 'Due date', schema: { type: 'date' } }]
        : [{ statuses: [{ id: '5', name: 'Waiting for customer' }] }]
    );
    readConfig.mockResolvedValue(null);
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
    vi.unstubAllGlobals();
  });

  it('renders the form with the app disabled by default', async () => {
    await act(async () => root.render(<ProjectSettings context={context} />));
    await act(async () => {});

    expect(container.textContent).toContain('Time left');
    expect(container.textContent).toContain('Waiting for customer');
    expect(container.textContent).toContain('Not configured.');
    expect(container.querySelector('#dc-enabled').checked).toBe(false);
  });

  // The Atlaskit bundle contains a Statsig client; the app must never make external requests
  it('makes no network requests of its own while rendering', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('network'));
    const xhrSpy = vi.spyOn(XMLHttpRequest.prototype, 'open');
    const beaconSpy = navigator.sendBeacon ? vi.spyOn(navigator, 'sendBeacon') : null;

    await act(async () => root.render(<ProjectSettings context={context} />));
    await act(async () => {});

    expect(fetchSpy).not.toHaveBeenCalled();
    expect(xhrSpy).not.toHaveBeenCalled();
    if (beaconSpy) expect(beaconSpy).not.toHaveBeenCalled();
  });
});
