import path from "path";
import { ProcmMcpDir } from "./procm-mcp-dir.js";

export function ServerDir({ serverId }: { serverId: string }) {
  return path.join(ProcmMcpDir(), serverId);
}
