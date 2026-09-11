import type { SessionState } from "../session.js";
import { CommandError } from "../errors.js";
import { requireNodeModule } from "../host/node-modules.js";
import { requireProject } from "../bb/elements.js";

type Stat = { isSymbolicLink(): boolean; isDirectory(): boolean };
type FsApi = {
  lstatSync(path: string): Stat;
  realpathSync(path: string): string;
  readFileSync(path: string): Uint8Array;
  mkdirSync(path: string): void;
  openSync(path: string, flags: number): number;
  writeFileSync(fd: number, data: string | Uint8Array): void;
  closeSync(fd: number): void;
  constants: { O_WRONLY: number; O_CREAT: number; O_EXCL: number; O_TRUNC: number; O_NOFOLLOW?: number };
};
type PathApi = {
  isAbsolute(path: string): boolean;
  resolve(...paths: string[]): string;
  relative(root: string, path: string): string;
  dirname(path: string): string;
  sep: string;
};
type CodecApi = { compile?: () => unknown };
const fsApi = () => requireNodeModule<FsApi>("fs");
const pathApi = () => requireNodeModule<PathApi>("path");
const denied = (message: string): never => { throw new CommandError("E_SCOPE_DENIED", message); };

function contained(root: string, target: string, paths: PathApi): boolean {
  const relative = paths.relative(root, target);
  return relative !== ".." && !relative.startsWith(`..${paths.sep}`) && !paths.isAbsolute(relative);
}

function statIfPresent(fs: FsApi, target: string): Stat | undefined {
  try { return fs.lstatSync(target); }
  catch (error) {
    if ((error as { code?: string }).code === "ENOENT") return undefined;
    return denied("Cannot safely inspect scoped path.");
  }
}

/** The stored root is the physical path approved by the human, never a new root after redirection. */
function approvedRoot(session: SessionState, fs: FsApi, paths: PathApi): string {
  const root = session.scopedDirectory;
  if (!root) return denied("Call propose_scoped_directory first and get user approval.");
  try {
    if (paths.relative(root, fs.realpathSync(root)) !== "" || !fs.lstatSync(root).isDirectory()) {
      return denied("Approved directory changed; request approval again.");
    }
  } catch { return denied("Approved directory unavailable or redirected."); }
  return root;
}

/** All MCP disk I/O uses physical containment; dangling redirects fail closed. */
export function resolveScopedPath(session: SessionState, path: string): string {
  const fs = fsApi(), paths = pathApi();
  const root = approvedRoot(session, fs, paths);
  if (!paths.isAbsolute(path) || path.includes("\0")) return denied("Destination path must be absolute.");
  // Treat separators consistently across platforms; reject Windows device/ADS aliases.
  if (/^(?:\\\\|\/\/)/.test(path) || path.slice(2).includes(":")) return denied("UNC, device and alternate stream paths are not supported.");
  const target = paths.resolve(path.split("\\").join("/"));
  if (!contained(root, target, paths)) return denied("Path must be inside scoped directory.");
  const parts = paths.relative(root, target).split(paths.sep).filter(Boolean);
  let current = root;
  for (const part of parts) {
    if (/[. ]$/.test(part) || /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(part)) {
      return denied("Ambiguous device or filesystem path component.");
    }
    current = paths.resolve(current, part);
    const stat = statIfPresent(fs, current);
    if (!stat) continue;
    let real: string;
    try { real = fs.realpathSync(current); }
    catch { return denied("Unresolvable symlink or junction."); }
    if (!contained(root, real, paths)) return denied("Symlink/junction escapes scoped directory.");
    current = real;
  }
  return current;
}

export const scopedTarget = resolveScopedPath;

export function readScopedBinary(session: SessionState, path: string): Uint8Array {
  const target = resolveScopedPath(session, path);
  if (!statIfPresent(fsApi(), target)) throw new CommandError("E_NOT_FOUND", "File not found.");
  return fsApi().readFileSync(resolveScopedPath(session, target));
}

