import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { nanoid } from "nanoid";
import { ChildProcess, spawn } from "child_process";
import {
  createProcessStdoutClient,
  ProcessStdoutClient,
} from "./process-stdout-client.js";

const server = new McpServer({
  name: "procm-mcp",
  version: "1.0.0",
});

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
    const processId = generateProcessId();
    const command = createCommand(script, args);
    const startedProcess = await startProcess(script, name, args, cwd);

    processes.push(startedProcess);

    return {
      content: [
        {
          type: "text",
          text: `Process started: ${name || command} (ID: ${processId})`,
        },
      ],
    };
  }
);

server.tool(
  "delete-process",
  "Delete a process by ID",
  {
    id: z.string(),
  },
  async ({ id }) => {
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
    return {
      content: [
        {
          type: "text",
          text: `Process with ID ${id} has been deleted.`,
        },
      ],
    };
  }
);

server.tool(
  "restart-process",
  "Restart a process by ID",
  {
    id: z.string(),
  },
  async ({ id }) => {
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
    const newProcess = await startProcess(
      processMetadata.script,
      processMetadata.name,
      processMetadata.args,
      processMetadata.cwd
    );
    processes[processIndex] = newProcess;
    return {
      content: [
        {
          type: "text",
          text: `Process with ID ${id} has been restarted.`,
        },
      ],
    };
  }
);

server.tool(
  "get-process-info",
  "Get information about a process by ID",
  {
    id: z.string(),
  },
  async ({ id }) => {
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
  }
);

server.tool("list-processes", "List all running processes", {}, async () => {
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
});

server.tool(
  "get-process-stdout",
  "Get the stdout of a process by ID",
  {
    id: z.string(),
    chunkCount: z.number().optional(),
  },
  async ({ id, chunkCount = 10 }) => {
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
    const stdout = stdoutLogs.map((log) => log.message).join("\n");
    return {
      content: [
        {
          type: "text",
          text: stdout,
        },
      ],
    };
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

    const stderr = stderrLogs.map((log) => log.message).join("\n");

    return {
      content: [
        {
          type: "text",
          text: stderr,
        },
      ],
    };
  }
);

process.on("beforeExit", () => {
  // Clean up all processes before exiting
  cleanup();
});

process.on("SIGINT", () => {
  // Clean up all processes on interrupt signal
  cleanup();
  process.exit(0);
});

process.on("SIGTERM", () => {
  // Clean up all processes on termination signal
  cleanup();
  process.exit(0);
});

const transport = new StdioServerTransport();
await server.connect(transport);

// ************************
// *** helper functions ***
// ************************

// Get the error output of a process by ID
function generateProcessId() {
  return nanoid(8);
}

// Get the error output of a process by ID
function cleanup() {
  // Kill all child processes
  let processMetadata: ProcessMetadata | undefined;
  while ((processMetadata = processes.pop())) {
    try {
      killProcess(processMetadata);
    } catch (error) {
      console.error(`Error killing process ${processMetadata.id}:`, error);
    }
  }
}

async function startProcess(
  script: string,
  name: string | undefined,
  args: string[] | undefined,
  cwd: string
): Promise<ProcessMetadata> {
  const processId = generateProcessId();
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
    stdoutClient: await createProcessStdoutClient({
      id: processId,
      type: "stdout",
      readable: childProcess.stdout,
    }),
    stderrClient: await createProcessStdoutClient({
      id: processId,
      type: "stderr",
      readable: childProcess.stderr,
    }),
  };
}

function killProcess(processMetadata: ProcessMetadata) {
  processMetadata.stdoutClient.close();
  processMetadata.stderrClient.close();
  processMetadata.process.kill();
}

function createCommand(script: string, args: string[] | undefined): string {
  return [script, ...(args || [])].join(" ");
}
