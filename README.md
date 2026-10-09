# ⏳ Time Left (Forge App for Jira)

[![Node Version](https://img.shields.io/badge/node-22.x-brightgreen.svg)](https://nodejs.org/)
[![License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![Platform](https://img.shields.io/badge/platform-Jira_Cloud_|_Forge-0052CC.svg)](https://developer.atlassian.com/platform/forge/)

> **Reads a date from an existing Jira field** (a Date Time custom field such as "Deadline", or the system Due date) and shows a **live, SLA-like countdown** in the issue view sidebar. Built as a Forge Custom UI app (React + Vite) for Jira Cloud.

---

## ✨ Features

- **Live Countdown:** Updates dynamically in the Jira issue view sidebar.
- **Smart States:** Tracking includes *On track, Due soon, Paused, Breached, Met, Missed,* and *No deadline*.
- **Pause Capabilities:** Pause statuses extend the effective deadline, behaving similarly to JSM SLAs.
- **Lightweight:** Pure frontend implementation, 0 backend costs.

---

## 🚀 Setup

Ensure you are using **Node 22.22.2** or later in the Node 22 release line for the Forge CLI and browser-component tests. A `.nvmrc` is provided.

```bash
nvm install
nvm use
npm install -g @forge/cli
cp manifest.yml.example manifest.yml   # manifest.yml is git-ignored (it holds your app.id)
forge login               # use your Atlassian developer account
forge register            # interactive; writes `app.id` into manifest.yml
npm --prefix static/app install
```

> **Note:** `manifest.yml` is **not tracked in git** because it contains the app registration (`app.id`). The repository ships `manifest.yml.example` without an `app.id`; copy it to `manifest.yml` and run `forge register` to add your own app registration. If you change `manifest.yml` (modules, scopes, permissions), make the same change in `manifest.yml.example`, without the `app.id`. Replace `your-site.atlassian.net` in the commands below with your Jira Cloud site. Installing the app requires **Jira admin rights**.

---

## 🛠 Build, Test & Deploy

<details>
<summary><strong>View standard commands</strong></summary>

```bash
npm test                  # vitest (clock, config, format, panel refresh)
npm run lint              # forge lint
npm run build             # -> static/app/build
forge deploy
forge install --site your-site.atlassian.net --product jira
forge tunnel              # local development
```

</details>

<details>
<summary><strong>View production commands</strong></summary>

```bash
forge deploy -e production
forge install -e production --site your-site.atlassian.net --product jira
```

> ⚠️ Users can only grant the app consent in the `production` environment. In `development` and `staging` only the app owner can use it.

</details>

---

## ⚙️ Configuration

Settings are stored in the Jira project property `time-left-config` (edited in **Project settings → Time left**):

```json
{
  "version": 1,
  "enabled": true,
  "deadlineFieldId": "customfield_10234",
  "startFieldId": null,
  "warning": { "type": "hours", "value": 4 },
  "pauseStatusIds": ["10005", "10012"]
}
```

*The config is validated on every read and on save. Invalid or missing config implies the app is "not configured" for that project.*

---

## 🏗 Architecture Decisions

1. **No backend:** No `function` modules, resolvers, Forge storage, or triggers. Everything runs in the browser through `requestJira` from `@forge/bridge` as the current user. Cost = $0.
2. **One Custom UI resource:** Serves both modules and routes by `moduleKey` from `view.getContext()`.
3. **Config in a Jira project property:** Jira enforces who can write it (the settings page displays a friendly message on 403 errors).

   **Off by default, enabled per project through a settings page shown to Jira administrators only.** The panel is hidden until a project has a saved config with `enabled: true`. The settings page has a `hasGlobalPermission: ADMINISTER` display condition, so project admins who are not Jira administrators don't see it. No storage is needed for this. **This is a UI restriction, not a security boundary:** a project admin can still write the `time-left-config` project property through the Jira REST API and enable the panel in their own project. The panel only shows data the viewing user can already see in Jira. A hard restriction would need app-side storage, which this app deliberately doesn't use.

4. **Display condition:** The panel uses an `entityPropertyEqualTo` display condition on the project property (`enabled == 'true'`), keeping it hidden in unconfigured projects.
5. **Pause semantics (like JSM SLAs):** Time in pause statuses extends the effective deadline; remaining time is frozen while paused. *Breached* always wins over *paused*.
6. **Date-only fields:** (e.g. Due date) Default to the end of that day in the Jira user's timezone.
7. **No external egress, no API tokens:** Everything is bundled, keeping the app eligible for "Runs on Atlassian".
8. **Atlaskit components with Atlassian design tokens** (light and dark). Atlaskit injects `<style>` tags, so the manifest sets `permissions.content.styles: ['unsafe-inline']`. The bundle is larger (about 840 kB main chunk) and includes an unused Statsig feature-gate client from `@atlaskit/platform-feature-flags`; the app never initializes it and makes no external requests.
9. **Refresh mechanism:** Refetches on the `JIRA_ISSUE_CHANGED` bridge event. The ticker runs every 1 second when less than a day remains, and every 30 seconds otherwise. It pauses while the browser tab is hidden.

> **Note:** The core logic is located in `static/app/src/lib/clock.js` (pure functions, fully unit-tested).

---

## 🧪 Manual Test Plan

- [ ] **Create field:** Create a Date Time custom field "Deadline" and add it to a test project's screens.
- [ ] **Configure:** In *Project settings → Time left*, enable it, choose "Deadline", set threshold to 4 hours, and pause status to "Waiting for customer".
- [ ] **Check states:** Verify deadline in 2 days (*On track*), in 2 hours (*Due soon*), in the past (*Breached*), and empty (*No deadline*).
- [ ] **Test pauses:** Move the issue to the pause status, wait a minute (countdown must not change). Move it back: it should continue from the same value.
- [ ] **Resolution:** Resolve the issue before and after the deadline to verify *Met* and *Missed* with correct "to spare" / "late" values.
- [ ] **System field:** Switch the deadline field to the system *Due date* to check end-of-day behavior in your timezone.
- [ ] **Unconfigured project:** Ensure the panel does not appear in a project without config.
- [ ] **UI Edge cases:** Test in Dark mode and with a narrow browser window.

---

## ⚠️ Known Limitations

| Limitation | Description |
|---|---|
| **Visibility** | Shows only in the issue view. Lists and boards show the native Deadline field. |
| **JQL & Pauses** | The pause-extended effective deadline isn't stored anywhere, so JQL on the Deadline field doesn't account for pauses. |
| **Working hours** | No working-hours calendars in v1; the clock runs 24/7. |
| **Alerts** | Rely on Jira Automation (not this app). E.g., a scheduled rule with `"Deadline" <= 2h AND statusCategory != Done` sends a notification. |
| **Collapsed state** | The collapsed issue panel can't show a state lozenge (a dynamic lozenge requires a function module). |

---

## 🔮 Future Work

- 📅 **Working-hours calendars** (pure math in `clock.js`, configurable per project).
- 📊 **A `jira:dashboardGadget`** listing the nearest deadlines via JQL (frontend-only).
- 💾 **Storing effective deadline** in an issue property so JQL can use it (needs triggers, i.e., billed Forge Functions).

---

## 🔒 Privacy & 📄 License

- **Privacy:** See [PRIVACY.md](PRIVACY.md) for data usage, config storage, and deletion policies.
- **License:** Code is under the [MIT License](LICENSE). Third-party dependencies retain their own licenses.
