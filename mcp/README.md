# ExcaliDash MCP Server

MCP (Model Context Protocol) server that exposes ExcaliDash drawings and collections
as tools so AI assistants (Claude Code, Cursor, etc.) can list, read, create, and
update diagrams directly from a conversation.

## Table of contents

- [Requirements](#requirements)
- [Install globally](#install-globally)
  - [Skill links](#skill-links)
  - [Uninstall](#uninstall)
- [Develop from source](#develop-from-source)
- [Environment variables](#environment-variables)
- [Register with Claude Code](#register-with-claude-code)
  - [Verify the connection](#verify-the-connection)
- [Available tools](#available-tools)
  - [excalidash](#excalidash-this-server)
  - [excalidraw](#excalidraw-excalidraw-mcp-app)
- [Generate and save a diagram](#generate-and-save-a-diagram)
- [View a diagram without inline rendering](#view-a-diagram-without-inline-rendering)
- [Manage existing drawings](#manage-existing-drawings)

## Requirements

- A Node.js version supported by the [`engines` field](package.json)
- A running ExcaliDash instance
- An API key generated in **ExcaliDash Settings → API Keys**

## Install globally

The MCP server and its diagram skill are distributed together as one npm
package. From the MCP source directory, install the package globally:

```bash
npm install
npm install --global .
```

Run the command as the user who will use Claude Code or Codex. Use a
user-writable npm global prefix instead of `sudo`, because the installer links
the skill into the current user's home directory.

The local install supplies the development dependencies and compiles the
TypeScript server. The global install then registers the `excalidash-mcp`
executable and runs the skill-link installer. Ensure npm's global binary
directory is in your `PATH` before configuring an MCP client.

For a prebuilt package archive, install the archive directly; it already
contains the compiled server and bundled skill:

```bash
npm install --global <package-file>.tgz
```

Confirm that npm installed the package:

```bash
npm list --global excalidash-mcp --depth=0
```

### Skill links

The package `postinstall` script links the bundled `excalidash-diagrams` skill
into the user-level discovery directories used by Claude Code and Codex. The
skill remains inside the installed MCP package as the authoritative source.

The installer updates existing symbolic links but refuses to replace a real
file or directory. If npm lifecycle scripts were disabled, or if the links
need repair, run:

```bash
npm explore --global excalidash-mcp -- npm run install-skill
```

### Uninstall

Remove the skill links before uninstalling the global package:

```bash
npm explore --global excalidash-mcp -- npm run uninstall-skill
npm uninstall --global excalidash-mcp
```

The cleanup command removes only links owned by the current MCP installation;
it refuses to delete real directories or links managed elsewhere.

## Develop from source

Install dependencies and start the TypeScript development entry point:

```bash
npm install
npm run dev
```

Local `npm install` runs the same build and skill-link lifecycle used by the
global package. Run `npm link` if you also want the global `excalidash-mcp`
command to resolve directly to this checkout. Rebuild after source changes
before invoking the compiled entry point.

## Environment variables

| Variable | Required | Description |
| --- | --- | --- |
| `EXCALIDASH_URL` | yes | Base URL of your ExcaliDash instance (no trailing slash) |
| `EXCALIDASH_API_KEY` | yes | API key with `drawings:write` and `collections:read` scopes |

Copy `.env.example` as a reference — the MCP server reads these from the process
environment, not from a `.env` file.

## Register with Claude Code

Add both servers to the `mcpServers` key inside `~/.claude.json`.

> **Important:** The VS Code Claude Code extension reads MCP configuration from
> `~/.claude.json` (`mcpServers` key), **not** from `~/.claude/.mcp.json`.
> After editing `~/.claude.json`, start a new chat session for the servers to
> be registered.

```json
{
  "mcpServers": {
    "excalidash": {
      "command": "excalidash-mcp",
      "args": ["--stdio"],
      "env": {
        "EXCALIDASH_URL": "http://<host>:<port>",
        "EXCALIDASH_API_KEY": "<your-api-key>"
      }
    },
    "excalidraw": {
      "command": "node",
      "args": ["/absolute/path/to/excalidraw-mcp/dist/index.js", "--stdio"]
    }
  }
}
```

Clone and build `excalidraw-mcp` first:

```bash
git clone https://github.com/excalidraw/excalidraw-mcp /path/to/excalidraw-mcp
cd /path/to/excalidraw-mcp
npm install
npm run build   # produces dist/index.js
```

### Verify the connection

In Claude Code, ask:

```
list drawings in excalidash
```

If the server connected successfully the tool will return your drawings list.
If not, check the VSCode Output panel → **Claude VSCode** for startup errors
(`MCP server "excalidash": ...`).

## Available tools

### excalidash (this server)

| Tool | Description |
| --- | --- |
| `list_collections` | List all collections. Use to find a collection ID before saving. |
| `list_drawings` | List drawings (id, name, timestamps). Accepts optional `collection_id` filter. |
| `get_drawing` | Fetch a drawing's full elements, appState, and current version number. |
| `update_drawing` | Rename a drawing or replace its elements. Pass `version` from `get_drawing` to avoid conflicts. |
| `save_to_excalidash` | Save a new drawing. Requires `name` and `elements`. |

### excalidraw (excalidraw-mcp-app)

| Tool | Description |
| --- | --- |
| `read_me` | Returns the Excalidraw element format reference. Call before `create_view`. |
| `create_view` | Renders a JSON array of Excalidraw elements with streaming draw-on animations. Returns a `checkpointId`. The canvas appears inline in the chat if the host supports the MCP Apps Extension (SEP-1865); otherwise no visual is shown. |
| `read_checkpoint` | Returns the saved elements JSON for a given `checkpointId`. |
| `save_checkpoint` | Saves the current diagram state for later restore. |
| `export_to_excalidraw` | Triggered from within the inline canvas UI (not by Claude). Uploads the current diagram to excalidraw.com and returns a shareable URL. Only available when the host renders the inline canvas. |

## Generate and save a diagram

```
1. read_me              → load the Excalidraw format reference
2. create_view          → Claude authors elements JSON and renders it; returns checkpointId
3. read_checkpoint      → pass the checkpointId from step 2 to extract the elements JSON
4. save_to_excalidash   → save those elements into your ExcaliDash instance
```

> **Note:** The animated canvas from `create_view` renders inline only when the
> MCP client supports MCP Apps. If no visual appears during generation, save
> the drawing with `save_to_excalidash` and open the returned URL to view and
> edit it.

Example prompt:

```
Draw a microservices architecture with an API gateway, auth service, and two
backend services. Then save it to ExcaliDash as "Microservices Architecture".
```

Claude will generate the diagram, then immediately persist it to your ExcaliDash instance
in one conversation. Open the returned ExcaliDash URL to view and edit it.

## View a diagram without inline rendering

If `create_view` produces no visible canvas (host does not support MCP Apps Extension),
save the drawing to ExcaliDash and open it in a browser:

```
1. read_me              → load the Excalidraw format reference
2. create_view          → render the diagram; returns checkpointId
3. read_checkpoint      → extract elements JSON using the checkpointId
4. save_to_excalidash   → persist to ExcaliDash; returns a URL
```

Open the returned URL to view and edit the diagram with the full Excalidraw editor.
Edits are persisted to your own database and can be read back by Claude via
`get_drawing` / `update_drawing`.

> **Note on `export_to_excalidraw`:** This tool is invoked from within the inline
> Excalidraw canvas UI (a button inside the widget), not by Claude. It is only
> accessible when the host renders the inline canvas. If inline rendering is not
> supported, this tool cannot be used.

## Manage existing drawings

```
1. list_drawings    → find the drawing ID
2. get_drawing      → fetch elements and note the version
3. update_drawing   → rename or modify, passing the version to prevent conflicts
```
