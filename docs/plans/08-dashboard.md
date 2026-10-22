# 08 · Dashboard

**Goal:** a web UI at `app.upwell.run` (repo `updateswell/upwell-cloud`) over the same API the
CLI uses. It adds nothing the API can't do; it makes it visible and approachable for people who
don't live in a terminal.

Last on purpose: the API, CLI and analytics must be stable first, so the dashboard is a thin
client and not where business logic lives.

## Scope (first version)

- Sign-in, org and project switcher (needs plan 07).
- Policy editor per environment: a form for the common fields (latest, minimum, OTA runtime,
  apply mode, messages, rollout) plus a JSON view with schema validation, a diff before publishing,
  the guardrail confirmation with impact, history and one-click rollback.
- Releases: list, add/edit notes, see which OTA update each entry maps to.
- "What would this device see?": the `explain()` playground for any build/runtime/platform.
- Analytics: installs by build and runtime, stranded share, adoption curves, prompt funnel,
  errors.
- Keys and environments management; copy-paste SDK and CLI snippets.

## Principles

- Every screen maps to API endpoints that already exist; if a screen needs new data, the API
  gets the endpoint first (and the CLI can use it too).
- Follows the Upwell design system (monochrome, Geist Mono; see `BRAND.md` in `upwell-docs`).

## Decisions to make when starting

- Framework and hosting (Next.js on Vercel next to the docs, or Cloudflare with the API).
- Charts library and how much of the docs site's UI components to share (copy, not a shared
  package, in a polyrepo).

## Definition of done

Fill in when the plan starts.
