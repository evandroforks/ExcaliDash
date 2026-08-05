#!/usr/bin/env node

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";

const BASE_URL = (process.env.EXCALIDASH_URL || "").replace(/\/$/, "");
const API_KEY = process.env.EXCALIDASH_API_KEY || "";

function headers() {
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${API_KEY}`,
  };
}

function missingConfig() {
  if (!BASE_URL || !API_KEY) {
    return {
      content: [
        {
          type: "text" as const,
          text: "EXCALIDASH_URL and EXCALIDASH_API_KEY environment variables must be set.",
        },
      ],
      isError: true,
    };
  }
  return null;
}

function errorResult(status: number, body: string) {
  return {
    content: [{ type: "text" as const, text: `Error (${status}): ${body}` }],
    isError: true,
  };
}

const server = new Server(
  { name: "excalidash-mcp", version: "1.1.0" },
  { capabilities: { tools: {} } },
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: "list_collections",
      description:
        "List all collections in ExcaliDash. Use this to find the collection ID before saving a drawing.",
      inputSchema: {
        type: "object",
        properties: {},
        required: [],
      },
    },
    {
      name: "list_drawings",
      description:
        "List drawings saved in ExcaliDash. Returns id, name, and timestamps. " +
        "Optionally filter by collection. Use get_drawing to fetch the full elements of a specific drawing.",
      inputSchema: {
        type: "object",
        properties: {
          collection_id: {
            type: "string",
            description: "Filter by collection ID (optional). Use list_collections to find IDs.",
          },
        },
        required: [],
      },
    },
    {
      name: "get_drawing",
      description:
        "Fetch the full content of a drawing from ExcaliDash, including its Excalidraw elements and appState. " +
        "Use list_drawings to find the drawing ID first.",
      inputSchema: {
        type: "object",
        properties: {
          id: {
            type: "string",
            description: "The drawing ID to fetch.",
          },
        },
        required: ["id"],
      },
    },
    {
      name: "update_drawing",
      description:
        "Update an existing drawing in ExcaliDash. You can rename it, replace its elements, or both. " +
        "Fetch the drawing first with get_drawing to get the current version number and elements.",
      inputSchema: {
        type: "object",
        properties: {
          id: {
            type: "string",
            description: "The drawing ID to update.",
          },
          name: {
            type: "string",
            description: "New name for the drawing (optional).",
          },
          elements: {
            type: "array",
            description: "New Excalidraw elements array (optional). Replaces all current elements.",
            items: { type: "object" },
          },
          app_state: {
            type: "object",
            description: "New Excalidraw appState (optional, used together with elements).",
          },
          version: {
            type: "number",
            description:
              "Current version of the drawing (recommended when updating elements). " +
              "Obtained from get_drawing. Prevents overwriting concurrent edits.",
          },
        },
        required: ["id"],
      },
    },
    {
      name: "save_to_excalidash",
      description:
        "Save a new Excalidraw diagram to the self-hosted ExcaliDash instance. " +
        "Pass the elements from excalidraw-mcp's create_view or read_checkpoint output.",
      inputSchema: {
        type: "object",
        properties: {
          name: {
            type: "string",
            description: "Name for the drawing in ExcaliDash.",
          },
          elements: {
            type: "array",
            description: "Excalidraw elements array.",
            items: { type: "object" },
          },
          app_state: {
            type: "object",
            description: "Excalidraw appState object (optional).",
          },
          collection_id: {
            type: "string",
            description:
              "ID of the ExcaliDash collection to save into (optional). " +
              "Use list_collections to find available IDs.",
          },
        },
        required: ["name", "elements"],
      },
    },
  ],
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  if (name === "list_collections") {
    const cfg = missingConfig();
    if (cfg) return cfg;

    const res = await fetch(`${BASE_URL}/api/collections`, { headers: headers() });
    if (!res.ok) return errorResult(res.status, await res.text().catch(() => ""));

    const data = (await res.json()) as Array<{ id: string; name: string }>;
    const lines = data
      .filter((c) => !c.id.startsWith("trash:"))
      .map((c) => `• ${c.name}  (id: ${c.id})`)
      .join("\n");

    return {
      content: [
        {
          type: "text" as const,
          text: lines.length ? `Collections:\n${lines}` : "No collections found.",
        },
      ],
    };
  }

  if (name === "list_drawings") {
    const cfg = missingConfig();
    if (cfg) return cfg;

    const { collection_id } = (args ?? {}) as { collection_id?: string };
    const url = new URL(`${BASE_URL}/api/drawings`);
    if (collection_id) url.searchParams.set("collectionId", collection_id);

    const res = await fetch(url.toString(), { headers: headers() });
    if (!res.ok) return errorResult(res.status, await res.text().catch(() => ""));

    const json = (await res.json()) as
      | Array<{ id: string; name: string; createdAt: string; updatedAt: string; collectionId?: string | null }>
      | { drawings: Array<{ id: string; name: string; createdAt: string; updatedAt: string; collectionId?: string | null }> };
    const data = Array.isArray(json) ? json : json.drawings;

    if (!data.length) {
      return { content: [{ type: "text" as const, text: "No drawings found." }] };
    }

    const lines = data.map((d) => {
      const updated = new Date(d.updatedAt).toLocaleString();
      const col = d.collectionId ? `  [collection: ${d.collectionId}]` : "";
      return `• ${d.name}  (id: ${d.id})  updated: ${updated}${col}`;
    });

    return {
      content: [
        {
          type: "text" as const,
          text: `Drawings (${data.length}):\n${lines.join("\n")}`,
        },
      ],
    };
  }

  if (name === "get_drawing") {
    const cfg = missingConfig();
    if (cfg) return cfg;

    const { id } = args as { id: string };
    const res = await fetch(`${BASE_URL}/api/drawings/${id}`, { headers: headers() });
    if (!res.ok) return errorResult(res.status, await res.text().catch(() => ""));

    const drawing = (await res.json()) as {
      id: string;
      name: string;
      version: number;
      elements: unknown[];
      appState: Record<string, unknown>;
      collectionId?: string | null;
      createdAt: string;
      updatedAt: string;
    };

    return {
      content: [
        {
          type: "text" as const,
          text:
            `Drawing: "${drawing.name}" (id: ${drawing.id})\n` +
            `Version: ${drawing.version}\n` +
            `Collection: ${drawing.collectionId ?? "none"}\n` +
            `Updated: ${new Date(drawing.updatedAt).toLocaleString()}\n` +
            `Elements (${drawing.elements.length}):\n` +
            JSON.stringify(drawing.elements, null, 2) +
            `\n\nappState:\n` +
            JSON.stringify(drawing.appState, null, 2),
        },
      ],
    };
  }

  if (name === "update_drawing") {
    const cfg = missingConfig();
    if (cfg) return cfg;

    const { id, name: drawingName, elements, app_state, version } = args as {
      id: string;
      name?: string;
      elements?: unknown[];
      app_state?: Record<string, unknown>;
      version?: number;
    };

    const body: Record<string, unknown> = {};
    if (drawingName !== undefined) body.name = drawingName;
    if (elements !== undefined) body.elements = elements;
    if (app_state !== undefined) body.appState = app_state;
    if (version !== undefined) body.version = version;

    const res = await fetch(`${BASE_URL}/api/drawings/${id}`, {
      method: "PUT",
      headers: headers(),
      body: JSON.stringify(body),
    });

    if (res.status === 409) {
      const data = (await res.json().catch(() => ({}))) as { currentVersion?: number };
      return {
        content: [
          {
            type: "text" as const,
            text:
              `Version conflict: the drawing was modified by someone else.\n` +
              `Fetch it again with get_drawing (current version: ${data.currentVersion ?? "unknown"}) and retry.`,
          },
        ],
        isError: true,
      };
    }

    if (!res.ok) return errorResult(res.status, await res.text().catch(() => ""));

    const drawing = (await res.json()) as { id: string; name: string; version: number };
    return {
      content: [
        {
          type: "text" as const,
          text:
            `Drawing "${drawing.name}" updated successfully.\n` +
            `New version: ${drawing.version}\n` +
            `Open it at: ${BASE_URL}/drawing/${drawing.id}`,
        },
      ],
    };
  }

  if (name === "save_to_excalidash") {
    const cfg = missingConfig();
    if (cfg) return cfg;

    const { name: drawingName, elements, app_state, collection_id } = args as {
      name: string;
      elements: unknown[];
      app_state?: Record<string, unknown>;
      collection_id?: string;
    };

    const body: Record<string, unknown> = {
      name: drawingName,
      elements,
      appState: app_state ?? {},
    };
    if (collection_id) body.collectionId = collection_id;

    const res = await fetch(`${BASE_URL}/api/drawings`, {
      method: "POST",
      headers: headers(),
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      return errorResult(res.status, await res.text().catch(() => ""));
    }

    const drawing = (await res.json()) as { id: string; name: string };
    return {
      content: [
        {
          type: "text" as const,
          text:
            `Drawing "${drawing.name}" saved to ExcaliDash.\n` +
            `Open it at: ${BASE_URL}/drawing/${drawing.id}`,
        },
      ],
    };
  }

  throw new Error(`Unknown tool: ${name}`);
});

const transport = new StdioServerTransport();
await server.connect(transport);
