# AGENTS.md — YouTube Watch Party Project Rules

## Mission
Implement the assignment in the supplied specification as a working, explainable, deployable application. Do not add unrelated features until every required feature is verified.

## Source of truth
The assignment requirements are summarized in `docs/00-project-brief.md`, `docs/01-requirements.md`, and `docs/03-websocket-contract.md`.

## Engineering rules
1. Inspect existing code before editing.
2. Prefer the smallest implementation that satisfies the requirement.
3. Do not hide authorization problems in the frontend. Every privileged WebSocket event must be checked server-side.
4. Keep room state authoritative on the backend.
5. Treat client messages as untrusted input.
6. Validate room IDs, usernames, role values, YouTube video IDs, and event payloads.
7. Avoid secrets in source code.
8. Keep frontend and backend environment variables separate.
9. Add tests for permission boundaries and synchronization logic.
10. After meaningful changes, run the relevant tests and build.
11. Do not claim a feature works without actually testing it.

## Ponytail
If the Ponytail skill/plugin is installed, use it actively:
- Start with `/ponytail full`.
- After a feature batch: `/ponytail-review`.
- Before final submission: `/ponytail-audit`.
- Before final handoff: `/ponytail-debt`.

Ponytail is a constraint against unnecessary abstractions, duplicate code, speculative infrastructure, and feature creep. Do not use it to remove required validation, security, accessibility, or tests.

## Better Bugs
Use the Better Bugs browser extension when debugging the deployed/local browser experience. Capture:
- exact reproduction steps,
- screenshot,
- browser/OS information,
- console errors,
- Network/HAR data when WebSocket/API behavior is involved.

Never paste tokens, cookies, passwords, or private credentials into bug reports.

## Working order
Requirements → architecture → data model → backend room engine → WebSocket events → YouTube adapter → frontend → RBAC UI → tests → deployment → production smoke test → audit.

## Stop conditions
If a change breaks synchronization, permissions, reconnect behavior, or production configuration, stop adding features and fix the regression first.
