import { JSONFilePreset } from "lowdb/node";
import { tmpdir } from "os";
import path from "path";
import { Readable } from "stream";

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
}: {
  id: string;
  type: "stdout" | "stderr";
  readable: Readable;
}): Promise<ProcessStdoutClient> {
  const tmpPath = tmpdir();
  const filePath = path.join(tmpPath, id, `${type}.json`);
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
