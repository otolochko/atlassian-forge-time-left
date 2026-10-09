import { describe, it, expect, vi } from 'vitest';

// @forge/bridge throws on import outside Jira; tests inject their own transport
vi.mock('@forge/bridge', () => ({ requestJira: vi.fn() }));

import { validateConfig, readConfig, writeConfig } from './config';
import { JiraError } from './jira';

const valid = () => ({
  version: 1,
  enabled: true,
  deadlineFieldId: 'customfield_10234',
  startFieldId: null,
  warning: { type: 'hours', value: 4 },
  pauseStatusIds: ['10005', '10012'],
});

const res = (status, body) => ({ status, ok: status >= 200 && status < 300, json: async () => body });

describe('validateConfig', () => {
  it('accepts a valid config', () => {
    expect(validateConfig(valid())).toEqual({ ok: true, config: valid() });
  });

  it('rejects missing or malformed values', () => {
    expect(validateConfig(null).ok).toBe(false);
    expect(validateConfig({ ...valid(), version: 2 }).ok).toBe(false);
    expect(validateConfig({ ...valid(), enabled: 'true' }).ok).toBe(false);
    expect(validateConfig({ ...valid(), deadlineFieldId: '' }).ok).toBe(false);
    expect(validateConfig({ ...valid(), startFieldId: 5 }).ok).toBe(false);
    expect(validateConfig({ ...valid(), pauseStatusIds: [1] }).ok).toBe(false);
  });

  it('allows no start, but not with a percent threshold', () => {
    expect(validateConfig({ ...valid(), startFieldId: 'none' }).ok).toBe(true);
    expect(validateConfig({ ...valid(), startFieldId: 'none', warning: { type: 'percent', value: 20 } }).ok).toBe(false);
  });

  it('validates the threshold', () => {
    const w = (warning) => validateConfig({ ...valid(), warning }).ok;
    expect(w({ type: 'hours', value: 0 })).toBe(false);
    expect(w({ type: 'hours', value: 0.5 })).toBe(true);
    expect(w({ type: 'percent', value: 0 })).toBe(false);
    expect(w({ type: 'percent', value: 100 })).toBe(false);
    expect(w({ type: 'percent', value: 50 })).toBe(true);
    expect(w({ type: 'days', value: 1 })).toBe(false);
    expect(w({ type: 'hours', value: 'x' })).toBe(false);
  });
});

describe('readConfig', () => {
  it('returns the config', async () => {
    const transport = async () => res(200, { key: 'k', value: valid() });
    expect(await readConfig('10000', transport)).toEqual(valid());
  });

  it('returns null on 404 and on invalid stored data', async () => {
    expect(await readConfig('10000', async () => res(404, {}))).toBeNull();
    expect(await readConfig('10000', async () => res(200, { value: { version: 9 } }))).toBeNull();
  });

  it('rethrows other errors', async () => {
    await expect(readConfig('10000', async () => res(500, {}))).rejects.toBeInstanceOf(JiraError);
  });
});

describe('writeConfig', () => {
  it('PUTs the validated config', async () => {
    let seen;
    await writeConfig('10000', valid(), async (path, options) => {
      seen = { path, options };
      return res(200, {});
    });
    expect(seen.path).toBe('/rest/api/3/project/10000/properties/time-left-config');
    expect(seen.options.method).toBe('PUT');
    expect(JSON.parse(seen.options.body)).toEqual(valid());
  });

  it('surfaces 403 and rejects invalid config before sending', async () => {
    await expect(writeConfig('10000', valid(), async () => res(403, {}))).rejects.toMatchObject({
      status: 403,
    });
    await expect(
      writeConfig('10000', { ...valid(), version: 3 }, async () => {
        throw new Error('should not be called');
      })
    ).rejects.toThrow('Unsupported config version.');
  });
});
