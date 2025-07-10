# procm-mcp

A Model Context Protocol (MCP) server for process management.

This tool allows you to start, stop, restart, and monitor processes through the MCP Tools and cleanup started processes on exit automatically.

## Installation

```bash
npm i -D procm-mcp
```

`.mcp.json`

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

## Tools

- `start-process` Start a new process with specified script and arguments
  - `script` (required): The script/command to execute
  - `name` (optional): A friendly name for the process
  - `args` (optional): Array of arguments to pass to the script
  - `cwd` (required): Working directory for the process
- `delete-process` Stop and remove a process by ID
  - `id` (required): The process ID
- `restart-process` Restart an existing process by ID
  - `id` (required): The process ID
- `get-process-info` Get detailed information about a process
  - `id` (required): The process ID
- `list-processes` List all currently managed processes
  - No parameters required
- `get-process-stdout` Retrieve stdout logs from a process
  - `id` (required): The process ID
  - `chunkCount` (optional): Number of recent log entries to retrieve (default: 10)
- `get-process-stderr` Retrieve stderr logs from a process
  - `id` (required): The process ID
  - `chunkCount` (optional): Number of recent log entries to retrieve (default: 10)
- `allow-process-creation` Allow specific processes to be created
  - `script` (required): The script/command to allow
  - `args` (optional): Array of arguments
  - `cwd` (optional): Working directory

## Security

procm-mcp is designed with security in mind. It implements a permission system that allows only specific commands to be executed in specific directories, preventing arbitrary command execution. You can pre-approve specific processes using the `allow-process-creation` tool to whitelist certain commands before they are executed.

**Important**: Be cautious when using `allow-*` tools as they grant execution permissions to LLMs. Do not grant unconditional execution permissions without careful consideration of the security implications.

## Teaching LLMs

Add this to your `CLAUDE.md` to teach LLMs how to use this MCP server:

```md
# CLAUDE.md

### Process Management

- Use procm-mcp for launching processes.
- When launching docker-compose or similar tools, do not use options like -d that run in the background. Always launch them in the foreground.
```

## License

MIT
