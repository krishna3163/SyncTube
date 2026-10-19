---
name: project-memory
description: Enforce reading and updating PROJECT_MEMORY.md for all tasks in SyncTube
---

# Project Memory & Context Protocol

When working on the **SyncTube** project:

1. **Always Read `PROJECT_MEMORY.md` First**:
   - Before opening dozens of files or performing redundant codebase analysis, inspect `PROJECT_MEMORY.md` at the project root.
   - It provides high-density architecture mappings, component directories, sync engine formulas, and feature flag schemas.

2. **Always Update `PROJECT_MEMORY.md` on Changes**:
   - Whenever any file is added, modified, refactored, or removed, record the change in the **AI Memory Ledger & Changelog** section of `PROJECT_MEMORY.md`.
   - Update relevant architecture, state, or feature flag tables if your changes impact them.
   - Write clear, concise, structured entries that future AI agents and human developers can understand in one read.

3. **Maintain Feature Button Switch Isolation**:
   - Ensure all auxiliary features (chat, call, reactions, ambient glow, diagnostics, requests, playlist) remain cleanly modular and toggleable via `client/src/utils/featureFlags.ts`.
   - Never allow any auxiliary feature to crash, stall, or corrupt the core synchronized video player.