function writeScoped(
  session: SessionState, path: string, data: string | Uint8Array, overwrite?: boolean,
): { path: string; bytes: number } {
  const fs = fsApi(), paths = pathApi();
  let target = resolveScopedPath(session, path);
  const parent = paths.dirname(target);
  const missing: string[] = [];
  let ancestor = parent;
  while (!statIfPresent(fs, ancestor)) { missing.push(ancestor); ancestor = paths.dirname(ancestor); }
  for (const directory of missing.reverse()) {
    resolveScopedPath(session, paths.dirname(directory));
    fs.mkdirSync(resolveScopedPath(session, directory));
  }
  // Codec compilation and directory creation may execute host code; validate again just before open.
  resolveScopedPath(session, parent);
  target = resolveScopedPath(session, path);
  const flags = fs.constants.O_WRONLY | fs.constants.O_CREAT |
    (overwrite === true ? fs.constants.O_TRUNC : fs.constants.O_EXCL) |
    (fs.constants.O_NOFOLLOW ?? 0);
  let fd: number;
  try { fd = fs.openSync(target, flags); }
  catch (error) {
    if (["EEXIST", "ELOOP"].includes((error as { code?: string }).code ?? "")) {
      return denied("File exists or is a redirect; pass overwrite:true only for an approved file.");
    }
    throw error;
  }
  try { fs.writeFileSync(fd, data); } finally { fs.closeSync(fd); }
  return { path: target, bytes: typeof data === "string" ? new TextEncoder().encode(data).byteLength : data.byteLength };
}

export function writeScopedBinary(session: SessionState, path: string, data: Uint8Array, overwrite?: boolean) {
  return writeScoped(session, path, data, overwrite);
}

function serialize(content: unknown): string | Uint8Array {
  if (typeof content === "string" || content instanceof Uint8Array) return content;
  if (content instanceof ArrayBuffer) return new Uint8Array(content);
  if (content === undefined || content === null) throw new CommandError("E_BLOCKBENCH_ERROR", "Codec returned no content");
  return JSON.stringify(content, null, 2);
}

function compileTo(session: SessionState, opts: { path: string; overwrite?: boolean }, codec: CodecApi | undefined, label: string) {
  requireProject();
  const target = resolveScopedPath(session, opts.path);
  if (statIfPresent(fsApi(), target) && opts.overwrite !== true) return denied("File exists; pass overwrite:true");
  if (typeof codec?.compile !== "function") throw new CommandError("E_UNSUPPORTED_FORMAT", `${label} codec is unavailable`);
  const data = serialize(codec.compile());
  return { ...writeScoped(session, opts.path, data, opts.overwrite), codec: label };
}

export function proposeScopedDirectory(session: SessionState, path: string): { scoped_directory: string; confirmed: boolean } {
  const fs = fsApi(), paths = pathApi();
  if (!paths.isAbsolute(path)) throw new CommandError("E_INVALID_PARAM", "Scoped directory must be absolute");
  let canonical: string;
  try {
    canonical = fs.realpathSync(paths.resolve(path));
    if (!fs.lstatSync(canonical).isDirectory()) throw new Error("Not a directory");
  } catch { throw new CommandError("E_INVALID_PARAM", "Scoped directory must be an existing directory."); }
  const ok = typeof window !== "undefined" && window.confirm(
    `Allow MCP file access for this session?\n\n${canonical}\n\nOnly approve a dedicated project folder. Access ends when MCP stops.`,
  );
  if (!ok) return denied("User denied scoped directory access.");
  session.scopedDirectory = canonical;
  approvedRoot(session, fs, paths);
  return { scoped_directory: canonical, confirmed: true };
}

export function saveProject(session: SessionState, opts: { path: string; overwrite?: boolean }) {
  const codec = (globalThis as unknown as { Codecs?: { project?: CodecApi } }).Codecs?.project;
  return compileTo(session, opts, codec, "project");
}

export function exportModel(session: SessionState, opts: { path: string; overwrite?: boolean }) {
  const format = (globalThis as unknown as { Format?: { id?: string; codec?: CodecApi } }).Format;
  return compileTo(session, opts, format?.codec, format?.id ?? "format");
}
