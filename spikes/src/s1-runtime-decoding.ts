/**
 * S1: Decode `System.Events` across runtime upgrades of Polkadot Asset Hub inside the Potluck
 * window (Revive activation → head), using one metadata per runtime version, exactly as the
 * publisher and the client verifier will have to.
 *
 * Steps:
 *  1. Map runtime-version boundaries: sample the window (batched block hashes), then binary-search
 *     every boundary between samples with different spec versions.
 *  2. For each boundary, decode the events of the last block of the old runtime and the first
 *     block of the new runtime with their own metadata; require a complete decode (no leftover
 *     bytes) and resolvable section/method names.
 *  3. Negative control: decode an old-runtime block with the newest metadata and record whether it
 *     fails or mis-decodes, proving per-version metadata is required.
 */
import { WsProvider } from "@polkadot/api";
import { Metadata, TypeRegistry } from "@polkadot/types";
import { hexToU8a } from "@polkadot/util";
import { xxhashAsHex } from "@polkadot/util-crypto";
import {
  ENDPOINTS,
  log,
  mapPool,
  nowIso,
  POLKADOT_AH_REVIVE_START,
  withTimeout,
  writeResult,
} from "./common.js";

const SYSTEM_EVENTS_KEY = `${xxhashAsHex("System", 128)}${xxhashAsHex("Events", 128).slice(2)}`;
const SAMPLES = 160;

interface Decoded {
  ok: boolean;
  events: number;
  bytes: number;
  consumed: number;
  names: string[];
  error?: string;
}

