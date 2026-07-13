const { spawnSync } = require("node:child_process");
const path = require("node:path");

const root = path.resolve(__dirname, "../studio/food-shorts");
const commands = ["lint", "validate", "inspect"];

for (let index = 1; index <= 10; index += 1) {
  const id = `food-${String(index).padStart(3, "0")}`;
  const cwd = path.join(root, id);

  for (const command of commands) {
    const result = spawnSync(
      "npx",
      ["--yes", "hyperframes@0.7.33", command],
      { cwd, encoding: "utf8", stdio: "pipe" },
    );

    if (result.status !== 0) {
      process.stderr.write(result.stdout);
      process.stderr.write(result.stderr);
      process.exit(result.status || 1);
    }
  }

  console.log(`${id}: lint, validate, inspect passed`);
}
