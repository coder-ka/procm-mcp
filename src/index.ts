import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { nanoid } from "nanoid";
import { ChildProcess, spawn } from "child_process";
import {
  createProcessStdoutClient,
  ProcessStdoutClient,
} from "./process-stdout-client.js";
import { log } from "./logger.js";

const serverId = nanoid(6);
type ProcessMetadata = {
  id: string;
  name: string;
  script: string;
  args: string[];
  cwd: string;
  status: "spawning" | "running" | "exited" | "error";
  error: string | null;
  exitCode: number | null;
  process: ChildProcess;
  stdoutClient: ProcessStdoutClient;
  stderrClient: ProcessStdoutClient;
};

const processes: ProcessMetadata[] = [];

try {
  const server = new McpServer({
    name: "procm-mcp",
    version: "1.0.0",
  });

  server.tool("get-server-id", "Get server id", {}, async () => {
    serverLog("get-server-id tool called");
    return {
      content: [
        {
          type: "text",
          text: `Server ID: ${serverId}`,
        },
      ],
    };
  });

  server.tool(
    "start-process",
    "Start a new process",
    {
      script: z.string(),
      name: z.string().optional(),
      args: z.array(z.string()).optional(),
      cwd: z.string(),
    },
    async ({ script, name, args, cwd }) => {
      logToolStart("start-process", {
        script,
        name,
        args,
        cwd,
      });

      try {
        const processId = generateProcessId();
        const command = createCommand(script, args);
        const startedProcess = await startProcess(
          processId,
          script,
          name,
          args,
          cwd
        );

        processes.push(startedProcess);

        logToolEnd("start-process", {
          id: processId,
          name: name || command,
          script,
          args: args || [],
          cwd,
        });

        return {
          content: [
            {
              type: "text",
              text: `Process started: ${name || command} (ID: ${processId})`,
            },
          ],
        };
      } catch (error) {
        logToolError("start-process", error);
        return {
          content: [
            {
              type: "text",
              text: `Error starting process: ${toErrorMessage(error)}`,
            },
          ],
        };
      }
    }
  );

  server.tool(
    "delete-process",
    "Delete a process by ID",
    {
      id: z.string(),
    },
    async ({ id }) => {
      logToolStart("delete-process", { id });

      try {
        const processIndex = processes.findIndex((p) => p.id === id);
        if (processIndex === -1) {
          return {
            content: [
              {
                type: "text",
                text: `Process with ID ${id} not found.`,
              },
            ],
          };
        }
        const processMetadata = processes[processIndex];

        killProcess(processMetadata);
        processes.splice(processIndex, 1);

        logToolEnd("delete-process", { id });

        return {
          content: [
            {
              type: "text",
              text: `Process with ID ${id} has been deleted.`,
            },
          ],
        };
      } catch (error) {
        logToolError("delete-process", error);
        return {
          content: [
            {
              type: "text",
              text: `Error deleting process: ${toErrorMessage(error)}`,
            },
          ],
        };
      }
    }
  );

  server.tool(
    "restart-process",
    "Restart a process by ID",
    {
      id: z.string(),
    },
    async ({ id }) => {
      logToolStart("restart-process", { id });

      try {
        const processIndex = processes.findIndex((p) => p.id === id);
        if (processIndex === -1) {
          return {
            content: [
              {
                type: "text",
                text: `Process with ID ${id} not found.`,
              },
            ],
          };
        }
        const processMetadata = processes[processIndex];

        if (
          processMetadata.status === "running" ||
          processMetadata.status === "error"
        ) {
          killProcess(processMetadata);
        }

        const processId = generateProcessId();
        const newProcess = await startProcess(
          processId,
          processMetadata.script,
          processMetadata.name,
          processMetadata.args,
          processMetadata.cwd
        );
        processes[processIndex] = newProcess;

        logToolEnd("restart-process", { id });

        return {
          content: [
            {
              type: "text",
              text: `Process with ID ${id} has been restarted.`,
            },
          ],
        };
      } catch (error) {
        logToolError("restart-process", error);
        return {
          content: [
            {
              type: "text",
              text: `Error restarting process: ${toErrorMessage(error)}`,
            },
          ],
        };
      }
    }
  );

  server.tool(
    "get-process-info",
    "Get information about a process by ID",
    {
      id: z.string(),
    },
    async ({ id }) => {
      logToolStart("get-process-info", { id });

      try {
        const processMetadata = processes.find((p) => p.id === id);
        if (!processMetadata) {
          return {
            content: [
              {
                type: "text",
                text: `Process with ID ${id} not found.`,
              },
            ],
          };
        }

        logToolEnd("get-process-info", {
          id: processMetadata.id,
          name: processMetadata.name,
        });

        return {
          content: [
            {
              type: "text",
              text:
                `Process ID: ${processMetadata.id}\n` +
                `Name: ${processMetadata.name}\n` +
                `Script: ${processMetadata.script}\n` +
                `Arguments: ${processMetadata.args.join(" ")}\n` +
                `CWD: ${processMetadata.cwd}\n` +
                `Status: ${processMetadata.status}\n` +
                `Exit Code: ${processMetadata.exitCode ?? "N/A"}\n` +
                `Error: ${processMetadata.error ?? "N/A"}`,
            },
          ],
        };
      } catch (error) {
        logToolError("get-process-info", error);
        return {
          content: [
            {
              type: "text",
              text: `Error getting process info: ${toErrorMessage(error)}`,
            },
          ],
        };
      }
    }
  );

  server.tool("list-processes", "List all running processes", {}, async () => {
    logToolStart("list-processes", {});

    try {
      if (processes.length === 0) {
        return {
          content: [
            {
              type: "text",
              text: "No processes are currently running.",
            },
          ],
        };
      }
      const processList = processes.map((p) => ({
        id: p.id,
        name: p.name,
        command: `${p.script} ${p.args.join(" ")}`,
      }));

      logToolEnd("list-processes", { count: processList.length });

      return {
        content: [
          {
            type: "text",
            text: `Running processes:\n${processList
              .map((p) => `${p.id}: ${p.name} (${p.command})`)
              .join("\n")}`,
          },
        ],
      };
    } catch (error) {
      logToolError("list-processes", error);
      return {
        content: [
          {
            type: "text",
            text: `Error listing processes: ${toErrorMessage(error)}`,
          },
        ],
      };
    }
  });

  server.tool(
    "get-process-stdout",
    "Get the stdout of a process by ID",
    {
      id: z.string(),
      chunkCount: z.number().optional(),
    },
    async ({ id, chunkCount = 10 }) => {
      logToolStart("get-process-stdout", { id, chunkCount });

      try {
        const processMetadata = processes.find((p) => p.id === id);
        if (!processMetadata) {
          return {
            content: [
              {
                type: "text",
                text: `Process with ID ${id} not found.`,
              },
            ],
          };
        }
        const stdoutLogs = await processMetadata.stdoutClient.top(chunkCount);
        if (stdoutLogs.length === 0) {
          return {
            content: [
              {
                type: "text",
                text: `No stdout found for process with ID ${id}.`,
              },
            ],
          };
        }
        const stdout = stdoutLogs
          .map((log) => `[${log.timestamp}] ${log.message}`)
          .join("\n");

        logToolEnd("get-process-stdout", { id, chunkCount });

        return {
          content: [
            {
              type: "text",
              text: stdout,
            },
          ],
        };
      } catch (error) {
        logToolError("get-process-stdout", error);
        return {
          content: [
            {
              type: "text",
              text: `Error getting process stdout: ${toErrorMessage(error)}`,
            },
          ],
        };
      }
    }
  );

  server.tool(
    "get-process-stderr",
    "Get the stderr of a process by ID",
    {
      id: z.string(),
      chunkCount: z.number().optional(),
    },
    async ({ id, chunkCount = 10 }) => {
      logToolStart("get-process-stderr", { id, chunkCount });

      try {
        const processMetadata = processes.find((p) => p.id === id);
        if (!processMetadata) {
          return {
            content: [
              {
                type: "text",
                text: `Process with ID ${id} not found.`,
              },
            ],
          };
        }

        const stderrLogs = await processMetadata.stderrClient.top(chunkCount);
        if (stderrLogs.length === 0) {
          return {
            content: [
              {
                type: "text",
                text: `No stderr logs found for process with ID ${id}.`,
              },
            ],
          };
        }

        const stderr = stderrLogs
          .map((log) => `[${log.timestamp}] ${log.message}`)
          .join("\n");

        logToolEnd("get-process-stderr", { id, chunkCount });

        return {
          content: [
            {
              type: "text",
              text: stderr,
            },
          ],
        };
      } catch (error) {
        logToolError("get-process-stderr", error);
        return {
          content: [
            {
              type: "text",
              text: `Error getting process stderr: ${toErrorMessage(error)}`,
            },
          ],
        };
      }
    }
  );

  process.on("beforeExit", () => {
    serverLog("Server is exiting, cleaning up processes...");

    // Clean up all processes before exiting
    cleanup();
  });

  process.on("SIGINT", () => {
    serverLog("Server received SIGINT, cleaning up processes...");

    // Clean up all processes on interrupt signal
    cleanup();
    process.exit(0);
  });

  process.on("SIGTERM", () => {
    serverLog("Server received SIGTERM, cleaning up processes...");

    // Clean up all processes on termination signal
    cleanup();
    process.exit(0);
  });

  process.on("uncaughtException", (error) => {
    serverLog(`Uncaught exception: ${toErrorMessage(error)}`);
    // Clean up all processes on uncaught exception
    cleanup();
    process.exit(1);
  });

  const transport = new StdioServerTransport();
  await server.connect(transport);

  serverLog(`Server started with ID: ${serverId}.`);
} catch (error) {
  serverLog(`Error starting server: ${toErrorMessage(error)}`);
  process.exit(1);
}

