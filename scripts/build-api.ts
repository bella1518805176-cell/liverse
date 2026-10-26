import { writeFile } from "node:fs/promises";
await writeFile("build/api/package.json", JSON.stringify({ type: "commonjs" }));
