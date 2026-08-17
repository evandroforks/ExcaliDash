---
name: excalidash-diagrams
description: "Create or edit editable technical diagrams with the registered Excalidraw and ExcaliDash MCP tools. Use when the user asks for an architecture, flow, sequence, hierarchy, relationship, or other structured diagram as an editable Excalidraw or ExcaliDash artifact. Do not use for raster illustrations or image editing."
---

# ExcaliDash diagrams

## Create a drawing

1. Call `read_me` from the Excalidraw MCP server before authoring elements.
   Treat its response as the authoritative element-format reference.
2. Design the smallest diagram that clearly represents the requested
   relationships, hierarchy, or sequence.
3. Call `create_view` to author and render the elements.
4. Inspect the rendered result when the host displays it. Correct layout,
   labels, overlaps, or missing relationships with another `create_view` call
   when necessary.
5. Call `read_checkpoint` with the latest checkpoint returned by
   `create_view` to obtain the final elements.
6. Use `list_collections` only when the user requested a specific collection
   and its identifier is unknown. Ask the user to choose if more than one
   collection matches the request.
7. Call `save_to_excalidash` with the final elements and requested name. If no
   name was provided, derive a concise name from the diagram's subject. Pass
   the resolved collection identifier as `collection_id` when applicable.
8. Return the saved ExcaliDash URL.

## Edit an existing drawing

1. Use `list_drawings` when the drawing identifier is unknown. Ask the user to
   choose if more than one drawing matches the request.
2. Call `get_drawing` and preserve its current version and `appState`.
3. Call `read_me` before changing elements.
4. Render the revised elements with `create_view` and inspect the result when
   the host displays it. Correct it with another `create_view` call when
   necessary, then retrieve the elements with `read_checkpoint` using the
   latest checkpoint.
5. Call `update_drawing` with the drawing identifier, revised elements, and
   version returned by `get_drawing`. Pass the preserved `appState` as
   `app_state` unless the requested edit intentionally changes it.
6. If the update reports a version conflict, fetch the drawing again,
   reconcile the user's requested changes with the latest elements and app
   state, rerender and inspect it with `create_view`, retrieve the latest
   checkpoint, and retry with the newly fetched version. Never force an update
   with a stale version. Stop and report the conflict if it cannot be
   reconciled safely or concurrent changes keep preventing completion.
7. Return the updated ExcaliDash URL.

## Constraints

- Use the registered MCP tools instead of reproducing the Excalidraw schema
  from memory or reading a machine-specific filesystem path.
- Do not silently replace an editable diagram with a raster image.
- Do not invent relationships or facts absent from the user's request or
  provided sources.
- If inline rendering is unavailable, continue through `read_checkpoint` and
  save the drawing so the user can inspect it in ExcaliDash.
- If a required MCP tool is unavailable, report the missing tool and stop
  before claiming that the drawing was created, updated, or saved.
