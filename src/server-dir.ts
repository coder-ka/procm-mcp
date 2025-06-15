import { tmpdir } from "os";
import path from "path";

export function createServerDir({ serverId }: { serverId: string }) {
  return path.join(tmpdir(), "procm-mcp", serverId);
}
