# AGENTS.md

This file provides guidance to coding agents (Claude Code, etc.) when working with code in this repository.

## What this is

An Atlassian Forge **Custom UI** app (React + Vite) that shows an SLA-like countdown to a Jira date field in the issue view sidebar, plus a per-project settings page. `README.md` has the architecture decisions and the manual test plan. Optional local specifications in `.claude/prompt.md` are git-ignored and are not required to work with the repository.

## Commands

Use **Node 22.22.2 or later in the Node 22 release line** (`.nvmrc`) for the Forge CLI and jsdom component tests. With nvm, run `nvm install` and `nvm use` from the repository root before running the commands below.

```bash
npm --prefix static/app install
npm test                                        # vitest run (same as npm --prefix static/app test)
npm --prefix static/app exec vitest run src/lib/clock.test.js   # one file
npm --prefix static/app exec vitest run -t "breached"           # one test by name
npm run build                                   # vite build -> static/app/build
npm run lint                                    # forge lint (needs a local manifest.yml with app.id)
```

`manifest.yml` is **git-ignored** (it holds the app-specific `app.id`). The tracked template is `manifest.yml.example`; a fresh checkout needs `cp manifest.yml.example manifest.yml` and then `forge register`. **Whenever you change `manifest.yml` (modules, scopes, permissions, resources), make the same change in `manifest.yml.example`.** The example must never contain `app.id` or any other app/site-specific identifier.

`forge login` and `forge register` are interactive; the user runs them. **Never run `forge deploy`, `forge install` or `forge uninstall` without asking first.** Full command list: `.claude/deploy-guide.md`.

## Architecture

- **No backend, by decision.** No `function` modules, resolvers, Forge storage, triggers or external fetches. All Jira access is `requestJira` from `@forge/bridge`, as the current user. If something seems to need a backend, stop and ask.
- **One static resource, two modules.** `manifest.yml` points both `jira:issueContext` (countdown panel) and `jira:projectSettingsPage` at `static/app/build`. `src/main.jsx` routes on `context.moduleKey` (`time-left-panel` / `time-left-settings`).
- **Config = Jira project property** `time-left-config` (`lib/config.js`). It is validated on every read and on write; invalid or missing means "not configured". Jira enforces who can write it (403 shows a friendly message), and the settings page itself is only shown to Jira administrators (`hasGlobalPermission: ADMINISTER` in the manifest), so enabling the app per project is meant to be an admin decision. Default is off everywhere. This is a UI restriction only: project admins can still write the project property via REST, so don't describe it as enforced. The manifest's `entityPropertyEqualTo` display condition reads `enabled` from the same property, so renaming that key or changing `enabled` away from a boolean breaks panel visibility.
- **`lib/clock.js` is the pure core** (no I/O, epoch ms): `parseJiraDate`, `resolveDateField`, `buildStatusTimeline`, `pausedWithin`, `computeClock`. Pauses extend the effective deadline; breached wins over paused; completion stops the clock at `resolutiondate`. UI code (`panel/DeadlinePanel.jsx`) only fetches, calls these, and renders.
- **Panel data flow:** read config → issue (`expand=names`) → changelog only if `pauseStatusIds` is non-empty → compute. It refetches on the `JIRA_ISSUE_CHANGED` bridge event. `useTicker` ticks every 1s when under a day remains, otherwise every 30s, and stops while the tab is hidden.
- **Field type is inferred from the value** (`YYYY-MM-DD` means date-only, end of day in the user's timezone from the context) so the panel doesn't need an extra `/field` call.

## Gotchas

- `@forge/bridge` throws on import outside Jira. Tests that import `jira.js` or `config.js` must `vi.mock('@forge/bridge', ...)` and inject a `transport` argument (see `config.test.js`).
- Jira timestamps look like `+0200` (no colon); always parse with `parseJiraDate`.
- UI uses Atlaskit components (lozenge, button, select, checkbox, toggle, textfield, section-message) plus plain CSS with design tokens (`App.css`). Atlaskit injects `<style>` tags, hence `permissions.content.styles: ['unsafe-inline']` in the manifest. Its bundle also contains a Statsig feature-gate client (via `@atlaskit/platform-feature-flags`); the app never initializes it, and `ProjectSettings.test.jsx` guards that rendering makes no network requests. Keep it that way (no external egress). jsdom tests need the `matchMedia` stub in `src/test-setup.js`.
- Scopes are `read:jira-work` and `manage:jira-project`. Saving the project property (`PUT /project/{id}/properties/{key}`) needs `manage:jira-project`; without it Jira answers 401. Adding a scope needs `forge deploy` and then `forge install --upgrade`.
- Consent for non-owner users only works in the `production` Forge environment.
