/**
 * Compiles PotluckRegistry.sol to a PolkaVM (PVM) blob with Parity's resolc, from the same source
 * Foundry compiles to EVM bytecode. Output: out-pvm/PotluckRegistry.{polkavm,abi.json}.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { compile, version } from "@parity/resolc";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const sourcePath = "src/PotluckRegistry.sol";

async function main(): Promise<void> {
  const content = readFileSync(join(root, sourcePath), "utf8");
  const output = await compile(
    { [sourcePath]: { content } },
    { optimizer: { enabled: true, mode: "z" } },
  );
  const errors = (output.errors ?? []).filter((e) => e.severity === "error");
  for (const e of output.errors ?? []) console.error(e.formattedMessage);
  if (errors.length > 0) throw new Error(`resolc failed with ${errors.length} error(s)`);

  const contract = output.contracts[sourcePath]?.PotluckRegistry;
  if (!contract) throw new Error("PotluckRegistry missing from resolc output");
  const blob = Buffer.from(contract.evm.bytecode.object, "hex");
  const outDir = join(root, "out-pvm");
  mkdirSync(outDir, { recursive: true });
  writeFileSync(join(outDir, "PotluckRegistry.polkavm"), blob);
  writeFileSync(join(outDir, "PotluckRegistry.abi.json"), `${JSON.stringify(contract.abi, null, 2)}\n`);
  console.log(`resolc ${version()}: PotluckRegistry.polkavm ${blob.length} bytes (magic ${blob.subarray(0, 4).toString("hex")})`);
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
