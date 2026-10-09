import { requestJira } from '@forge/bridge';

const MAX_ATTEMPTS = 5;

export class JiraError extends Error {
  constructor(status, path) {
    super(`Jira request failed (${status})`);
    this.status = status;
    this.path = path;
  }
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** requestJira as the current user, retrying HTTP 429 with Retry-After or exponential backoff */
export async function jiraFetch(path, options, transport = requestJira) {
  for (let attempt = 1; ; attempt++) {
    const res = await transport(path, options);
    if (res.status === 429 && attempt < MAX_ATTEMPTS) {
      const wait = Number(res.headers.get('Retry-After')) || 2 ** attempt;
      await sleep(wait * 1000);
      continue;
    }
    return res;
  }
}

/** GET and parse JSON; throws JiraError on non-2xx */
export async function jiraGet(path, transport) {
  const res = await jiraFetch(path, undefined, transport);
  if (!res.ok) throw new JiraError(res.status, path);
  return res.json();
}

/** PUT a JSON body; throws JiraError on non-2xx */
export async function jiraPut(path, body, transport) {
  const res = await jiraFetch(
    path,
    {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(body),
    },
    transport
  );
  if (!res.ok) throw new JiraError(res.status, path);
}
