import { tmpdir } from "os";
import path from "path";
import fs from "fs";
import { mkdirp } from "mkdirp";

export function log(message: string, { id }: { id: string }): void {
  const logFilePath = path.join(tmpdir(), "procm-mcp", `${id}.log`);
  mkdirp.sync(path.dirname(logFilePath));
  const timestamp = new Date().toISOString();
  const logMessage = `[${timestamp}] ${message}\n`;

  fs.appendFileSync(logFilePath, logMessage, { encoding: "utf8" });
}
