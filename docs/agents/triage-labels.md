# Triage label vocabulary

The following labels are used to manage the lifecycle of issues in this repository.

| Label | Description |
|-------|-------------|
| `needs-triage` | New issues that need evaluation by a maintainer. |
| `needs-info` | Waiting for the reporter to provide more information. |
| `ready-for-agent` | Fully specified issues that an agent can pick up and implement autonomously. |
| `ready-for-human` | Issues that require human intervention or implementation. |
| `wontfix` | Issues that will not be actioned. |

## Process

1. New issues are created with no labels or `needs-triage`.
2. A maintainer (or the `triage` skill) evaluates the issue and moves it to `ready-for-agent`, `ready-for-human`, `needs-info`, or `wontfix`.
3. Agents should prioritize issues with the `ready-for-agent` label.
