import type { PluginRuntimeConfig } from "../config.js";
import { revokeScope, type SessionState } from "../session.js";
import { bbBlockbench } from "../bb/globals.js";
import { loadNet, type NetServer, type NetSocket } from "./net.js";
import {
  attachHttpServer,
  writeHttp,
  type HttpRequest,
} from "./http-server.js";
import { handleMcpJsonRpc } from "./rpc.js";
import { requireNodeModule } from "../host/node-modules.js";

export interface McpHandle {
  stop: () => void;
  rotateSecret: (secret: string) => void;
  port: number;
  running: () => boolean;
}

function timingSafeEqualStr(a: string, b: string): boolean {
  if (!a || !b || typeof a !== "string" || typeof b !== "string") return false;
  try {
    const crypto = requireNodeModule<{
      timingSafeEqual: (a: Uint8Array, b: Uint8Array) => boolean;
    }>("node:crypto");
    const left = new TextEncoder().encode(a);
    const right = new TextEncoder().encode(b);
    return left.length === right.length && crypto.timingSafeEqual(left, right);
  } catch {
    return false; // Fail closed if the desktop denies crypto permission.
  }
}

function authorized(req: HttpRequest, secret: string): boolean {
  if (!secret || typeof secret !== "string") return false;
  const auth = req.headers.authorization ?? "";
  let candidate: string | null = null;
  if (/^Bearer [A-Za-z0-9._~+\/-]+=*$/i.test(auth)) {
    candidate = auth.slice(7);
  } else if (!auth && req.headers["x-mcp-secret"]) {
    candidate = req.headers["x-mcp-secret"].trim();
  }
  if (!candidate) return false;
  return timingSafeEqualStr(candidate, secret);
}

function pathOnly(path: string): string {
  const q = path.indexOf("?");
  return q === -1 ? path : path.slice(0, q);
}

function isLoopbackAddress(addr: string | undefined): boolean {
  if (!addr) return false;
  return (
    addr === "127.0.0.1" ||
    addr === "::1" ||
    addr === "::ffff:127.0.0.1"
  );
}

function isAllowedHost(hostHeader: string | undefined, port: number): boolean {
  if (!hostHeader) return false;
  const host = hostHeader.toLowerCase().trim();
  const allowed = new Set([
    `127.0.0.1:${port}`,
    `localhost:${port}`,
    ...(port === 80 ? ["127.0.0.1", "localhost"] : []),
  ]);
  return allowed.has(host);
}

export function startMcpHttp(
  config: PluginRuntimeConfig,
  session: SessionState,
): McpHandle {
  if (!config.secret || !Number.isInteger(config.port) || config.port < 1 || config.port > 65535) {
    throw new Error("A token and valid local port are required");
  }
  revokeScope(session);
  let activeSecret = config.secret;
  let stopped = false;
  const net = loadNet();
  let server: NetServer | null = null;
  let listening = false;

  const onRequest = async (req: HttpRequest, socket: NetSocket) => {
    if (stopped) { socket.destroy(); return; }
    // 1. Socket remote address loopback check
    if (!isLoopbackAddress(socket.remoteAddress)) {
      writeHttp(
        socket,
        403,
        JSON.stringify({ error: "Forbidden: loopback connection only" }),
      );
      return;
    }

    // 2. DNS rebinding / Host header validation
    if (!isAllowedHost(req.headers.host, config.port)) {
      writeHttp(
        socket,
        403,
        JSON.stringify({ error: "Invalid Host header" }),
      );
      return;
    }

    // 3. Browser Origin validation (deny untrusted browser origins)
    const origin = req.headers.origin;
    let allowedCorsOrigin: string | undefined;
    if (origin !== undefined) {
      const allowedOrigins = config.allowedOrigins ?? [];
      if (!origin || origin === "*" || !allowedOrigins.includes(origin)) {
        writeHttp(
          socket,
          403,
          JSON.stringify({ error: "Origin Not Allowed" }),
        );
        return;
      }
      allowedCorsOrigin = origin;
    }

    // 4. OPTIONS preflight
    if (req.method === "OPTIONS" && allowedCorsOrigin) {
      writeHttp(socket, 204, undefined, undefined, allowedCorsOrigin);
      return;
    }

    if (!authorized(req, activeSecret)) {
      writeHttp(
        socket,
        401,
        JSON.stringify({ error: "unauthorized" }),
        undefined,
        allowedCorsOrigin,
      );
      return;
    }

    if (req.method === "OPTIONS") {
      writeHttp(socket, 204, undefined);
      return;
    }

    const path = pathOnly(req.path);

    if (path === "/" || path === "/health") {
      writeHttp(
        socket,
        200,
        JSON.stringify({
          ok: true,
          service: "blockbench-mcp",
          mcp: `http://127.0.0.1:${config.port}/mcp`,
        }),
        undefined,
        allowedCorsOrigin,
      );
      return;
    }

    if (path !== "/mcp") {
      writeHttp(
        socket,
        404,
        JSON.stringify({ error: "not found" }),
        undefined,
        allowedCorsOrigin,
      );
      return;
    }

    if (req.method === "GET") {
      // Streamable HTTP clients may probe GET; we only support JSON POST replies.
      writeHttp(
        socket,
        405,
        JSON.stringify({
          error:
            "Use POST /mcp (Streamable HTTP JSON). SSE stream not required.",
        }),
        undefined,
        allowedCorsOrigin,
      );
      return;
    }

    if (req.method === "DELETE") {
      writeHttp(
        socket,
        200,
        JSON.stringify({ ok: true }),
        undefined,
        allowedCorsOrigin,
      );
      return;
    }

    if (req.method !== "POST") {
      writeHttp(
        socket,
        405,
        JSON.stringify({ error: "POST only" }),
        undefined,
        allowedCorsOrigin,
      );
      return;
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(req.body || "{}");
    } catch {
      writeHttp(
        socket,
        400,
        JSON.stringify({
          jsonrpc: "2.0",
          id: null,
          error: { code: -32700, message: "Parse error" },
        }),
        undefined,
        allowedCorsOrigin,
      );
      return;
    }

    const result = await handleMcpJsonRpc(session, parsed);
    const extra: Record<string, string> = {};
    if (result.sessionId) {
      extra["Mcp-Session-Id"] = result.sessionId;
    }
    writeHttp(socket, result.status, result.body, extra, allowedCorsOrigin);
  };

  server = attachHttpServer(net, onRequest);
  server.on("error", ((err: { message?: string }) => {
    listening = false;
    bbBlockbench().showQuickMessage?.(
      `MCP server error: ${err?.message ?? "unknown"}`,
      4000,
    );
  }) as (...args: never[]) => void);

  server.listen(config.port, "127.0.0.1", () => {
    listening = true;
    bbBlockbench().showQuickMessage?.(
      `MCP ready → http://127.0.0.1:${config.port}/mcp`,
      3500,
    );
  });

  return {
    port: config.port,
    running: () => listening && !!server,
    rotateSecret: (secret) => {
      if (!secret) throw new Error("Token must not be empty");
      activeSecret = secret;
    },
    stop: () => {
      stopped = true;
      revokeScope(session);
      listening = false;
      server?.close();
      server = null;
    },
  };
}
