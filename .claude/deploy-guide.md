# Deploy guide: Forge time left

## One-time setup: Forge CLI

Requirements: Node 22.22.2 or later in the Node 22 release line (see `.nvmrc`) and an Atlassian developer account. Installing the app requires Jira admin rights on the target site. Replace `your-site.atlassian.net` in this guide with your Jira Cloud site.

```bash
nvm install 22 && nvm use 22                  # if Node 22 is not installed yet
npm install -g @forge/cli                     # install the CLI (per Node version in nvm)
forge --version
npm install && npm --prefix static/app install   # project dependencies, from the repo root
```

`forge login` asks for the account email and an API token. Create the token at https://id.atlassian.com/manage/api-tokens (it is shown only once). Then check with `forge whoami` and `npm run lint`.

If `forge: command not found`, the CLI is missing in the active Node version: switch Node and repeat `npm install -g @forge/cli`.

**Error "couldn't securely store your login credentials in a local keychain"** (typical on WSL/Linux without a desktop keyring). Two options:

1. Use environment variables instead of the keychain (simplest). Put them in `~/.bashrc` or export them in the terminal before running Forge commands:
```bash
export FORGE_EMAIL='you@example.com'
read -r -s -p 'Forge API token: ' FORGE_API_TOKEN
export FORGE_API_TOKEN
forge whoami      # should work without `forge login`
```
2. Install libsecret and a keyring so `forge login` can store the token:
```bash
sudo apt update && sudo apt install -y libsecret-1-0 gnome-keyring dbus-x11
```
On WSL a keyring daemon usually has to be started per session, so option 1 is more reliable. Do not commit the token to the repo.

## Steps

**1. Use Node 22.** Run every command below in the same terminal:
```bash
# From the root of your local checkout:
nvm install
nvm use
node -v   # must be v22.x
```

**2. Log in with your Atlassian developer account.** Use the account that will own the app registration. If you were logged in with a different account, log out first:
```bash
forge logout      # only if logged in with a different account
forge login
forge whoami      # check it is the right account
```

**3. Register your own app when using a copy of this repository.** Interactive; writes your own `app.id` into the local, git-ignored `manifest.yml` (create it first with `cp manifest.yml.example manifest.yml`). For later deployments of that app, keep the registered ID and skip this step:
```bash
forge register
```
Use a name such as `Time left`. Afterwards, run `forge lint` and fix any findings.

**4. Check locally:**
```bash
npm test
npm run build
forge lint
```

**5. First deploy to development.** In development only the app owner can see the app:
```bash
forge deploy                                                  # development by default
forge install --site your-site.atlassian.net --product jira
```
The site asks to confirm the scopes. `forge install` needs Jira admin rights on the site.

**6. Manual testing** with the plan in README.md ("Manual test plan"). For quick iteration:
```bash
forge tunnel      # hot reload; for Custom UI also run: npm --prefix static/app run dev
```
The panel only appears in projects where Project settings → Time left has a saved config with `enabled: true`. Still to verify by hand: the display condition works and the iframe resizes to its content.

**7. When everything works, go to staging, then production** (commands below). Users who are not the app owner can only grant consent in `production`.

## Commands per environment

`forge deploy` does not build the UI, so always run `npm run build` first.

**Before every deploy:**
```bash
npm test && npm run build && forge lint
```

**Development:**
```bash
forge deploy                                                           # = -e development
forge install --site your-site.atlassian.net --product jira            # first time only
forge tunnel                                                           # local development
```

**Staging:**
```bash
forge deploy -e staging
forge install -e staging --site your-site.atlassian.net --product jira   # first time only
```

**Production:**
```bash
forge deploy -e production
forge install -e production --site your-site.atlassian.net --product jira   # first time only
```

**Updating an installed app:**
- After a code change, `forge deploy -e <env>` is enough; no reinstall.
- If `permissions.scopes` changed (or a module needs new permissions), also upgrade the installation:
```bash
forge install --upgrade -e <env> --site your-site.atlassian.net --product jira
```

**Uninstall (per environment).** Removes the app from the site for that environment only; the other environments stay installed. Needs Jira admin rights. Check first with `forge install list`.

Development:
```bash
forge uninstall --site your-site.atlassian.net --product jira              # = -e development
```
Staging:
```bash
forge uninstall -e staging --site your-site.atlassian.net --product jira
```
Production:
```bash
forge uninstall -e production --site your-site.atlassian.net --product jira
```
Uninstall everywhere:
```bash
forge uninstall -e development --site your-site.atlassian.net --product jira
forge uninstall -e staging --site your-site.atlassian.net --product jira
forge uninstall -e production --site your-site.atlassian.net --product jira
```
Notes:
- Uninstalling does not delete the app itself or its deployments; `forge deploy` and a new `forge install -e <env>` bring it back.
- App data stored on the site (e.g. Forge storage or entity properties) may be removed or become inaccessible; export anything important first. This app has no backend storage, but its config lives in the Jira project property `time-left-config`, which belongs to the project and is not removed by uninstalling; the panel stays hidden until the app is installed again.
- To delete the app registration completely, use the Developer Console (https://developer.atlassian.com/console/myapps/): open the app, then Settings, then Delete app. Uninstall it from all sites and environments first.

**Useful:**
```bash
forge install list                    # where the app is installed, per environment
forge whoami                          # current account
forge logout                          # sign out of the CLI
forge lint                            # validate manifest.yml
forge --version
```

## Notes

- One Forge app has three environments: development, staging, production. Each needs its own `forge install -e` per site.
- Development and staging are only visible to the app owner, so colleagues can only test it in production.
- Agents must not run `forge deploy`, `forge install` or `forge uninstall` without asking the user first.