// ************************
// *** helper functions ***
// ************************

// Get the error output of a process by ID
function generateProcessId() {
  return nanoid(8);
}

// Get the error output of a process by ID
function cleanup() {
  serverLog("Cleaning up all processes...");

  try {
    // Kill all child processes
    let processMetadata: ProcessMetadata | undefined;
    while ((processMetadata = processes.pop())) {
      try {
        killProcess(processMetadata);
      } catch (error) {
        console.error(`Error killing process ${processMetadata.id}:`, error);
      }
    }

    serverLog("All processes cleaned up successfully.");
  } catch (error) {
    serverLog(`Error during cleanup: ${toErrorMessage(error)}`);
    throw error;
  }
}

async function startProcess(
  processId: string,
  script: string,
  name: string | undefined,
  args: string[] | undefined,
  cwd: string
): Promise<ProcessMetadata> {
  serverLog(
    `Starting process: ${name || script} with args: ${
      args?.join(" ") || ""
    } in cwd: ${cwd}`
  );

  try {
    const command = createCommand(script, args);

    const childProcess = spawn(script, args || [], {
      cwd,
      shell: true,
    });

    childProcess.on("spawn", () => {
      const processMetadata = processes.find((p) => p.id === processId);
      if (processMetadata) {
        processMetadata.status = "running";
      }
    });

    childProcess.on("exit", (code) => {
      const processMetadata = processes.find((p) => p.id === processId);
      if (processMetadata) {
        processMetadata.status = "exited";
        processMetadata.exitCode = code;
      }
    });

    childProcess.on("error", (error) => {
      const processMetadata = processes.find((p) => p.id === processId);
      if (processMetadata) {
        processMetadata.status = "error";
        processMetadata.error = error.message;
      }
    });

    const [stdoutClient, stderrClient] = await Promise.all([
      await createProcessStdoutClient({
        id: processId,
        type: "stdout",
        readable: childProcess.stdout,
        serverId,
      }),
      await createProcessStdoutClient({
        id: processId,
        type: "stderr",
        readable: childProcess.stderr,
        serverId,
      }),
    ]);

    serverLog(
      `Process started: ${name || script} with args: ${
        args?.join(" ") || ""
      } in cwd: ${cwd}`
    );

    return {
      id: processId,
      name: name || command,
      script,
      args: args || [],
      cwd,
      status: "spawning",
      error: null,
      exitCode: null,
      process: childProcess,
      stdoutClient,
      stderrClient,
    };
  } catch (error) {
    serverLog(`Error starting process: ${name || script} - ${error}`);
    throw error;
  }
}

