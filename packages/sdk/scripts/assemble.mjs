// Assembles the publishable `potluck-sdk` package from the built workspace packages: each one's
// dist/ goes to dist/<name>/, and imports between them become relative paths, so consumers get
// one package with the original modules and declarations (no re-bundling, tree-shakable).
import { existsSync } from "node:fs";
import { mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const packages = ["client", "core", "spec"];
const out = join(root, "dist");

await rm(out, { recursive: true, force: true });
for (const name of packages) {
  const from = join(root, "..", name, "dist");
  if (!existsSync(join(from, "index.js"))) {
    throw new Error(
      `packages/${name} is not built: run pnpm --filter @potluck/client... build first`,
    );
  }
  await mkdir(join(out, name), { recursive: true });
  for (const file of await readdir(from)) {
    if (!file.endsWith(".js") && !file.endsWith(".d.ts")) continue;
    let text = await readFile(join(from, file), "utf8");
    text = text
      .replace(/^\/\/# sourceMappingURL=.*$/m, "")
      .replace(
        /(["'])@potluck\/(client|core|spec)\1/g,
        (_, q, pkg) => `${q}../${pkg}/index.js${q}`,
      );
    const left = text.match(/["']@potluck\/[^"']+["']/);
    if (left) throw new Error(`${name}/${file}: unresolved workspace import ${left[0]}`);
    await writeFile(join(out, name, file), text);
  }
}
const entry = `${packages.map((name) => `export * from "./${name}/index.js";`).join("\n")}\n`;
await writeFile(join(out, "index.js"), entry);
await writeFile(join(out, "index.d.ts"), entry);
console.log(`potluck-sdk assembled from ${packages.join(", ")}`);
