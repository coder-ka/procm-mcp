# CLAUDE.md

### Process Management

- Use procm-mcp for launching processes.
- Make sure to separate script and args properly. For example, do not specify node index.js as the script. Instead, use script: 'node' and args: ['index.js'].
- When launching docker-compose or similar tools, do not use options like -d that run in the background. Always launch them in the foreground.
