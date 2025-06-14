# mcp-server-template

This is a MCP server template using `StdioServerTransport`.

Change `your-mcp-server-name` in package.json and the .mcp.json example in the next to this section.

Edit this section to explain the purpose of your MCP server.

## .mcp.json

To setup mcp server in you project.

Create `.mcp.json` at the project root like below.

```json
{
  "mcpServers": {
    "your-mcp-server-name": {
      "command": "node",
      "args": ["./build/index.js"],
      "env": {}
    }
  }
}
```

## Tools

- `add` ・・・ `add` function that takes two numbers and returns their sum
  - `a`: `number`
  - `b`: `number`

## Teaching LLMs

This is an example text teaching LLMs how to use this mcp server.

```md
## your-mcp-server-name

- Use `add` tool to calculate sum of two numbers.
```

## License

MIT
