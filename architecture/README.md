# Architecture records

This directory contains durable architecture plans and decision records for
ExcaliDash. The records explain cross-component ownership, why integration
boundaries have their shape, which invariants must survive future changes, and
how to recognize a complete implementation.

They do not replace executable contracts. Code and configuration own current
behavior and values, while tests and fixtures own executable expectations.

## Index

- [Excalidraw and ExcaliDash MCP integration](excalidraw-excalidash-mcp-integration.md):
  defines canonical scene ownership, checkpoint synchronization, durable
  persistence, agent orchestration, and the evolution path for large scenes.

Keep lifecycle status in each record rather than duplicating it here.

## Lifecycle

A proposed record describes intended behavior and is not current
functionality. After implementation and validation, update it to describe
actual behavior and mark it implemented. Preserve a superseded record as
history, mark it superseded, and link to its replacement.

Keep temporary delivery checklists in the issue or merge request. Preserve
durable rationale, boundaries, risks, and acceptance criteria here.

## Sources of truth

- Repository instruction files contain short, current, load-bearing
  invariants.
- Architecture records contain extended context and architectural decisions.
- Code and configuration define executable behavior and current values.
- Tests and fixtures define executable expectations.
- User documentation defines setup, operation, and user-visible behavior.

Resolve disagreements by identifying the approved decision and updating all
coupled artifacts in the same change.

## Maintenance

- Update the relevant record when its rationale, boundary, risk, or acceptance
  criteria change.
- Update repository instructions when a current cross-file invariant changes.
- Do not copy maintained inventories, defaults, versions, limits, or
  deployment-specific values into records; point to their authoritative
  source.
- Keep links valid and lifecycle status unambiguous.
