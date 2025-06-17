# procm-mcp

A Model Context Protocol (MCP) server for process management. This tool allows you to start, stop, restart, and monitor processes through the MCP interface with automatic cleanup on exit.

## Features

- **Process Management**: Start, stop, and restart processes
- **Process Monitoring**: View process status, stdout, and stderr logs
- **Process Listing**: List all running processes
- **Log Management**: Retrieve recent stdout/stderr output from processes
- **Automatic Cleanup**: All spawned processes are automatically terminated when the server exits

## Installation

```bash
npm i -D procm-mcp
```

## `.mcp.json`

```json
{
  "mcpServers": {
    "procm-mcp": {
      "command": "node",
      "args": ["./node_modules/procm-mcp/build/index.js"],
      "env": {}
    }
  }
}
```

## Available Tools

### start-process
Start a new process with specified script and arguments
- `script` (required): The script/command to execute
- `name` (optional): A friendly name for the process
- `args` (optional): Array of arguments to pass to the script
- `cwd` (required): Working directory for the process

### delete-process
Stop and remove a process by ID
- `id` (required): The process ID

### restart-process
Restart an existing process by ID
- `id` (required): The process ID

### get-process-info
Get detailed information about a process
- `id` (required): The process ID

### list-processes
List all currently managed processes
- No parameters required

### get-process-stdout
Retrieve stdout logs from a process
- `id` (required): The process ID
- `chunkCount` (optional): Number of recent log entries to retrieve (default: 10)

### get-process-stderr
Retrieve stderr logs from a process
- `id` (required): The process ID
- `chunkCount` (optional): Number of recent log entries to retrieve (default: 10)

## Process Status

Processes can have the following statuses:
- `spawning` - Process is being created
- `running` - Process is actively running
- `exited` - Process has terminated normally
- `error` - Process encountered an error

## Teaching LLMs

Add this to your `CLAUDE.md` to teach LLMs how to use this MCP server:

```md
# CLAUDE.md

### Process Management
- When starting processes, please use the procm-mcp tools.
- Split into script and args
```

## License

MIT