async function main(): Promise<void> {
  const provider = new WsProvider(ENDPOINTS.polkadotAssetHub, false);
  await provider.connect();
  await withTimeout(provider.isReady, 20_000, "ready");
  const send = <T>(method: string, params: unknown[]) =>
    withTimeout(provider.send<T>(method, params), 60_000, method);

  const head = Number.parseInt((await send<{ number: string }>("chain_getHeader", [])).number, 16);
  const specAt = async (hash: string) =>
    (await send<{ specVersion: number }>("state_getRuntimeVersion", [hash])).specVersion;
  const hashOf = (block: number) => send<string>("chain_getBlockHash", [block]);

  // 1. Sample the window.
  const step = Math.floor((head - POLKADOT_AH_REVIVE_START) / SAMPLES);
  const sampleBlocks = Array.from({ length: SAMPLES + 1 }, (_, i) =>
    Math.min(POLKADOT_AH_REVIVE_START + i * step, head),
  );
  const sampleHashes = await send<string[]>("chain_getBlockHash", [sampleBlocks]);
  const sampleSpecs = await mapPool(sampleHashes, 16, (hash) => specAt(hash));
  log(
    `sampled ${sampleBlocks.length} blocks; spec versions seen: ${[...new Set(sampleSpecs)].join(", ")}`,
  );

  // Binary-search every boundary between consecutive samples with different specs.
  const boundaries: { block: number; from: number; to: number }[] = [];
  let probes = 0;
  for (let i = 1; i < sampleBlocks.length; i++) {
    if (sampleSpecs[i] === sampleSpecs[i - 1]) continue;
    let lo = sampleBlocks[i - 1] as number; // old spec
    let hi = sampleBlocks[i] as number; // new spec (may hide >1 upgrade; resolved below)
    const oldSpec = sampleSpecs[i - 1] as number;
    while (hi - lo > 1) {
      const mid = Math.floor((lo + hi) / 2);
      probes++;
      if ((await specAt(await hashOf(mid))) === oldSpec) lo = mid;
      else hi = mid;
    }
    const newSpec = await specAt(await hashOf(hi));
    boundaries.push({ block: hi, from: oldSpec, to: newSpec });
    if (newSpec !== sampleSpecs[i]) {
      // More than one upgrade between these samples: re-check from `hi` to the sample.
      sampleBlocks.splice(i, 0, hi);
      sampleSpecs.splice(i, 0, newSpec);
    }
  }
  log(`found ${boundaries.length} runtime upgrades in the window (${probes} binary-search probes)`);

  // Metadata cache per spec version (the publisher keeps exactly this cache).
  const metadataCache = new Map<
    number,
    { registry: TypeRegistry; eventsTypeId: number; bytes: number; fetchMs: number }
  >();
  const registryFor = async (hash: string, spec: number) => {
    const cached = metadataCache.get(spec);
    if (cached) return cached;
    const started = performance.now();
    const hex = await send<string>("state_getMetadata", [hash]);
    const fetchMs = Math.round(performance.now() - started);
    const registry = new TypeRegistry();
    const metadata = new Metadata(registry, hex as `0x${string}`);
    registry.setMetadata(metadata);
    const latest = metadata.asLatest;
    const system = latest.pallets.find((p) => p.name.toString() === "System");
    const eventsEntry = system?.storage
      .unwrap()
      .items.find((item) => item.name.toString() === "Events");
    if (!eventsEntry) throw new Error(`no System.Events in spec ${spec}`);
    const eventsTypeId = eventsEntry.type.asPlain.toNumber();
    const entry = { registry, eventsTypeId, bytes: (hex.length - 2) / 2, fetchMs };
    metadataCache.set(spec, entry);
    return entry;
  };

  const decodeWith = (
    meta: { registry: TypeRegistry; eventsTypeId: number },
    raw: string,
  ): Decoded => {
    const bytes = hexToU8a(raw);
    try {
      const type = meta.registry.createLookupType(meta.eventsTypeId);
      const records = meta.registry.createType(type, bytes) as unknown as {
        encodedLength: number;
        length: number;
        map<U>(f: (r: { event: { section: string; method: string } }) => U): U[];
      };
      const names = records.map((r) => `${r.event.section}.${r.event.method}`);
      return {
        ok: records.encodedLength === bytes.length,
        events: records.length,
        bytes: bytes.length,
        consumed: records.encodedLength,
        names,
      };
    } catch (error) {
      return {
        ok: false,
        events: 0,
        bytes: bytes.length,
        consumed: 0,
        names: [],
        error: String(error).slice(0, 200),
      };
    }
  };

  // 2. Decode both sides of every boundary. A block's events are produced by the runtime that
  //    EXECUTED it, i.e. the runtime in the parent state. `state_getRuntimeVersion(blockHash)`
  //    reads `:code` from the block's post-state, which is already the new runtime when the block
  //    itself contains `set_code`. We record both rules to prove which one is correct.
  const checks = [];
  for (const boundary of boundaries) {
    for (const block of [boundary.block - 1, boundary.block, boundary.block + 1]) {
      const hash = await hashOf(block);
      const parentHash = await hashOf(block - 1);
      const postStateSpec = await specAt(hash);
      const executingSpec = await specAt(parentHash);
      const raw = await send<string>("state_getStorage", [SYSTEM_EVENTS_KEY, hash]);
      const byExecuting = decodeWith(await registryFor(parentHash, executingSpec), raw);
      const byPostState = decodeWith(await registryFor(hash, postStateSpec), raw);
      checks.push({
        block,
        executingSpec,
        postStateSpec,
        executingRuleOk: byExecuting.ok,
        postStateRuleOk: byPostState.ok,
        events: byExecuting.events,
        bytes: byExecuting.bytes,
        sample: byExecuting.names.slice(0, 6),
        error: byExecuting.error ?? byPostState.error,
      });
      log(
        `#${block} exec=${executingSpec} post=${postStateSpec}: executing-rule ${byExecuting.ok ? "OK" : "FAIL"}, post-state-rule ${byPostState.ok ? "OK" : "FAIL"} (${byExecuting.events} events)`,
      );
    }
  }

  // 3. Negative control: oldest-window block decoded with the newest metadata.
  const oldestHash = await hashOf(POLKADOT_AH_REVIVE_START);
  const oldestSpec = await specAt(oldestHash);
  const headHash = await hashOf(head);
  const newestSpec = await specAt(headHash);
  const newest = await registryFor(headHash, newestSpec);
  const own = await registryFor(oldestHash, oldestSpec);
  const oldestRaw = await send<string>("state_getStorage", [SYSTEM_EVENTS_KEY, oldestHash]);
  const withOwn = decodeWith(own, oldestRaw);
  const withNewest = decodeWith(newest, oldestRaw);
  const negativeControl = {
    block: POLKADOT_AH_REVIVE_START,
    ownSpec: oldestSpec,
    newestSpec,
    withOwnMetadata: { ok: withOwn.ok, events: withOwn.events },
    withNewestMetadata: {
      ok: withNewest.ok,
      events: withNewest.events,
      sameNames: JSON.stringify(withNewest.names) === JSON.stringify(withOwn.names),
      error: withNewest.error,
    },
  };
  log(
    `negative control: own=${withOwn.ok} newest=${withNewest.ok} sameNames=${negativeControl.withNewestMetadata.sameNames}`,
  );

  const metadataStats = [...metadataCache.entries()].map(([spec, m]) => ({
    spec,
    bytes: m.bytes,
    fetchMs: m.fetchMs,
  }));
  const result = {
    spike: "S1",
    measuredAt: nowIso(),
    chain: "polkadot-asset-hub",
    window: { from: POLKADOT_AH_REVIVE_START, to: head },
    samples: SAMPLES,
    binarySearchProbes: probes,
    runtimeUpgrades: boundaries,
    distinctSpecVersions: [...new Set([oldestSpec, ...boundaries.flatMap((b) => [b.from, b.to])])],
    checks,
    executingRuleAllPassed: checks.every((c) => c.executingRuleOk),
    postStateRuleFailures: checks.filter((c) => !c.postStateRuleOk).map((c) => c.block),
    negativeControl,
    metadataStats,
  };
  log(`result written to ${writeResult("s1-runtime-decoding", result)}`);
  await provider.disconnect();
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
