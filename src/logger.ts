import path from "path";
import fs from "fs";
import { mkdirp } from "mkdirp";
import { createServerDir } from "./server-dir.js";

export function log(message: string, { id }: { id: string }): void {
  const serverDir = createServerDir({ serverId: id });
  const logFilePath = path.join(serverDir, "debug.log");
  mkdirp.sync(path.dirname(logFilePath));
  const timestamp = new Date().toISOString();
  const logMessage = `[${timestamp}] ${message}\n`;

  fs.appendFileSync(logFilePath, logMessage, { encoding: "utf8" });
}
