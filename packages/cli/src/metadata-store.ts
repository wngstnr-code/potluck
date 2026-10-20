import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { MetadataStore } from "@potluck/core";

/** Caches raw SCALE metadata per (genesis, spec version) on disk; metadata is ~0.6 MB per version. */
export class FileMetadataStore implements MetadataStore {
  constructor(private readonly dir: string) {}

  async get(specVersion: number): Promise<Uint8Array | undefined> {
    try {
      return new Uint8Array(await readFile(join(this.dir, `${specVersion}.scale`)));
    } catch {
      return undefined;
    }
  }

  async put(specVersion: number, metadata: Uint8Array): Promise<void> {
    await mkdir(this.dir, { recursive: true });
    await writeFile(join(this.dir, `${specVersion}.scale`), metadata);
  }
}
