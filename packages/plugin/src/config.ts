import { DEFAULTS } from "@blockbench-mcp/shared";
import { requireNodeModule } from "./host/node-modules.js";

export interface PluginRuntimeConfig {
  port: number;
  secret: string;
  autostart: boolean;
  allowedOrigins?: string[];
}

type SettingsGlobal = {
  add?: (id: string, setting: Record<string, unknown>) => void;
  save?: () => void;
};

function getSettings(): SettingsGlobal {
  return (globalThis as unknown as { Settings: SettingsGlobal }).Settings;
}

function persistSettings(): void {
  try {
    getSettings().save?.();
  } catch {
    /* Settings.save may not exist in all environments */
  }
}

export function generateSecureToken(): string {
  const crypto = requireNodeModule<{
    randomBytes: (size: number) => { toString: (encoding: string) => string };
  }>("node:crypto");
  return crypto.randomBytes(32).toString("hex");
}

export function regenerateSecret(): string {
  const token = generateSecureToken();
  if (typeof settings !== "undefined" && settings?.mcp_secret) {
    settings.mcp_secret.value = token;
    persistSettings();
  }
  return token;
}

export function readPluginConfig(): PluginRuntimeConfig {
  const portRaw = settings?.mcp_port?.value;
  let secretRaw = settings?.mcp_secret?.value;
  const autoRaw = settings?.mcp_autostart?.value;
  const port =
    typeof portRaw === "number"
      ? portRaw
      : typeof portRaw === "string"
        ? Number(portRaw)
        : DEFAULTS.mcpPort;

  if (
    typeof secretRaw !== "string" ||
    secretRaw.length === 0 ||
    secretRaw === "dev-local-secret"
  ) {
    try {
      secretRaw = generateSecureToken();
      if (typeof settings !== "undefined" && settings?.mcp_secret) {
        settings.mcp_secret.value = secretRaw;
        persistSettings();
      }
    } catch {
      secretRaw = "";
    }
  }

  return {
    port: Number.isFinite(port) ? port : DEFAULTS.mcpPort,
    secret: typeof secretRaw === "string" ? secretRaw : "",
    autostart: autoRaw === true,
    allowedOrigins: [],
  };
}

export function registerPluginSettings(): void {
  const S = getSettings();
  S.add?.("mcp_port", {
    value: DEFAULTS.mcpPort,
    category: "general",
    name: "MCP Server Port",
    description: "Loopback HTTP port for in-plugin MCP (127.0.0.1).",
    type: "number",
  });

  let currentSecret = settings?.mcp_secret?.value;
  if (
    typeof currentSecret !== "string" ||
    currentSecret.length === 0 ||
    currentSecret === "dev-local-secret"
  ) {
    try {
      currentSecret = generateSecureToken();
    } catch {
      currentSecret = "";
    }
  }

  S.add?.("mcp_secret", {
    value: currentSecret,
    category: "general",
    name: "MCP Shared Secret",
    description: "Bearer token Cursor must send as Authorization: Bearer …",
    type: "text",
  });
  if (settings?.mcp_secret && currentSecret) {
    settings.mcp_secret.value = currentSecret;
    persistSettings();
  }

  S.add?.("mcp_autostart", {
    value: false,
    category: "general",
    name: "Start MCP Server automatically",
    description: "Listen for Cursor/AI as soon as the plugin loads.",
    type: "toggle",
  });
}
