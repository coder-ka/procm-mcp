import { tmpdir } from "os";
import path from "path";

export function ProcmMcpDir() {
  return path.join(tmpdir(), "procm-mcp");
}
