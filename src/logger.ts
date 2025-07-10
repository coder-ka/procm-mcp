import path from "path";
import fs from "fs";
import { mkdirp } from "mkdirp";
import { ServerDir } from "./server-dir.js";

export function log(message: string, { id }: { id: string }): void {
  const logFilePath = path.join(ServerDir({ serverId: id }), "debug.log");
  mkdirp.sync(path.dirname(logFilePath));
  const timestamp = new Date().toISOString();
  const logMessage = `[${timestamp}] ${message}\n`;

  fs.appendFileSync(logFilePath, logMessage, { encoding: "utf8" });
}
