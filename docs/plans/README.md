# Upwell platform plans

Upwell is growing from one npm package into a small platform: the SDK, a docs site, a hosted
API on Cloudflare (policy hosting + analytics), a CLI for developers and AI agents, and, last, a
dashboard. These plans break that work into pieces you can pick up one at a time, each in its own
session.

> Written 2026-10-22, when `upwell@0.1.3` was on npm, the docs site lived in `website/` of this
> repo, and nothing below existed yet. `PLAN.md` at the repo root is the original SDK plan (v1,
> milestones M0–M6); these plans cover everything after it.

## Order

| #   | Plan                                                                   | Repo                                 | Depends on | Status      |
| --- | ---------------------------------------------------------------------- | ------------------------------------ | ---------- | ----------- |
| 00  | [Architecture and decisions](00-architecture.md)                       | —                                    | —          | Read first  |
| 01  | [Polyrepo split: move the docs site out](01-polyrepo-split.md)         | `upwell` → `upwell-docs`             | —          | Not started |
| 02  | [`@upwell/core`: a dependency-free shared package](02-core-package.md) | `upwell`                             | —          | Not started |
| 03  | [API foundation: hosting on Cloudflare](03-api-foundation.md)          | `upwell-api` (new)                   | 02         | Not started |
| 04  | [CLI for developers and agents](04-cli.md)                             | `upwell-cli` (new)                   | 02, 03     | Not started |
| 05  | [SDK cloud integration](05-sdk-cloud.md)                               | `upwell`                             | 03         | Not started |
| 06  | [Analytics](06-analytics.md)                                           | `upwell-api`, `upwell`, `upwell-cli` | 03, 05     | Not started |
| 07  | [Accounts and auth](07-accounts-and-auth.md)                           | `upwell-api`                         | 03         | Later       |
| 08  | [Dashboard](08-dashboard.md)                                           | `upwell-cloud` (new)                 | 06, 07     | Last        |

01 and 02 don't depend on each other and can run in either order. The critical path to a usable
product is **02 → 03 → 04 → 05**: at that point a developer can run `upwell init`, push a policy, and
point the SDK at it without hosting anything.

## How to use these plans

- Each plan has **sessions**: a chunk of work sized for one sitting, ending in something
  committed and working. Do them in order inside a plan.
- Tick the checkboxes as you go and commit the plan with the work, so the next session (human or
  agent) knows where things stand. Update the status column above when a plan starts or finishes.
- Every plan ends with a **definition of done** and **open questions**. Answer open questions
  before the session that needs them, and move the answer into the plan's decisions section.
- Decisions marked **(proposed)** are recommendations, not settled. Confirm or change them when the
  plan starts.
- When something here turns out wrong, fix the plan instead of working around it.
