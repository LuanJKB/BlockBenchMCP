import { DEFAULTS } from "@blockbench-mcp/shared";
import { requireNodeModule } from "./host/node-modules.js";

export interface PluginRuntimeConfig {
  port: number;
  secret: string;
  autostart: boolean;
  allowedOrigins?: string[];
}

function persistSettings(): void {
  Settings.saveLocalStorages();
}

export function generateSecureToken(): string {
  const crypto = requireNodeModule<{
    randomBytes: (size: number) => { toString: (encoding: string) => string };
  }>("node:crypto");
  return crypto.randomBytes(32).toString("hex");
}

export function regenerateSecret(): string {
  if (!settings.mcp_secret) throw new Error("MCP token setting is not registered");
  const token = generateSecureToken();
  settings.mcp_secret.value = token;
  persistSettings();
  return token;
}

export function readPluginConfig(): PluginRuntimeConfig {
  const portRaw = settings?.mcp_port?.value;
  let secretRaw = settings?.mcp_secret?.value;
  const port = typeof portRaw === "number" ? portRaw : typeof portRaw === "string" ? Number(portRaw) : DEFAULTS.mcpPort;
  if (typeof secretRaw !== "string" || !secretRaw || secretRaw === "dev-local-secret") {
    try { secretRaw = regenerateSecret(); }
    catch { secretRaw = ""; } // Never start with a token the user cannot retrieve.
  }
  return {
    port: Number.isFinite(port) ? port : DEFAULTS.mcpPort,
    secret: typeof secretRaw === "string" ? secretRaw : "",
    autostart: settings?.mcp_autostart?.value === true,
    allowedOrigins: [],
  };
}

export function registerPluginSettings(): void {
  // Blockbench 5.1 registers settings through the Setting constructor, not Settings.add.
  // The constructor restores persisted values; migrate/generate only after that restoration.
  if (!settings.mcp_port) new Setting("mcp_port", {
    value: DEFAULTS.mcpPort, category: "general", name: "MCP Server Port",
    description: "Loopback HTTP port for in-plugin MCP (127.0.0.1).", type: "number",
  });
  if (!settings.mcp_secret) new Setting("mcp_secret", {
    value: "", category: "general", name: "MCP Shared Secret",
    description: "Generated bearer token for local MCP clients.", type: "text",
  });
  if (!settings.mcp_autostart) new Setting("mcp_autostart", {
    value: false, category: "general", name: "Start MCP Server automatically",
    description: "Listen for local MCP clients when the plugin loads.", type: "toggle",
  });
  readPluginConfig();
}
