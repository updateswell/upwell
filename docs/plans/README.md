# Upwell platform plans

Upwell is growing from one npm package into a library with tools around it. These plans break that work into pieces you can pick up one at a time, each in its own
session.

> Written 2026-10-22 (revised the same day after choosing the two-repo layout), when
> `upwell@0.1.3` was on npm and the docs and landing page were one Fumadocs app in `website/`.
> `PLAN.md` at the repo root is the original SDK plan (v1, milestones M0–M6); these plans cover
> everything after it.

> **Plan B (2026-11-12):** no hosted backend. Upwell is the library plus the CLI; `upwell publish`
> puts the policy on a GitHub gist or public repo instead of our own API. Plans 04, 07, 08 and 09
> are parked, 05 and 06 were rewritten. Why: [00 · Architecture](https://github.com/updateswell/upwell/blob/main/docs/plans/00-architecture.md#product).

## Order

| #   | Plan                                                                                                                            | Repo                 | Depends on | Status      |
| --- | ------------------------------------------------------------------------------------------------------------------------------- | -------------------- | ---------- | ----------- |
| 00  | [Architecture and decisions](00-architecture.md)                                                                                | both                 | —          | Read first  |
| 01  | [Restructure `upwell` into a workspace](01-workspace-restructure.md)                                                            | `upwell`             | —          | Done        |
| 02  | [`@upwell/core`](02-core-package.md)                                                                                            | `upwell`             | 01         | Done        |
| 03  | [`platform` repo and the landing page](https://github.com/updateswell/platform/blob/main/docs/plans/03-platform-and-landing.md) | `platform`           | 01         | Done        |
| 04  | [API: hosting on Cloudflare](https://github.com/updateswell/platform/blob/main/docs/plans/04-api.md)                            | `platform`           | 02, 03     | Parked      |
| 05  | [CLI](05-cli.md)                                                                                                                | `upwell`             | 02         | In progress |
| 06  | [SDK without hosting](06-sdk-without-hosting.md)                                                                                | `upwell`             | —          | In progress |
| 07  | [Analytics](https://github.com/updateswell/platform/blob/main/docs/plans/07-analytics.md)                                       | `platform`, `upwell` | 04, 06     | Parked      |
| 08  | [Accounts and auth](https://github.com/updateswell/platform/blob/main/docs/plans/08-accounts-and-auth.md)                       | `platform`           | 04         | Parked      |
| 09  | [Dashboard](https://github.com/updateswell/platform/blob/main/docs/plans/09-dashboard.md)                                       | `platform`           | 07, 08     | Parked      |

Next: **06 session 1** (zero-policy mode, small), then **05** (CLI, sessions 1–3), then the rest
of 06. The goal: a developer runs `npx @upwell/cli init` and `npx @upwell/cli publish` and has a
working setup without hosting anything, or skips the policy entirely.

## How to use these plans

- Each plan has **sessions**: a chunk of work sized for one sitting, ending in something
  committed and working. Do them in order inside a plan.
- Tick the checkboxes as you go and commit the plan with the work, so the next session (human or
  agent) knows where things stand. Update the status column above when a plan starts or finishes.
- Every plan ends with a **definition of done** and **open questions**. Answer open questions
  before the session that needs them, and move the answer into the plan's decisions.
- Decisions marked **(proposed)** are recommendations, not settled. Confirm or change them when
  the plan starts.
- Plans for the `platform` repo (03, 04, 07, 08, 09) live in
  [`updateswell/platform/docs/plans`](https://github.com/updateswell/platform/tree/main/docs/plans)
  since plan 03 finished; the links above point there. Keep the status column in both READMEs
  in sync.
- When something here turns out wrong, fix the plan instead of working around it.
