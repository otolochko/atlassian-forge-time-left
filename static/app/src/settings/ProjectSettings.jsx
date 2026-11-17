import { useEffect, useState } from 'react';
import Button from '@atlaskit/button/new';
import Checkbox from '@atlaskit/checkbox';
import SectionMessage from '@atlaskit/section-message';
import Select from '@atlaskit/select';
import Textfield from '@atlaskit/textfield';
import Toggle from '@atlaskit/toggle';
import { NO_START, readConfig, validateConfig, writeConfig } from '../lib/config';
import { JiraError, jiraGet } from '../lib/jira';

const DEFAULTS = {
  version: 1,
  enabled: false,
  deadlineFieldId: '',
  startFieldId: null,
  warning: { type: 'hours', value: 4 },
  pauseStatusIds: [],
  timeZone: null,
};

const PROFILE_ZONE = { label: "Viewer's time zone (default)", value: '' };
// Some systems write a fixed offset all year, with no daylight saving. IANA spells UTC+2 as Etc/GMT-2 (inverted sign)
const FIXED_ZONES = Array.from({ length: 27 }, (_, i) => i - 12).map((h) => {
  const sign = h < 0 ? '-' : '+';
  const hh = String(Math.abs(h)).padStart(2, '0');
  return { label: `UTC${sign}${hh}:00 (fixed, no daylight saving)`, value: h === 0 ? 'UTC' : `Etc/GMT${h > 0 ? '-' : '+'}${Math.abs(h)}` };
});
const ZONE_OPTIONS = [
  PROFILE_ZONE,
  ...FIXED_ZONES,
  ...Intl.supportedValuesOf('timeZone').map((z) => ({ label: z, value: z })),
];

async function loadOptions(projectKey) {
  const [fields, byType] = await Promise.all([
    jiraGet('/rest/api/3/field'),
    jiraGet(`/rest/api/3/project/${encodeURIComponent(projectKey)}/statuses`),
  ]);
  const dateFields = fields
    // Custom text fields (including read only ones) can hold dates written by other systems, like "2026-11-23 12:00:00"
    .filter(
      (f) =>
        f.schema &&
        (f.schema.type === 'datetime' || f.schema.type === 'date' || (f.schema.type === 'string' && f.schema.custom))
    )
    .sort((a, b) => a.name.localeCompare(b.name));
  // Flatten and deduplicate statuses across issue types
  const statuses = new Map();
  for (const type of byType) for (const s of type.statuses) statuses.set(s.id, s.name);
  return {
    dateFields,
    statuses: [...statuses].map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name)),
  };
}

function Summary({ config, options }) {
  const fieldName = (id) => options.dateFields.find((f) => f.id === id)?.name ?? id;
  const statusName = (id) => options.statuses.find((s) => s.id === id)?.name ?? id;
  const w = config.warning;
  return (
    <dl className="summary">
      <dt>Status</dt>
      <dd>{config.enabled ? 'Enabled' : 'Disabled'}</dd>
      <dt>Deadline field</dt>
      <dd>{fieldName(config.deadlineFieldId)}</dd>
      <dt>Clock starts</dt>
      <dd>{config.startFieldId === NO_START ? 'None' : config.startFieldId ? fieldName(config.startFieldId) : 'Issue created'}</dd>
      <dt>Due soon</dt>
      <dd>{w.type === 'hours' ? `less than ${w.value} h left` : `less than ${w.value}% left`}</dd>
      <dt>Time zone for values without an offset</dt>
      <dd>{config.timeZone ?? "Viewer's time zone"}</dd>
      <dt>Pause statuses</dt>
      <dd>{config.pauseStatusIds.length ? config.pauseStatusIds.map(statusName).join(', ') : 'None'}</dd>
    </dl>
  );
}

const THRESHOLD_UNITS = [
  { label: 'Hours left', value: 'hours' },
  { label: 'Percent of total time left', value: 'percent' },
];

