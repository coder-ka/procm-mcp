import fs from "fs";
import path from "path";
import { Readable } from "stream";
import { createServerDir } from "./server-dir.js";
import sqlite3 from "sqlite3";
import { mkdirp } from "mkdirp";
import { log } from "./logger.js";
import { toErrorMessage } from "./error.js";

export type ProcessStdoutChunk = {
  timestamp: Date;
  message: string;
};

export type ProcessStdoutClient = {
  top: (count: number) => Promise<ProcessStdoutChunk[]>;
  close: () => Promise<void>;
};

export async function createProcessStdoutClient({
  id,
  type,
  readable,
  serverId,
}: {
  id: string;
  type: "stdout" | "stderr";
  readable: Readable;
  serverId: string;
}): Promise<ProcessStdoutClient> {
  const serverDir = createServerDir({ serverId });
  const filePath = path.join(serverDir, "processes", `${id}-${type}.sqlite3`);
  const textFilePath = path.join(serverDir, "processes", `${id}-${type}.log`);
  await mkdirp(path.dirname(filePath));

  const db = await new Promise<sqlite3.Database>((resolve, reject) => {
    const db = new sqlite3.Database(filePath, (err) => {
      if (err) {
        reject(err);
      } else {
        resolve(db);
      }
    });
  });

  await new Promise<void>((resolve, reject) => {
    db.run(
      "CREATE TABLE IF NOT EXISTS logs (timestamp INTEGER, message TEXT)",
      (err) => {
        if (err) {
          reject(err);
        } else {
          resolve();
        }
      }
    );
  });

  const updateQueue = createUpdateQueue();

  const onData = (chunk: Buffer) => {
    const message = chunk.toString().trim();
    const timestamp = Date.now();

    updateQueue.unshift(async () => {
      try {
        await Promise.all([
          new Promise<void>(async (resolve, reject) => {
            db.run(
              "INSERT INTO logs (timestamp, message) VALUES (?, ?)",
              [timestamp, message],
              (err) => {
                if (err) {
                  reject(err);
                } else {
                  resolve();
                }
              }
            );
          }),
          new Promise<void>((resolve, reject) => {
            fs.appendFile(
              textFilePath,
              message,
              { encoding: "utf8" },
              (err) => {
                if (err) {
                  reject(err);
                } else {
                  resolve();
                }
              }
            );
          }),
        ]);
      } catch (error) {
        serverLog(`Error writing log: ${toErrorMessage(error)}`, serverId);
      }
    });
  };

  readable.on("data", onData);

  return {
    top: async (count: number) => {
      await updateQueue.processing;

      return new Promise<ProcessStdoutChunk[]>((resolve, reject) => {
        db.all<ProcessStdoutChunk>(
          "SELECT timestamp, message FROM logs ORDER BY timestamp DESC LIMIT ?",
          [count],
          (err, rows) => {
            if (err) {
              reject(err);
            } else {
              resolve(
                rows.map((row) => ({
                  timestamp: new Date(row.timestamp),
                  message: row.message,
                }))
              );
            }
          }
        );
      });
    },
    close: async () => {
      readable.off("data", onData);
      await new Promise<void>((res, rej) => {
        db.close((err) => {
          if (err) {
            rej(err);
          } else {
            res();
          }
        });
      });
    },
  };
}

function createUpdateQueue() {
  let processing = Promise.resolve();

  return {
    processing,
    unshift: (fn: () => Promise<void>) => {
      processing = processing.then(() => {
        return new Promise<void>(async (resolve, reject) => {
          try {
            await fn();
            resolve();
          } catch (error) {
            reject(error);
          }
        });
      });
    },
  };
}

function serverLog(message: string, serverId: string) {
  log(message, { id: serverId });
}
