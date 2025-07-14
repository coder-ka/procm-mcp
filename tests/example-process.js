let i = 0;

setInterval(() => {
  console.log(process.cwd());
  console.log(++i);
  console.log(process.env.PROCM_MCP_TEST_VAR1);
  console.error("This is an error message" + i);
}, 1000);

process.on("SIGTERM", () => {
  console.log("Received SIGTERM, exiting gracefully...");
  process.exit(0);
});
