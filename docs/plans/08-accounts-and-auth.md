# 08 · Accounts and auth

**Goal:** people can sign up, create organizations and projects, invite teammates and manage
keys, without the owner hand-creating projects with the bootstrap token. This is what turns the
private beta into a public product, and the dashboard (plan 09) depends on it.

Kept deliberately short: details depend on what's learned from plans 04–07 and early users. Fill
in the sessions when this plan starts.

## Scope

- Users (email + passkey/magic link, GitHub OAuth), organizations, memberships with roles
  (owner, admin, member, read-only).
- Projects belong to organizations; existing beta projects are migrated to an org owned by their
  user.
- Session auth for the dashboard; API keys stay the auth for CLI, CI and agents (keys created by a
  user are tied to the org and show who created them).
- CLI login without copying keys: OAuth device code flow (`upwell login` opens the browser).
- Audit log entries show the user or key behind every change.
- Terms of service, privacy policy, a data processing description (needed for analytics).
- Billing hooks (plan limits per org) even if everything is free at first.

## Decisions to make when starting

- Build vs buy: a library on Workers + D1 (for example Better Auth) vs a hosted provider (Clerk,
  WorkOS, Auth0). Trade-offs: cost at scale, lock-in, Workers compatibility, how much UI comes
  ready-made.
- Where sessions are validated: the API Worker (single source) is proposed, with the dashboard
  calling the API rather than the database.

## Definition of done

- Self-serve sign-up to first published policy without contacting anyone.
- The bootstrap token is no longer needed for normal operation.
