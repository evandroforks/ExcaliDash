# ExcaliDash

Excalidraw-based collaborative diagramming app with a Node/Express backend, React frontend, and MCP server for AI integration.

## MCP server

The project ships an MCP server so Claude can list, read, create, and update drawings directly.

Configuration and tool reference: @mcp/README.md

The MCP server is registered in `~/.claude.json` under `mcpServers` (VS Code Claude Code extension reads this file, **not** `~/.claude/.mcp.json`). Start a new chat session after editing it.