export default function ProjectSettings({ context }) {
  const { project } = context.extension;
  const { id: projectId, key: projectKey } = project;
  const [options, setOptions] = useState(null);
  const [saved, setSaved] = useState(null);
  const [form, setForm] = useState(DEFAULTS);
  const [message, setMessage] = useState(null); // { type: 'error' | 'ok', text }
  const [loadFailed, setLoadFailed] = useState(false);

  useEffect(() => {
    Promise.all([loadOptions(projectKey), readConfig(projectId)])
      .then(([opts, config]) => {
        setOptions(opts);
        setSaved(config);
        if (config) setForm(config);
      })
      .catch(() => setLoadFailed(true));
  }, [projectId, projectKey]);

  if (loadFailed) {
    return <SectionMessage appearance="error">Could not load the settings. Try reloading the page.</SectionMessage>;
  }
  if (!options) return <p className="muted">Loading…</p>;

  const set = (patch) => setForm((f) => ({ ...f, ...patch }));
  const toggleStatus = (id) =>
    set({
      pauseStatusIds: form.pauseStatusIds.includes(id)
        ? form.pauseStatusIds.filter((s) => s !== id)
        : [...form.pauseStatusIds, id],
    });

  const fieldOptions = options.dateFields.map((f) => ({ label: `${f.name} (${f.id})`, value: f.id }));
  const startOptions = [
    { label: 'Issue created', value: '' },
    { label: 'None (deadline only)', value: NO_START },
    ...fieldOptions,
  ];
  const unitOptions = form.startFieldId === NO_START ? THRESHOLD_UNITS.slice(0, 1) : THRESHOLD_UNITS;

  const setStart = (value) =>
    set({
      startFieldId: value || null,
      // Percent needs a start to measure against
      ...(value === NO_START && form.warning.type === 'percent' ? { warning: { type: 'hours', value: 4 } } : {}),
    });

  const save = async (e) => {
    e.preventDefault();
    const check = validateConfig(form);
    if (!check.ok) return setMessage({ type: 'error', text: check.error });
    try {
      await writeConfig(project.id, check.config);
      setSaved(check.config);
      setMessage({ type: 'ok', text: 'Saved.' });
    } catch (err) {
      const text =
        err instanceof JiraError && err.status === 403
          ? 'Only Jira administrators can change these settings.'
          : `Could not save the settings. Try again.${err instanceof JiraError ? ` (HTTP ${err.status})` : ''}`;
      setMessage({ type: 'error', text });
    }
  };

  return (
    <form className="settings" onSubmit={save}>
      <h2>Time left</h2>

      <div className="field">
        <label htmlFor="dc-enabled" className="field-label">Enabled</label>
        <Toggle id="dc-enabled" isChecked={form.enabled} onChange={(e) => set({ enabled: e.target.checked })} />
      </div>

      <div className="field">
        <label htmlFor="dc-deadline" className="field-label">Deadline field</label>
        <Select
          inputId="dc-deadline"
          placeholder="Select a field…"
          options={fieldOptions}
          value={fieldOptions.find((o) => o.value === form.deadlineFieldId) ?? null}
          onChange={(o) => set({ deadlineFieldId: o?.value ?? '' })}
        />
      </div>

      <div className="field">
        <label htmlFor="dc-start" className="field-label">Start of the clock</label>
        <Select
          inputId="dc-start"
          options={startOptions}
          value={startOptions.find((o) => o.value === (form.startFieldId ?? '')) ?? null}
          onChange={(o) => setStart(o?.value ?? '')}
        />
      </div>

      <div className="field">
        <label htmlFor="dc-zone" className="field-label">Time zone for values without an offset</label>
        <Select
          inputId="dc-zone"
          options={ZONE_OPTIONS}
          value={ZONE_OPTIONS.find((o) => o.value === (form.timeZone ?? '')) ?? PROFILE_ZONE}
          onChange={(o) => set({ timeZone: o?.value || null })}
        />
        <p className="muted">
          For text fields such as 2026-11-23 12:00:00. Values with an offset or a date only are not affected. Set the zone the other system writes in; otherwise each viewer&apos;s own zone is used.
        </p>
      </div>

      <fieldset>
        <legend>Due soon threshold</legend>
        <div className="threshold">
          <Select
            aria-label="Threshold unit"
            options={unitOptions}
            value={THRESHOLD_UNITS.find((o) => o.value === form.warning.type)}
            onChange={(o) => set({ warning: { type: o.value, value: o.value === 'hours' ? 4 : 20 } })}
          />
          <Textfield
            type="number"
            aria-label="Threshold value"
            min={form.warning.type === 'hours' ? 0.5 : 1}
            max={form.warning.type === 'percent' ? 99 : undefined}
            step={form.warning.type === 'hours' ? 0.5 : 1}
            value={form.warning.value}
            onChange={(e) => set({ warning: { ...form.warning, value: e.target.valueAsNumber } })}
          />
        </div>
      </fieldset>

      <fieldset>
        <legend>Pause statuses</legend>
        <div className="statuses">
          {options.statuses.map((s) => (
            <Checkbox
              key={s.id}
              label={s.name}
              isChecked={form.pauseStatusIds.includes(s.id)}
              onChange={() => toggleStatus(s.id)}
            />
          ))}
        </div>
      </fieldset>

      <Button type="submit" appearance="primary">Save</Button>
      {message && (
        <div className="message" aria-live="polite">
          <SectionMessage appearance={message.type === 'error' ? 'error' : 'success'}>{message.text}</SectionMessage>
        </div>
      )}

      <h3>Current saved settings</h3>
      {saved ? <Summary config={saved} options={options} /> : <p className="muted">Not configured.</p>}
    </form>
  );
}
