# Testing and QA

## Automated tests
Backend:
- permission checks
- room manager
- room code generation
- video ID validation
- event validation
- join/play/pause/seek/change
- role assignment/removal
- forbidden event rejection

Frontend:
- room UI
- role-aware controls
- socket state updates
- YouTube adapter behavior

## Manual two-browser test
1. Browser A = Host.
2. Browser B = Participant.
3. A creates room; B joins.
4. A plays → B follows.
5. A pauses → B follows.
6. A seeks → B follows.
7. A changes video → B receives it.
8. A promotes B to Moderator.
9. B can control playback.
10. A demotes B.
11. B loses playback control.
12. A removes B.
13. B reconnects and cannot regain removed permissions.

## Better Bugs workflow
1. Reproduce in browser.
2. Open DevTools Network tab.
3. Reproduce WebSocket/API failure.
4. Create Better Bugs report.
5. Record role, action, expected state, actual state, console/network error.
6. Give the report/context to the coding agent.
7. Fix root cause.
8. Re-run the reproduction.
9. Add regression coverage when practical.

Never commit raw reports containing private information.

## Production smoke test
Run the same two-browser test against the public URLs.