function killProcess(processMetadata: ProcessMetadata) {
  serverLog(
    `Killing process: ${processMetadata.name} (ID: ${processMetadata.id})`
  );

  try {
    processMetadata.stdoutClient.close();
    processMetadata.stderrClient.close();
    processMetadata.process.kill();
    serverLog(
      `Process killed: ${processMetadata.name} (ID: ${processMetadata.id})`
    );
  } catch (error) {
    serverLog(
      `Error killing process: ${processMetadata.name} (ID: ${processMetadata.id}) - ${error}`
    );
    throw error;
  }
}

function createCommand(script: string, args: string[] | undefined): string {
  return [script, ...(args || [])].join(" ");
}

function serverLog(message: string) {
  log(message, { id: serverId });
}

function logToolStart(toolName: string, args: any) {
  serverLog(`Tool started: ${toolName} with args: ${JSON.stringify(args)}`);
}

function logToolEnd(toolName: string, result: any) {
  serverLog(`Tool ended: ${toolName} with result: ${JSON.stringify(result)}`);
}

function logToolError(toolName: string, error: any) {
  serverLog(`Tool error: ${toolName} - ${toErrorMessage(error)}`);
}

function isError(error: unknown): error is Error {
  return (
    error instanceof Error ||
    (typeof error === "object" && error !== null && "message" in error)
  );
}

function toErrorMessage(error: unknown): string {
  if (isError(error)) {
    return error.message;
  }
  return String(error);
}
