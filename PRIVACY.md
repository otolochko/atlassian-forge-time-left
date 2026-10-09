# Privacy Policy: Time Left for Jira

Last updated: 2026-10-07

Time Left ("the app") is an Atlassian Forge app for Jira Cloud. It shows a live countdown to a date field in the issue view and has a settings page for each project.

## Summary

- The app has **no developer-operated backend**. Its interface runs in your browser inside Jira, is hosted on Atlassian Forge, and calls Jira through Forge Bridge.
- The app has no developer-operated data collection endpoint and does not send Jira data to the developer or an external service.
- Installing the app does not give the developer a separate account or access to your Jira site.
- The only data the app stores is its configuration, as a property of your Jira project.

## Data the app accesses

The app reads this data from your Jira site, using the permissions of the signed-in user:

| Data | Why |
| --- | --- |
| Issue ID/key, status, created date, resolution date, status-category change date, configured date fields, and field names | To calculate and display the countdown |
| Full issue changelog, when pause statuses are configured | To derive the status timeline and calculate pause time |
| Field metadata returned by Jira, including names, IDs, and schemas | To build the date-field selector; the settings page filters the returned list to date and datetime fields |
| Project statuses and associated issue-type metadata | To build the pause-status selector |
| Project property `time-left-config` | To read and save the project settings |
| Forge context, including locale, time zone, issue/project identifiers, and any account/site identifiers provided by Forge | To select the app view, identify the issue and project, and format dates and times |

The changelog endpoint returns more than status transitions. Its response can include changes to other fields, their previous and new values, and author metadata such as account IDs, display names, avatar URLs, and email addresses when Jira makes them available. The response is received in browser memory. The countdown calculation uses only status transitions and their timestamps; it does not display author metadata or unrelated field changes. See the [Jira changelog API](https://developer.atlassian.com/cloud/jira/platform/rest/v3/api-group-issues/#api-rest-api-3-issue-issueidorkey-changelog-get).

The app does not separately request issue summaries, descriptions, comments, attachment contents, or user profiles. Changes to other issue fields may nevertheless be present in the changelog response described above.

## Data the app stores

The app stores one record per project: the Jira project property `time-left-config`. It contains the following:

- whether the countdown is enabled
- the IDs of the deadline and start fields
- the "due soon" threshold
- the IDs of the pause statuses

The record lives in your Jira site. It contains settings and identifiers, rather than issue contents or user profile details. Uninstalling the app does not delete it automatically. An administrator with the required Jira permissions can delete it through the [Jira project properties API](https://developer.atlassian.com/cloud/jira/platform/rest/v3/api-group-project-properties/#api-rest-api-3-project-projectidorkey-properties-propertykey-delete).

Issue data and API responses are processed in browser memory while the app is open. The application code does not persist them to Forge storage, a separate database, cookies, or browser local storage, and does not implement analytics or tracking. The browser may cache the app's static files; Jira and Forge manage their own authentication and platform operations.

## Permissions (scopes)

| Scope | Use |
| --- | --- |
| `read:jira-work` | Read issues, the changelog, fields, statuses, and the project property |
| `manage:jira-project` | Save the app's configuration as a project property |

All Jira API requests use [Forge Bridge `requestJira`](https://developer.atlassian.com/platform/forge/apis-reference/ui-api-bridge/requestJira/) on behalf of the signed-in user. Access is limited by both the app's declared scopes and that user's Jira permissions. Saving the configuration requires the Administer projects or Administer Jira permission.

## Sharing and third parties

The app does not transmit Jira data to the developer or external services. It does not sell data or use it for advertising. If you contact the maintainer and supply information in a support request, that information is separate from the app's automatic data processing.

Your data is processed by Atlassian (Jira and Forge) under your agreement with Atlassian. See the [Atlassian Privacy Policy](https://www.atlassian.com/legal/privacy-policy).

## Data retention and deletion

The app has no developer-operated data store. Its issue data is held in browser memory during use, and its saved configuration remains in the Jira project property until overwritten or deleted. Atlassian controls retention of Jira data and platform records under your agreement with Atlassian.

To remove the app and its configuration, have an administrator delete the `time-left-config` property from each configured project, then uninstall the app. Uninstalling alone leaves the project properties in Jira. Disabling the countdown also leaves the saved configuration in place.

## Security

The app calls Jira through Atlassian's Forge Bridge over HTTPS. It has no developer-operated server and does not require users to provide API tokens. Authentication for those requests is managed by Jira and Forge.

## Children

The app is a workplace tool and is not directed at children.

## Changes to this policy

If the app's data handling changes, for example if a backend is added, this policy will be updated and the date above changed.