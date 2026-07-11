process.env.PREFLIGHT_ONLY = "true";

const { main } = require("./deploy");

main().catch((error) => {
  console.error("Deployment preflight failed:", error);
  process.exitCode = 1;
});
