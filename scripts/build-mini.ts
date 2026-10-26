import { build } from "esbuild";
import { readdir, mkdir, cp, writeFile, rm, readFile } from "node:fs/promises";
import path from "node:path";
import Ajv from "ajv";
import standaloneCode from "ajv/dist/standalone/index.js";
import { positionSchema, contributionSchema } from "../packages/contracts";
const production = process.argv.includes("--production");
const apiBase =
  process.env.MINI_API_BASE ??
  (production ? "" : "http://127.0.0.1:3000/api/v1");
if (
  production &&
  (!apiBase.startsWith("https://") ||
    !process.env.MINI_APP_ID ||
    !/^wx[a-f0-9]{16}$/.test(process.env.MINI_APP_ID))
)
  throw new Error(
    "Production requires HTTPS MINI_API_BASE and real MINI_APP_ID",
  );
const source = "apps/miniprogram/src",
  destination = "dist/miniprogram";
await rm(destination, { recursive: true, force: true });
await mkdir(destination, { recursive: true });
async function walk(dir: string): Promise<string[]> {
  return (
    await Promise.all(
      (await readdir(dir, { withFileTypes: true })).map(async (e) =>
        e.isDirectory()
          ? walk(path.join(dir, e.name))
          : [path.join(dir, e.name)],
      ),
    )
  ).flat();
}
const files = await walk(source);
for (const file of files.filter((f) => /\.(wxml|wxss|json)$/.test(f))) {
  const target = path.join(destination, path.relative(source, file));
  await mkdir(path.dirname(target), { recursive: true });
  await cp(file, target);
}
const entries = files.filter(
  (f) =>
    f.endsWith(".ts") &&
    !f.endsWith(".d.ts") &&
    !f.endsWith(`${path.sep}types.ts`),
);
const schemaCompiler = new Ajv({
  allErrors: true,
  strict: false,
  code: { source: true },
});
schemaCompiler.addSchema(positionSchema, "position");
schemaCompiler.addSchema(contributionSchema, "contribution");
const validators = standaloneCode(schemaCompiler, {
  validatePosition: "position",
  validateContribution: "contribution",
});
const result = await build({
  entryPoints: entries,
  outbase: source,
  outdir: destination,
  bundle: true,
  platform: "neutral",
  mainFields: ["module", "main"],
  format: "cjs",
  target: "es2018",
  minify: production,
  metafile: true,
  plugins: [
    {
      name: "mini-shared-services-and-validation",
      setup(b) {
        b.onResolve({ filter: /services\/(api|store)$|^\.\/api$/ }, (args) => {
          if (!args.importer) return;
          const resolved = path.resolve(
            path.dirname(args.importer),
            `${args.path}.ts`,
          );
          if (!resolved.includes(`${path.sep}services${path.sep}`)) return;
          let relative = path
            .relative(path.dirname(args.importer), resolved)
            .replace(/\\/g, "/")
            .replace(/\.ts$/, ".js");
          if (!relative.startsWith(".")) relative = `./${relative}`;
          return { path: relative, external: true };
        });
        b.onLoad(
          { filter: /packages[\\/]contracts[\\/]index\.ts$/ },
          async (args) => {
            let contents = await readFile(args.path, "utf8");
            contents = contents.replace(/import Ajv from ["']ajv["'];?/, "");
            contents = contents.replace(
              /const ajv = new Ajv[\s\S]*?export function positionKey/,
              `const { validatePosition, validateContribution } = require('mini-validators'); export { validatePosition, validateContribution };\nexport function positionKey`,
            );
            return {
              contents,
              loader: "ts",
              resolveDir: path.dirname(args.path),
            };
          },
        );
        b.onResolve({ filter: /^mini-validators$/ }, () => ({
          path: "validators",
          namespace: "mini-generated",
        }));
        b.onLoad({ filter: /.*/, namespace: "mini-generated" }, () => ({
          contents: validators,
          loader: "js",
          resolveDir: path.resolve("node_modules"),
        }));
      },
    },
  ],
  define: {
    __API_BASE__: JSON.stringify(apiBase),
    __DEVELOPMENT__: String(!production),
    __APP_ID__: JSON.stringify(process.env.MINI_APP_ID ?? "touristappid"),
  },
});
if (
  production &&
  Object.keys(result.metafile!.inputs).some((i) => i.startsWith("fixtures/"))
)
  throw new Error("Production must not include fixtures");
for (const file of files.filter((f) => f.endsWith(".wxml"))) {
  const json = path.join(
    destination,
    path.relative(source, file).replace(/\.wxml$/, ".json"),
  );
  await writeFile(json, JSON.stringify({ usingComponents: {} }));
}
await writeFile(
  path.join(destination, "project.config.json"),
  JSON.stringify(
    {
      appid: process.env.MINI_APP_ID ?? "touristappid",
      projectname: "LIVERSE",
      compileType: "miniprogram",
      miniprogramRoot: "./",
      setting: { es6: false, minified: production, urlCheck: production },
      libVersion: "3.7.12",
    },
    null,
    2,
  ),
);
const allOutput = await walk(destination);
let total = 0;
for (const file of allOutput) total += (await readFile(file)).length;
console.log(
  `Mini program built: ${destination}; ${(total / 1024).toFixed(0)} KiB; ${production ? "production" : "development"}`,
);
