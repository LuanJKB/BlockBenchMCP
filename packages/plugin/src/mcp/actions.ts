import type { McpHandle } from "./server.js";

let toggle: Action | null = null;
let regenerateAction: Action | null = null;

export function registerMcpActions(options: {
  getHandle: () => McpHandle | null;
  start: () => void;
  stop: () => void;
  regenerateToken?: () => void;
}): () => void {
  const refresh = () => {
    const h = options.getHandle();
    const running = !!h?.running();
    toggle?.setName?.(
      running ? `Stop MCP Server (:${h?.port})` : "Start MCP Server",
    );
  };

  toggle = new Action("blockbench_mcp_toggle", {
    name: "Start MCP Server",
    icon: "smart_toy",
    category: "tools",
    click: () => {
      const h = options.getHandle();
      if (h?.running()) options.stop();
      else options.start();
      refresh();
    },
  });

  if (options.regenerateToken) {
    regenerateAction = new Action("blockbench_mcp_regenerate_token", {
      name: "Regenerate MCP Token",
      icon: "key",
      category: "tools",
      click: () => {
        options.regenerateToken?.();
      },
    });
  }

  refresh();
  return () => {
    toggle?.delete();
    toggle = null;
    regenerateAction?.delete();
    regenerateAction = null;
  };
}
