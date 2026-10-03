# DEBUG WITH BETTER BUGS

1. Reproduce the bug.
2. Open DevTools.
3. Keep Network tab open when API/WebSocket behavior matters.
4. Create a Better Bugs report.
5. Identify page/room, role, action, expected result, actual result, console error, and network/WebSocket error.
6. Determine whether the root cause is frontend, backend, transport, YouTube player state, or deployment config.
7. Fix the smallest root cause.
8. Add regression coverage where appropriate.
9. Reproduce the original failure again.
10. Run build/tests.
11. Do not declare the issue fixed until the original reproduction succeeds.

Remove tokens, cookies, passwords, and other secrets from reports before sharing or committing them.
