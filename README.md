# procm-mcp

A Model Context Protocol (MCP) server for process management.

## Supported features

- Secure and automatable process creation
- Cleanup created processes automatically on termination (e.g. exiting claude code)
- Common process management features supported, restarting, deleting, checking status or retreving stdout/stderr of processes

Using these features, LLMs start processes like development servers, docker-compose, or test watchers and check their outputs to fix bugs automatically.

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

## Secure process creation

You can permit LLMs to use `start-process` tool without confirmation, because procm-mcp only allow whitelisted process creations.

LLMs will ask you to use `allow-start-process` tool to add specific process creation to the whitelist.

Once you allow a process creation, you don't have to confirming it anymore as long as the command and the working directory are the same.

I call it "allow-x pattern", which can balances security and usability in MCP.

**Warning: Do not permit LLMs to use `allow-start-process` without confirmation.That means "Do anything you want to".**

## Teaching LLMs

Add this to your `CLAUDE.md` to teach LLMs how to use this MCP server:

```md
# CLAUDE.md

### Process Management

- Use procm-mcp for launching processes.
- When launching docker-compose or similar tools, do not use options like -d that run in the background. Always launch them in the foreground.
```

## Tools

- `allow-start-process` Allow specific processes to be created
  - `script` (required): The script/command to allow
  - `args` (optional): Array of arguments
  - `cwd` (optional): Working directory
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

## License

MIT
