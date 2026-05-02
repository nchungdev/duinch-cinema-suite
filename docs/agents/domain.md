# Domain docs

This repository uses a **multi-context** layout for domain documentation.

## Layout

The root `CONTEXT-MAP.md` file defines the different contexts within this monorepo and points to their respective `CONTEXT.md` files.

## Consumer Rules

- Before starting a task, the agent should read `CONTEXT-MAP.md` to identify relevant contexts.
- For a specific context (e.g., `frontend`), the agent should read its corresponding `CONTEXT.md` to understand the domain language and architecture.
- Architectural decisions are recorded as ADRs (Architectural Decision Records) under `docs/adr/` or within the context-specific `docs/adr/` directories.
