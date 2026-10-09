import { JiraError, jiraGet, jiraPut } from './jira';

export const CONFIG_KEY = 'time-left-config';

const propertyPath = (projectIdOrKey) =>
  `/rest/api/3/project/${encodeURIComponent(projectIdOrKey)}/properties/${CONFIG_KEY}`;

/** `startFieldId` value meaning "no start: deadline only" (null still means issue created) */
export const NO_START = 'none';

const isFieldId = (v) => typeof v === 'string' && v.length > 0;

/**
 * Validates an untrusted config value.
 * @returns {{ ok: true, config: object } | { ok: false, error: string }}
 */
export function validateConfig(value) {
  if (!value || typeof value !== 'object') return { ok: false, error: 'Config is missing.' };
  if (value.version !== 1) return { ok: false, error: 'Unsupported config version.' };
  if (typeof value.enabled !== 'boolean') return { ok: false, error: 'Invalid "enabled".' };
  if (!isFieldId(value.deadlineFieldId)) return { ok: false, error: 'Deadline field is required.' };
  if (value.startFieldId !== null && !isFieldId(value.startFieldId)) {
    return { ok: false, error: 'Invalid start field.' };
  }

  const w = value.warning;
  if (!w || typeof w !== 'object' || !Number.isFinite(w.value)) {
    return { ok: false, error: 'Invalid threshold.' };
  }
  if (w.type === 'hours' && !(w.value > 0)) {
    return { ok: false, error: 'Hours must be greater than 0.' };
  }
  if (w.type === 'percent' && value.startFieldId === NO_START) {
    return { ok: false, error: 'A percent threshold needs a start. Use hours, or choose a start.' };
  }
  if (w.type === 'percent' && !(w.value >= 1 && w.value <= 99)) {
    return { ok: false, error: 'Percent must be between 1 and 99.' };
  }
  if (w.type !== 'hours' && w.type !== 'percent') {
    return { ok: false, error: 'Invalid threshold type.' };
  }

  const ids = value.pauseStatusIds;
  if (!Array.isArray(ids) || !ids.every((id) => typeof id === 'string')) {
    return { ok: false, error: 'Invalid pause statuses.' };
  }

  return {
    ok: true,
    config: {
      version: 1,
      enabled: value.enabled,
      deadlineFieldId: value.deadlineFieldId,
      startFieldId: value.startFieldId,
      warning: { type: w.type, value: w.value },
      pauseStatusIds: [...ids],
    },
  };
}

/** @returns {Promise<object | null>} a valid config, or null when missing or invalid */
export async function readConfig(projectIdOrKey, transport) {
  try {
    const prop = await jiraGet(propertyPath(projectIdOrKey), transport);
    const result = validateConfig(prop.value);
    return result.ok ? result.config : null;
  } catch (e) {
    if (e instanceof JiraError && e.status === 404) return null;
    throw e;
  }
}

/** Throws if the config is invalid; JiraError(403) when the user lacks permission to write the project property */
export async function writeConfig(projectIdOrKey, config, transport) {
  const result = validateConfig(config);
  if (!result.ok) throw new Error(result.error);
  await jiraPut(propertyPath(projectIdOrKey), result.config, transport);
}
