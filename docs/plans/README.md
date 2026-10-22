# Upwell platform plans

Upwell is growing from one npm package into a library with tools around it plus a hosted
platform. These plans break that work into pieces you can pick up one at a time, each in its own
session.

> Written 2026-10-22 (revised the same day after choosing the two-repo layout), when
> `upwell@0.1.3` was on npm and the docs and landing page were one Fumadocs app in `website/`.
> `PLAN.md` at the repo root is the original SDK plan (v1, milestones M0–M6); these plans cover
> everything after it.

## Order

| #   | Plan                                                                 | Repo                 | Depends on                 | Status      |
| --- | -------------------------------------------------------------------- | -------------------- | -------------------------- | ----------- |
| 00  | [Architecture and decisions](00-architecture.md)                     | both                 | —                          | Read first  |
| 01  | [Restructure `upwell` into a workspace](01-workspace-restructure.md) | `upwell`             | —                          | Not started |
| 02  | [`@upwell/core`](02-core-package.md)                                 | `upwell`             | 01                         | Not started |
| 03  | [`platform` repo and the landing page](03-platform-and-landing.md)   | `platform` (new)     | 01                         | Not started |
| 04  | [API: hosting on Cloudflare](04-api.md)                              | `platform`           | 02, 03                     | Not started |
| 05  | [CLI](05-cli.md)                                                     | `upwell`             | 02 (04 for cloud commands) | Not started |
| 06  | [SDK cloud integration](06-sdk-cloud.md)                             | `upwell`             | 04                         | Not started |
| 07  | [Analytics](07-analytics.md)                                         | `platform`, `upwell` | 04, 06                     | Not started |
| 08  | [Accounts and auth](08-accounts-and-auth.md)                         | `platform`           | 04                         | Later       |
| 09  | [Dashboard](09-dashboard.md)                                         | `platform`           | 07, 08                     | Last        |

After 01, plans 02 and 03 are independent. The CLI's local commands (05, sessions 1–2) only need
02, so they can ship before the API exists. The path to a usable hosted product is
**01 → 02 → 03 → 04 → 05 → 06**: a developer runs `npx @upwell/cli init`, pushes a policy and
points the SDK at it without hosting anything.

## How to use these plans

- Each plan has **sessions**: a chunk of work sized for one sitting, ending in something
  committed and working. Do them in order inside a plan.
- Tick the checkboxes as you go and commit the plan with the work, so the next session (human or
  agent) knows where things stand. Update the status column above when a plan starts or finishes.
- Every plan ends with a **definition of done** and **open questions**. Answer open questions
  before the session that needs them, and move the answer into the plan's decisions.
- Decisions marked **(proposed)** are recommendations, not settled. Confirm or change them when
  the plan starts.
- Plans for the `platform` repo live here until that repo exists; plan 03 moves them (and keeps a
  pointer here).
- When something here turns out wrong, fix the plan instead of working around it.
