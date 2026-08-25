# Excalidraw and ExcaliDash MCP integration

**Status:** Proposed; this record describes intended behavior that has not
been implemented.

## Table of contents

- [Context](#context)
- [Goals](#goals)
- [Non-goals](#non-goals)
- [Current state](#current-state)
- [Architecture](#architecture)
  - [Ownership boundaries](#ownership-boundaries)
  - [Canonical scene contract](#canonical-scene-contract)
  - [Checkpoint snapshot contract](#checkpoint-snapshot-contract)
  - [Manual edit commit barrier](#manual-edit-commit-barrier)
  - [Create and update flows](#create-and-update-flows)
  - [Transport and security policy](#transport-and-security-policy)
  - [Large-scene evolution](#large-scene-evolution)
  - [Distribution and compatibility](#distribution-and-compatibility)
- [Invariants](#invariants)
- [Implementation order](#implementation-order)
- [Validation and acceptance](#validation-and-acceptance)
- [Risks and mitigations](#risks-and-mitigations)
- [Alternatives considered](#alternatives-considered)
- [Authoritative sources](#authoritative-sources)

## Context

ExcaliDash and the upstream Excalidraw MCP server solve complementary parts of
one diagram workflow. The Excalidraw MCP app authors and renders a scene,
provides a fullscreen editor, and keeps checkpoint state. The ExcaliDash MCP
server authenticates to a self-hosted ExcaliDash instance and owns durable
creation and version-aware updates.

The current integration instructions assume that an agent can read the final
checkpoint after a user edits the inline canvas. That assumption is false. The
upstream checkpoint reader is marked for app use, while the model-visible
creation tool returns a checkpoint identifier rather than a persistable scene.
The model can reuse the elements it originally authored, but those elements do
not include later manual edits and may still contain authoring directives that
are not valid durable Excalidraw elements.

This mismatch spans the upstream MCP app, its scene resolver and checkpoint
stores, the local ExcaliDash MCP server, the bundled agent skill, and
user-facing setup guidance. It therefore needs a durable cross-component
record rather than an isolated tool addition.

## Goals

- Persist the exact committed element state that the user sees after editing
  an Excalidraw MCP canvas.
- Define one canonical, persistable scene representation shared by the server,
  widget, checkpoint stores, and ExcaliDash.
- Preserve a clear boundary between temporary authoring commands and durable
  ExcaliDash storage.
- Provide a model-visible, read-only snapshot contract without making the
  widget's private checkpoint reader the general integration API.
- Preserve ExcaliDash optimistic concurrency when updating existing drawings.
- Keep the ExcaliDash API key and persistence policy inside the ExcaliDash MCP
  server.
- Make failures explicit so an agent cannot claim that an outdated, malformed,
  or partial drawing was saved.
- Keep a compatible evolution path for scenes that are too large to move
  safely through model context.

## Non-goals

- Merging the two MCP servers or making either repository own the other's
  runtime responsibilities.
- Adding ExcaliDash credentials or API calls to the upstream Excalidraw MCP
  server.
- Making private checkpoints anonymously readable over a remote transport.
- Replacing the Excalidraw MCP app's renderer, editor, or runtime-selected
  checkpoint stores.
- Capturing binary files or other scene assets not currently supported by the
  ExcaliDash MCP contract.
- Capturing manual `appState` or file changes in the initial snapshot contract.
  Existing `appState` and files remain separate durable concerns and must be
  preserved when an element-only update does not intentionally replace them.
- Building partial scene query, patch, or transfer-handle tools before the
  baseline bridge is measured and shown to need them.

## Current state

The upstream Excalidraw MCP registers its authoring and checkpoint operations
in `src/server.ts`. The creation path resolves checkpoint commands and stores
an element array, while the widget separately converts authoring shorthand and
applies render-only directives. The server and widget do not currently share
one resolver, so deletion, restoration, labels, and viewport directives can
produce a stored scene that differs from the scene displayed by the widget.

The widget writes manual element edits back through an app-oriented checkpoint
operation in `src/edit-context.ts`. That save is debounced, its failure is not
propagated to model context, and fullscreen exit does not establish an awaited
server-side commit barrier. Widget `localStorage` may therefore be newer than
the checkpoint returned by the server.

The checkpoint store interface and its runtime implementations are defined in
`src/checkpoint-store.ts` in the upstream repository. The current payload is
elements-only. Storage limits, retention, and implementation selection remain
code-owned and must not be duplicated here. A process-local memory fallback
cannot provide cross-request continuity in a distributed remote deployment.

The [ExcaliDash MCP implementation](../mcp/src/index.ts) accepts complete
element arrays when creating or updating drawings. It owns the ExcaliDash API
key and maps backend conflicts into tool failures. Scene updates are protected
only when the caller sends the drawing version. The backend's
[drawing create and update routes](../backend/src/routes/dashboard/drawingCreateUpdateRoutes.ts)
own authorization, persistence, and drawing-version semantics.

The current [diagram workflow skill](../mcp/skills/excalidash-diagrams/SKILL.md)
and [MCP operations guide](../mcp/README.md) instruct agents to call the
app-oriented checkpoint reader. Those files describe a workflow that cannot be
completed reliably with the current model-facing contract. This proposed
record does not make that workflow available by itself.

## Architecture

### Ownership boundaries

| Component | Architectural ownership |
| --- | --- |
| Excalidraw MCP app | Authoring, rendering, interactive element editing, canonical scene resolution, checkpoint lifecycle, and export of committed elements |
| ExcaliDash MCP server | ExcaliDash authentication, collection selection, durable create/update operations, and version-conflict handling |
| ExcaliDash backend | Authorization, database persistence, drawing versioning, and the durable drawing representation |
| Agent skill | Ordering calls across both MCP servers and stopping safely when a required contract is unavailable |
| MCP host and model | User interaction and orchestration; never authoritative storage for the scene |

The normal local data path is:

```text
authoring commands -> shared scene resolver -> canonical elements
                                             |-> widget render/editor
                                             `-> checkpoint store

manual elements -> awaited checkpoint commit -> canonical snapshot
canonical snapshot -> ExcaliDash MCP -> durable ExcaliDash drawing
```

Checkpoint identifiers and revisions are capabilities scoped to the
Excalidraw MCP runtime. Drawing identifiers and versions are durable ExcaliDash
concepts. Neither server may infer one identifier type from the other.

### Canonical scene contract

The Excalidraw MCP server and widget will use one shared resolver for the final
scene. The resolver accepts authoring commands plus an optional canonical base
checkpoint and produces two separate outputs:

- Canonical Excalidraw elements suitable for the editor, checkpoint storage,
  and ExcaliDash persistence.
- Render-only instructions used by the widget for camera movement and
  progressive presentation.

Render-only commands, restore directives, delete directives, and shorthand
must never enter the canonical element array. Labels and other supported
shorthand must be converted to stable Excalidraw elements without regenerating
identifiers unexpectedly. Deletes must apply identically to base and newly
authored elements. Ambiguous command streams, including conflicting restore
directives, must be rejected rather than resolved differently by the server
and widget.

The server must resolve and validate the canonical scene independently of MCP
App rendering so a host without inline UI can still save a correct drawing.
The widget may use render-specific data, but its final visible element set must
match the canonical server result. Manual editor changes already expressed as
Excalidraw elements pass through the same validation before checkpoint commit.

### Checkpoint snapshot contract

The Excalidraw MCP server will add a dedicated model-visible, read-only tool
named `get_checkpoint_elements`. It accepts a checkpoint identifier, loads the
checkpoint through the existing store abstraction, and returns canonical live
elements plus synchronization metadata as structured MCP output. A concise
text result may accompany the structured data for hosts that do not consume
structured output.

The new tool is distinct from the app-oriented checkpoint reader. Its contract
is limited to the data an agent needs for persistence, while the widget reader
remains free to evolve with app internals. App visibility metadata is a host
routing signal, not an authorization boundary; checkpoint access policy must
be enforced independently.

The snapshot contract must:

- Return only canonical live elements and checkpoint synchronization metadata.
- Mark the operation as read-only in MCP annotations.
- Validate the checkpoint envelope and identifier through the store boundary.
- Distinguish missing, expired, invalid, corrupt, not-yet-committed, and
  oversized snapshots with stable machine-readable failures.
- Avoid silently returning an empty drawing when a checkpoint cannot be read.
- Measure payload bounds consistently in bytes in the code that owns them.
- Preserve the same contract across the store implementations selected by the
  runtime.

The tool output is a snapshot, not a mutable reference. Changes after the
reported checkpoint revision require another retrieval. The creation tool must
not claim a read-only annotation while it creates checkpoint state.

### Manual edit commit barrier

Reading the server-side checkpoint while a manual save is still pending could
return a stale scene. A successful persistence workflow therefore requires an
explicit commit barrier rather than relying on debounce timing.

Checkpoint state will carry a monotonic revision managed by the Excalidraw MCP
server. Initial canonical resolution establishes a revision, and each accepted
manual edit save advances it. Legacy checkpoint payloads without revision
metadata must be normalized inside the store boundary rather than by callers.

Before the widget signals that manual editing is complete, exits fullscreen,
or tears down, it must flush the latest live elements and await checkpoint
persistence. Only after the save succeeds may it publish the committed
revision to model context. Save failure must remain visible and must not be
reported alongside a success diff.

The model-visible snapshot tool returns the committed revision and may accept
a minimum expected revision. If the store has not reached the requested
revision, it reports a not-ready result instead of returning stale elements.
Widget-local cached state must be reconciled into the server checkpoint before
it is presented as the current committed scene.

The skill must wait for committed state after manual editing. If the host
cannot provide the commit signal, it may persist the unchanged canonical
elements authored by the model only when no manual edit occurred and the
limitation is explicit. Otherwise it must stop and ask the user how to proceed.

### Create and update flows

For a new drawing, the skill authors and renders the scene, obtains the latest
committed canonical snapshot, and passes its elements to the ExcaliDash
creation tool. Collection lookup remains conditional on the user's request.
The URL returned by ExcaliDash is the durable result.

For an existing drawing, the skill first reads the durable drawing and retains
its version and `appState`. It renders the requested revision, obtains the
latest committed element snapshot, and updates the same drawing with the
previously read version. Element or `appState` replacement through the MCP must
require optimistic concurrency; rename-only updates may remain independent of
scene versions.

Unless the requested operation intentionally changes it through a future
supported contract, an element-only update preserves the fetched `appState`
and leaves files under their existing durable owner. The workflow must not
promise that manual viewport changes were captured by an elements-only
checkpoint.

On a version conflict, the skill refetches the durable drawing, reconciles the
requested edit, rerenders, retrieves a new committed snapshot, and retries with
the new version. Retries must be bounded. An unresolved conflict is reported to
the user rather than bypassed with a stale or omitted version.

A missing or expired checkpoint never falls back silently to elements from an
older drawing. Recovery recreates or rerenders the intended scene, obtains a
new committed checkpoint, and only then persists it.

### Transport and security policy

The initial integration targets both servers running locally over stdio. In
that environment, the model-facing snapshot tool is available to the connected
MCP host and does not create a network endpoint.

The shared Excalidraw server factory must make model-readable checkpoint export
an explicit transport policy. Local stdio may enable it. A remote transport
must not advertise a reliable export contract unless it provides authenticated,
session-scoped checkpoint capabilities and a shared store that survives the
requests participating in the workflow. A process-local memory store is an
explicitly degraded mode, not durable cross-request state.

The snapshot contract must not expose arbitrary filesystem paths, checkpoint
directory contents, or listing operations. A caller must already possess an
authorized checkpoint capability. Logs and errors must not include scene
contents or credentials.

### Large-scene evolution

The baseline bridge transfers the resolved element array through MCP model
context. This is intentionally the first implementation because it is small,
portable, and adequate for ordinary scenes. Existing checkpoint restore and
incremental mutation behavior should continue to avoid resending an entire
scene during model-authored edits.

Before extending the architecture, measure serialized snapshot size, model
context usage, latency, and failure rates using representative local scenes.
If the baseline crosses code-owned safety limits or becomes operationally
unreliable, create a follow-up architecture record for two complementary
capabilities:

- Bounded scene inspection and mutation through summary, filtered query, and
  revision-aware patch operations.
- Direct local persistence through an opaque, expiring transfer handle so the
  scene payload does not pass through model context.

A future transfer handle must resolve only inside a configured exchange
boundary, reject arbitrary paths, validate payload ownership and size, and be
cleaned up after use or expiry. The ExcaliDash MCP server remains the only
component that holds the ExcaliDash credential and performs the durable API
call.

### Distribution and compatibility

Until the generic snapshot contract is accepted upstream, the Excalidraw MCP
change must live in a maintained fork rather than as an untracked modification
to a checkout. Installation guidance must use the package manager and build
entry points declared by that repository and must not embed machine-specific
absolute paths.

The ExcaliDash MCP package continues to distribute the diagram skill as one
authoritative artifact. Its [package lifecycle](../mcp/package.json) and
[skill link installer](../mcp/scripts/manage-skill-links.mjs) own build and
discovery details; this record does not duplicate their maintained destination
list. Install and remove operations must remain idempotent and must not replace
unrelated real directories.

Runtime and distribution metadata must derive package identity from one source
so reported versions cannot drift. Compiled artifacts must be regenerated from
reviewed source before installation or release. Operational documentation must
derive required API permissions from the backend authorization policy and must
use the upstream repository's declared package manager.

## Invariants

1. The Excalidraw MCP app owns mutable checkpoint state; ExcaliDash owns the
   durable drawing.
2. Checkpoint storage contains canonical Excalidraw elements, never authoring
   shorthand, restore/delete commands, or render-only camera directives.
3. Server and widget use one resolver and produce an equivalent final element
   scene for the same commands and base checkpoint.
4. The widget-oriented checkpoint tools retain app visibility metadata and are
   not the supported model integration contract.
5. A scene saved after manual editing comes from an acknowledged checkpoint
   revision, never from an unconfirmed debounce window or unreconciled cache.
6. Missing, expired, stale, invalid, corrupt, or oversized checkpoint state
   produces an explicit failure and cannot be represented as a successful
   empty drawing.
7. Existing drawing scene updates preserve optimistic concurrency and never
   force an overwrite after a version conflict.
8. The ExcaliDash credential remains confined to the ExcaliDash MCP process.
9. Remote checkpoint export remains unavailable until authenticated session
   isolation and shared checkpoint continuity are implemented and validated.
10. The skill may orchestrate data movement but is never the source of truth
    for checkpoint or drawing state.
11. User documentation, agent instructions, and manifests describe only tools
    and permissions available to their intended callers.
12. Paths in shared documentation and skill instructions are portable; local
    installation paths belong in client configuration.

## Implementation order

1. Establish a maintained Excalidraw MCP fork and define typed authoring,
   canonical scene, checkpoint envelope, snapshot output, and failure schemas.
2. Extract one shared scene resolver used by server and widget. Correct delete
   and restore semantics, canonicalize shorthand, separate render directives,
   reject ambiguous inputs, and validate the checkpoint envelope.
3. Add checkpoint revision metadata and compatibility normalization for stored
   payloads created before the schema change. Distinguish storage failures that
   currently collapse into a missing checkpoint result.
4. Add the widget commit barrier so completing manual editing flushes pending
   elements, waits for checkpoint persistence, reconciles cached state, and
   reports the committed revision only after success.
5. Add `get_checkpoint_elements` behind the explicit transport policy. Keep the
   widget-oriented reader unchanged, correct mutability annotations, update
   model-facing metadata, and rebuild packaged artifacts from source.
6. Add focused Excalidraw MCP tests for resolver equivalence, checkpoint
   synchronization, store contracts, input validation, error semantics,
   visibility metadata, and transport policy.
7. Update the ExcaliDash MCP contract so scene replacement requires the fetched
   drawing version. Add tests for API request construction, permission and
   authentication failures, creation, updates, and conflict recovery.
8. Update the bundled skill and operations guide to use the canonical snapshot
   contract. Correct current tool-visibility, API-permission, package-manager,
   and package-identity inconsistencies without presenting proposed behavior as
   available before its code ships.
9. Validate the complete local stdio workflow from model authoring through a
   manual widget edit to durable ExcaliDash retrieval. Validate headless
   creation and existing-drawing update paths separately.
10. Package the maintained server and skill, verify install/remove behavior,
    and confirm discovery in each supported local agent host.
11. Measure large-scene behavior. Start a separate architecture record before
    implementing partial query/patch or transfer-handle extensions.

The order above expresses architectural dependencies and completion evidence.
Commit sequencing, ownership assignments, and rollout tracking belong in an
issue or merge request.

## Validation and acceptance

The record may move to implemented only when all of the following are true:

- Shared resolver fixtures prove that shorthand, labels, deletes, restored
  checkpoints, and render directives produce the same final canonical elements
  in server and widget code. Ambiguous restores are rejected.
- No authoring or render-only directive reaches an ExcaliDash drawing, and the
  saved labels, arrows, bindings, and identifiers open correctly in its editor.
- A host without MCP App rendering can still obtain and save the canonical
  scene produced by the server.
- The model-facing snapshot tool returns structured canonical elements and a
  committed revision, while widget-oriented tools retain app visibility
  metadata and the public manifest agrees with the intended caller contract.
- A scene edited manually and then retrieved matches the elements visible after
  the awaited save barrier. Reloaded widget cache cannot supersede the server
  without first being committed.
- Retrieval before a requested revision is committed returns an explicit
  not-ready failure rather than stale data.
- Missing, expired, malformed, corrupt, and oversized checkpoint cases fail
  with stable meanings, and byte-boundary tests include non-ASCII content.
- Contract tests exercise every checkpoint store selected by runtime entry
  points. Remote modes either use shared continuity or declare and test their
  degraded behavior.
- A new drawing created through the combined workflow matches the final
  checkpoint when read back from ExcaliDash.
- An existing drawing element update preserves its intended `appState` and
  files, requires the fetched version, and reports or safely reconciles
  concurrent modification. Rename-only behavior remains covered separately.
- The skill stops when required tools or commit evidence are unavailable and
  never reports an unsaved or stale scene as durable.
- Required API permissions in operational documentation agree with backend
  authorization, and the documented source-build commands agree with package
  metadata.
- Package builds reproduce the reviewed server and skill; runtime, manifest,
  and distribution identity agree; shared documentation contains no local
  absolute paths.

Validation includes unit tests for canonical state and failure contracts,
integration tests at both MCP boundaries, and an end-to-end local stdio test
that includes a real manual canvas edit. Test implementation details and live
delivery progress remain outside this record.

## Risks and mitigations

| Risk | Mitigation |
| --- | --- |
| The stored checkpoint differs from the rendered canvas | Use one canonical resolver, persist only its element output, and test server/widget equivalence |
| The model reads before a debounced manual edit is stored | Require an awaited flush, monotonic revisions, and an optional minimum revision on retrieval |
| A full scene consumes excessive model context | Enforce code-owned response bounds, measure representative scenes, and design a separate transfer handle only when justified |
| Checkpoint capability leaks state on a remote deployment | Require authenticated session scoping and shared continuity; do not treat app visibility metadata as authorization |
| A local fork silently diverges from upstream | Keep the change in a maintained fork, minimize the generic contract, and offer it upstream independently of ExcaliDash behavior |
| The skill saves stale elements after a missing tool or checkpoint | Treat unavailable contracts and checkpoint failures as terminal until the scene is recreated or the user chooses a safe fallback |
| Concurrent ExcaliDash edits are overwritten | Require drawing versions for scene replacement, bound reconciliation retries, and stop on unresolved conflicts |
| Documentation claims private tools or insufficient permissions are usable | Validate workflows against runtime metadata and backend authorization during implementation |
| A future file bridge permits path traversal or leaves artifacts behind | Use opaque handles, a configured exchange boundary, strict validation, and cleanup on success or expiry |

## Alternatives considered

**Expose the existing app-oriented checkpoint reader.** Rejected because it
couples the model to the widget's internal response shape and still returns a
raw checkpoint that may not equal the canonical rendered scene. A dedicated
snapshot contract can be narrower, typed, canonical, and transport aware.

**Have the ExcaliDash MCP read temporary checkpoint files.** Rejected because
it couples one server to another server's storage path and implementation,
fails for non-file stores, and creates avoidable filesystem security concerns.

**Put the ExcaliDash save operation inside the upstream Excalidraw MCP.**
Rejected because it mixes persistence products, duplicates configuration, and
places the ExcaliDash credential in a component that does not own it.

**Merge both MCP servers.** Rejected because authoring and durable persistence
have independent distribution, runtime, and maintenance boundaries.

**Always reuse the elements originally sent to `create_view`.** Retained only
as an explicitly limited fallback when the input is already canonical and no
manual edit occurred. It cannot be the normal persistence path because it can
lose user edits, restored state, and authoring-to-scene conversion.

## Authoritative sources

- [ExcaliDash MCP implementation](../mcp/src/index.ts)
- [Diagram workflow skill](../mcp/skills/excalidash-diagrams/SKILL.md)
- [MCP operations guide](../mcp/README.md)
- [ExcaliDash MCP package lifecycle](../mcp/package.json)
- [Skill link installer](../mcp/scripts/manage-skill-links.mjs)
- [ExcaliDash drawing create and update routes](../backend/src/routes/dashboard/drawingCreateUpdateRoutes.ts)
- [ExcaliDash drawing read routes](../backend/src/routes/dashboard/drawingReadRoutes.ts)
- [ExcaliDash API authorization](../backend/src/middleware/auth.ts)
- [Upstream Excalidraw MCP server registration](https://github.com/excalidraw/excalidraw-mcp/blob/main/src/server.ts)
- [Upstream Excalidraw scene resolver and widget](https://github.com/excalidraw/excalidraw-mcp/blob/main/src/mcp-app.tsx)
- [Upstream Excalidraw widget edit synchronization](https://github.com/excalidraw/excalidraw-mcp/blob/main/src/edit-context.ts)
- [Upstream Excalidraw checkpoint stores](https://github.com/excalidraw/excalidraw-mcp/blob/main/src/checkpoint-store.ts)
- [Upstream Excalidraw MCP package metadata](https://github.com/excalidraw/excalidraw-mcp/blob/main/package.json)
