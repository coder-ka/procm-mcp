import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { nanoid } from "nanoid";
import { ChildProcess, spawn } from "child_process";
import kill from "tree-kill";
import {
  createProcessStdoutClient,
  ProcessStdoutClient,
} from "./process-stdout-client.js";
import { log } from "./logger.js";
import { toErrorMessage } from "./error.js";
import {
  allowProcessCreation,
  checkProcessCreationAllowed,
  deleteAllowedProcessCreation,
  getAllowedProcesses,
} from "./allowed-process-creations.js";
import { CallToolResult } from "@modelcontextprotocol/sdk/types.js";

const serverId = nanoid(6);
const logServerId = `${serverId}(${process.pid})`;
type ProcessMetadata = {
  id: string;
  pid: number | undefined;
  name: string;
  script: string;
  args: string[];
  cwd: string;
  envs: Record<string, string>;
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
    "allow-start-process",
    "Allow process creation",
    {
      script: z.string(),
      args: z.array(z.string()).optional(),
      cwd: z.string().optional(),
    },
    async ({ script, args = [], cwd = process.cwd() }) => {
      logToolStart("allow-start-process", {
        script,
        args,
        cwd,
      });

      try {
        const validateScriptError = validateScript(script);
        if (validateScriptError) {
          return validateScriptError;
        }

        await allowProcessCreation({
          script,
          args,
          cwd,
        });

        logToolEnd("allow-start-process", {
          script,
          args,
          cwd,
        });

        return {
          content: [
            {
              type: "text",
              text: `Process creation allowed for script: ${script} with args: ${args.join(
                " "
              )} in cwd: ${cwd}.`,
            },
          ],
        };
      } catch (error) {
        logToolError("allow-start-process", error);
        return {
          content: [
            {
              type: "text",
              text: `Error allowing process creation: ${toErrorMessage(error)}`,
            },
          ],
        };
      }
    }
  );

  // list allowed processes
  server.tool(
    "list-allowed-processes-in-cwd",
    "List allowed processes in current working directory",
    {
      cwd: z.string().optional(),
    },
    async ({ cwd = process.cwd() }) => {
      try {
        logToolStart("list-allowed-processes", {});

        const allowedProcesses = await getAllowedProcesses();
        return {
          content: [
            {
              type: "text",
              text: `Allowed processes:\n${allowedProcesses
                .filter((x) => x.cwd === cwd)
                .map((x) => `${x.script} ${x.args.join(" ")} in ${x.cwd}`)
                .join("\n")}`,
            },
          ],
        };
      } catch (error) {
        logToolError("list-allowed-processes", error);
        return {
          content: [
            {
              type: "text",
              text: `Error listing allowed processes: ${toErrorMessage(error)}`,
            },
          ],
        };
      } finally {
        logToolEnd("list-allowed-processes", {});
      }
    }
  );

  // delete allowed process
  server.tool(
    "delete-allowed-process",
    "Delete an allowed process",
    {
      script: z.string(),
      args: z.array(z.string()).optional(),
      cwd: z.string().optional(),
    },
    async ({ script, args = [], cwd = process.cwd() }) => {
      try {
        logToolStart("delete-allowed-process", {
          script,
          args,
          cwd,
        });

        const validateScriptError = validateScript(script);
        if (validateScriptError) {
          return validateScriptError;
        }

        await deleteAllowedProcessCreation({
          script,
          args,
          cwd,
        });

        return {
          content: [
            {
              type: "text",
              text: `Allowed process deleted for script: ${script} with args: ${args.join(
                " "
              )} in cwd: ${cwd}.`,
            },
          ],
        };
      } catch (error) {
        logToolError("delete-allowed-process", error);
        return {
          content: [
            {
              type: "text",
              text: `Error deleting allowed process: ${toErrorMessage(error)}`,
            },
          ],
        };
      } finally {
        logToolEnd("delete-allowed-process", {
          script,
          args,
          cwd,
        });
      }
    }
  );

  server.tool(
    "start-process",
    `Start a new process.
Warning: Do not invoke background processes that will not exit automatically, and stdout/stderr will not be captured.`,
    {
      script: z.string(),
      name: z.string().optional(),
      args: z.array(z.string()).optional(),
      cwd: z.string(),
      envs: z.record(z.string()).optional(),
    },
    async ({ script, name, args = [], cwd = process.cwd(), envs = {} }) => {
      logToolStart("start-process", {
        script,
        name,
        args,
        cwd,
      });

      try {
        const validateScriptError = validateScript(script);
        if (validateScriptError) {
          return validateScriptError;
        }

        const isAllowed = await checkProcessCreationAllowed({
          script,
          args: args,
          cwd: cwd,
        });
        if (!isAllowed) {
          return {
            content: [
              {
                type: "text",
                text: `Process creation is not allowed for script: ${script} with args: ${args.join(
                  " "
                )} in cwd: ${cwd}. Please allow it first using the allow-start-process tool.`,
              },
            ],
          };
        }

        const processId = generateProcessId();
        const command = createCommand(script, args);
        const startedProcess = await startProcess(
          processId,
          script,
          name,
          args,
          cwd,
          envs
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

        await killProcess(processMetadata);
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

        await killProcess(processMetadata);

        const newProcess = await startProcess(
          id,
          processMetadata.script,
          processMetadata.name,
          processMetadata.args,
          processMetadata.cwd,
          processMetadata.envs
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
                `Process PID: ${processMetadata.pid}\n` +
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
          .map((log) => `[${log.timestamp.toISOString()}] ${log.message}`)
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
          .map((log) => `[${log.timestamp.toISOString()}] ${log.message}`)
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

  let cleanupped: Promise<void> | undefined;
  process.on("beforeExit", async () => {
    if (!cleanupped) {
      serverLog("Server is exiting, cleaning up processes...");

      // Clean up all processes before exiting
      cleanupped = cleanupped || cleanup();
      await cleanupped;
    }
  });

  process.on("SIGINT", async () => {
    serverLog("Server received SIGINT, cleaning up processes...");

    // Clean up all processes on interrupt signal
    cleanupped = cleanupped || cleanup();
    await cleanupped;
    exitProcess(0);
  });

  process.on("SIGTERM", async () => {
    serverLog("Server received SIGTERM, cleaning up processes...");

    // Clean up all processes on termination signal
    cleanupped = cleanupped || cleanup();
    await cleanupped;
    exitProcess(0);
  });

  process.on("uncaughtException", async (error) => {
    serverLog(`Uncaught exception: ${toErrorMessage(error)}`);
    // Clean up all processes on uncaught exception
    cleanupped = cleanupped || cleanup();
    await cleanupped;
    exitProcess(1);
  });

  process.stdin.on("close", async () => {
    serverLog("Server stdin closed, cleaning up processes...");
    // Clean up all processes when stdin is closed
    cleanupped = cleanupped || cleanup();
    await cleanupped;
    exitProcess(0);
  });

  const transport = new StdioServerTransport();
  await server.connect(transport);

  serverLog(`Server started with ID: ${serverId}, PID: ${process.pid}.`);
} catch (error) {
  serverLog(`Error starting server: ${toErrorMessage(error)}`);
  exitProcess(1);
}

// ************************
// *** helper functions ***
// ************************

// Validate the script name and return an error message if it contains spaces
function validateScript(script: string): CallToolResult | undefined {
  if (script.includes(" ")) {
    return {
      content: [
        {
          type: "text",
          text: `Script name cannot contain spaces. Please split the command into script and args.In this case, script: "${
            script.split(" ")[0]
          }", args: ["${script.split(" ").slice(1).join('", "')}"]`,
        },
      ],
    };
  }

  if (script.includes("=")) {
    return {
      content: [
        {
          type: "text",
          text: `You seems to be trying to setting an environment variable before command, Please specify the environment variable in the "envs" field`,
        },
      ],
    };
  }
}

// Get the error output of a process by ID
function generateProcessId() {
  return nanoid(8);
}

// Get the error output of a process by ID
async function cleanup() {
  serverLog("Cleaning up all processes...");

  try {
    // Kill all child processes
    await Promise.all(
      processes.map((processMetadata) => killProcess(processMetadata))
    );

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
  cwd: string,
  envs: Record<string, string>
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
      env: {
        ...process.env,
        ...envs,
      },
    });

    childProcess.on("spawn", () => {
      const processMetadata = processes.find((p) => p.id === processId);
      if (processMetadata) {
        processMetadata.status = "running";
        processMetadata.pid = childProcess.pid;
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
        serverId: logServerId,
      }),
      await createProcessStdoutClient({
        id: processId,
        type: "stderr",
        readable: childProcess.stderr,
        serverId: logServerId,
      }),
    ]);

    serverLog(
      `Process started: ${name || script} with args: ${
        args?.join(" ") || ""
      } in cwd: ${cwd}`
    );

    return {
      id: processId,
      pid: childProcess.pid,
      name: name || command,
      script,
      args: args || [],
      cwd,
      envs,
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

async function killProcess(processMetadata: ProcessMetadata) {
  serverLog(
    `Killing process: ${processMetadata.name} (ID: ${processMetadata.id})`
  );

  try {
    const pid = processMetadata.process.pid;
    if (pid) {
      const processExited = new Promise<void>((resolve) => {
        const onExit = () => {
          clearTimeout(forceKillTimeoutId);
          serverLog(
            `Process exited: ${processMetadata.name} (ID: ${processMetadata.id})`
          );
          resolve();
        };
        const forceKillTimeoutId = setTimeout(() => {
          processMetadata.process.off("exit", onExit);

          serverLog(
            `Process did not exit in time, force killing: ${processMetadata.name} (ID: ${processMetadata.id})`
          );
          killProcessTree(pid, processMetadata, true);

          resolve();
        }, 10 * 1000);
        processMetadata.process.on("exit", onExit);
      });

      await killProcessTree(pid, processMetadata);

      await processExited;

      await Promise.all([
        processMetadata.stdoutClient.close(),
        processMetadata.stderrClient.close(),
      ]);
    } else {
      serverLog(
        `Process with ID ${processMetadata.id} has no PID, cannot kill.`
      );
    }
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
  log(message, { id: logServerId });
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

function exitProcess(code: number) {
  serverLog(`Exiting process with code: ${code}`);
  process.exit(code);
}

async function killProcessTree(
  pid: number,
  processMetadata: ProcessMetadata,
  force = false
): Promise<void> {
  new Promise<void>((resolve, reject) => {
    kill(pid, force ? "SIGKILL" : "SIGTERM", async (err) => {
      if (err) {
        serverLog(
          `Error killing process: ${processMetadata.name} (ID: ${processMetadata.id}) - ${err}`
        );
        reject(err);
      } else {
        // await sleep(5000);
        serverLog(
          `Process killed successfully: ${processMetadata.name} (ID: ${processMetadata.id})`
        );
        resolve();
      }
    });
  });
}
