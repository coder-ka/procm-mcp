import { JSONFilePreset } from "lowdb/node";
import path from "path";
import { Readable } from "stream";
import { createServerDir } from "./server-dir.js";

export type ProcessStdoutChunk = {
  timestamp: string;
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
  const filePath = path.join(serverDir, `${type}.json`);
  const db = await JSONFilePreset<ProcessStdoutChunk[]>(filePath, []);

  const updateQueue = createUpdateQueue();

  const onData = (chunk: Buffer) => {
    const message = chunk.toString().trim();
    const timestamp = new Date().toISOString();
    db.data.push({
      timestamp,
      message,
    });

    updateQueue.unshift(async () => {
      await db.write();
    });
  };

  readable.on("data", onData);

  return {
    top: async (count: number) => {
      await updateQueue.processing;
      return db.data.slice(-count);
    },
    close: async () => {
      readable.off("data", onData);
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
