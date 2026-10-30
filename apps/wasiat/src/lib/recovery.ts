import { u8aToHex } from "@polkadot/util";
import { blake2AsHex, xxhashAsHex } from "@polkadot/util-crypto";
import {
  type DecodedEvent,
  type DecodingRuntime,
  decodeCompactU32,
  decodeEvents,
  getBlockHashes,
  getFinalizedHead,
  getRuntimeVersion,
  hexToBytes,
  type IndexedRow,
  LAST_RUNTIME_UPGRADE_KEY,
  type MetadataStore,
  mapPool,
  normalizeField,
  type RpcClient,
  RuntimeLoader,
  SYSTEM_EVENTS_KEY,
} from "@potluck/core";

/** First block with the inheritance-capable Recovery pallet on Kusama Asset Hub (spike S7). */
export const RECOVERY_FROM_BLOCK = 17_836_634;

export interface FriendGroup {
  friends: string[];
  friendsNeeded: number;
  inheritor: string;
  inheritanceDelay: number;
  inheritancePriority: number;
  cancelDelay: number;
}

export interface Plan {
  account: string;
  groups: FriendGroup[];
  deposit: bigint;
}

export interface OpenAttempt {
  lost: string;
  groupIndex: number;
  initiator: string;
  initBlock: number;
  lastApprovalBlock: number;
  approvals: number;
  depositor: string;
  deposit: bigint;
}

export interface InheritorRecord {
  lost: string;
  groupIndex: number;
  inheritor: string;
}

export interface TimelineEvent {
  block: number;
  eventIndex: number;
  /** Unix ms from Timestamp.Now at that block. */
  time: number;
  kind: string;
  fields: Record<string, string | null>;
  /**
   * "event": decoded from the block's System.Events. "carried-over": state that already existed
   * when the inheritance API was introduced (migrated from the previous Recovery pallet).
   * "potluck": a row of the Potluck snapshot on Portaldot that the storage search missed: an
   * event that changed no Recovery storage, or state that was undone again between the samples
   * the search compares (an inheritor set and revoked within a few blocks).
   */
  source: "event" | "carried-over" | "potluck";
  /** A block event that the Potluck snapshot also holds (an independent second source). */
  inSnapshot?: boolean;
}

type AnyCodec = {
  toHex(): string;
  toNumber(): number;
  toBigInt(): bigint;
  get(name: string): AnyCodec;
  isSome?: boolean;
  unwrap?(): AnyCodec;
  [index: number]: AnyCodec;
  length: number;
};

const storagePrefix = (pallet: string, item: string) =>
  `${xxhashAsHex(pallet, 128)}${xxhashAsHex(item, 128).slice(2)}`;
const blake2Concat = (hex: string) =>
  `${blake2AsHex(hexToBytes(hex), 128).slice(2)}${hex.replace(/^0x/, "")}`;
const u32le = (n: number) => u8aToHex(new Uint8Array(new Uint32Array([n]).buffer));
const TIMESTAMP_NOW = storagePrefix("Timestamp", "Now");
/** Relay-chain block number this parachain block was built on (post-state, u32). */
const LAST_RELAY_BLOCK = storagePrefix("ParachainSystem", "LastRelayChainBlockNumber");

const PREFIX = {
  friendGroups: storagePrefix("Recovery", "FriendGroups"),
  attempt: storagePrefix("Recovery", "Attempt"),
  inheritor: storagePrefix("Recovery", "Inheritor"),
};

export const keys = {
  friendGroups: (account: string) => `${PREFIX.friendGroups}${blake2Concat(account)}`,
  inheritor: (account: string) => `${PREFIX.inheritor}${blake2Concat(account)}`,
  attempt: (account: string, index: number) =>
    `${PREFIX.attempt}${blake2Concat(account)}${blake2Concat(u32le(index))}`,
};

/** Account id from the last 32 bytes of a Blake2_128Concat(AccountId32) map key segment. */
const accountAt = (key: string, offsetBytes: number) =>
  `0x${key.slice(2 + (offsetBytes + 16) * 2, 2 + (offsetBytes + 16 + 32) * 2)}`;

const PROBES = 16;

/**
 * Read-only access to the Recovery pallet of a chain at its finalized head, plus timeline
 * reconstruction for one account from the blocks its storage changed in.
 */
export class RecoveryChain {
  readonly #hashes = new Map<number, string>();

  private constructor(
    readonly client: RpcClient,
    readonly runtime: DecodingRuntime,
    readonly head: { number: number; hash: string },
    private readonly loader: RuntimeLoader,
  ) {}

  static async open(client: RpcClient, metadataStore?: MetadataStore): Promise<RecoveryChain> {
    const head = await getFinalizedHead(client);
    const loader = new RuntimeLoader(client, metadataStore);
    const { specVersion } = await getRuntimeVersion(client, head.hash);
    const runtime = await loader.load(specVersion, head.hash);
    return new RecoveryChain(client, runtime, head, loader);
  }

  /** SecurityDeposit and MaxFriendsPerConfig constants of the current runtime. */
  constants(): { securityDeposit: bigint; maxFriends: number } {
    const pallet = this.runtime.metadata.asLatest.pallets.find(
      (p) => p.name.toString() === "Recovery",
    );
    const read = (name: string) => pallet?.constants.find((c) => c.name.toString() === name)?.value;
    const deposit = read("SecurityDeposit");
    const max = read("MaxFriendsPerConfig");
    return {
      securityDeposit: deposit
        ? this.runtime.registry.createType("u128", deposit.toU8a(true)).toBigInt()
        : 0n,
      maxFriends: max ? this.runtime.registry.createType("u32", max.toU8a(true)).toNumber() : 0,
    };
  }

  #decode(item: string, hex: string): AnyCodec {
    const type = this.runtime.registry.createLookupType(
      this.runtime.storageTypeId("Recovery", item),
    );
    return this.runtime.registry.createType(type, hexToBytes(hex)) as unknown as AnyCodec;
  }

  async #keys(prefix: string): Promise<string[]> {
    const out: string[] = [];
    let start: string | null = null;
    for (;;) {
      const page: string[] = await this.client.send<string[]>("state_getKeysPaged", [
        prefix,
        1000,
        start,
        this.head.hash,
      ]);
      out.push(...page);
      if (page.length < 1000) return out;
      start = page.at(-1) as string;
    }
  }

  async #values(storageKeys: readonly string[], at = this.head.hash): Promise<(string | null)[]> {
    return mapPool([...storageKeys], 16, (k) =>
      this.client.send<string | null>("state_getStorage", [k, at]),
    );
  }

  async plans(): Promise<Plan[]> {
    const ks = await this.#keys(PREFIX.friendGroups);
    const values = await this.#values(ks);
    return ks.flatMap((key, i) => {
      const raw = values[i];
      if (!raw) return [];
      const v = this.#decode("FriendGroups", raw);
      const groups = v[0] as AnyCodec;
      return [
        {
          account: accountAt(key, 32),
          groups: Array.from({ length: groups.length }, (_, g) => toGroup(groups[g] as AnyCodec)),
          deposit: (v[1] as AnyCodec).toBigInt(),
        },
      ];
    });
  }

  async attempts(): Promise<OpenAttempt[]> {
    const ks = await this.#keys(PREFIX.attempt);
    const values = await this.#values(ks);
    return ks.flatMap((key, i) => {
      const raw = values[i];
      if (!raw) return [];
      const v = this.#decode("Attempt", raw);
      const attempt = v[0] as AnyCodec;
      const consideration = v[1] as AnyCodec;
      const bits = attempt.get("approvals");
      let approvals = 0;
      for (let w = 0; w < bits.length; w++) {
        let word = (bits[w] as AnyCodec).toNumber();
        while (word) {
          approvals += word & 1;
          word >>>= 1;
        }
      }
      return [
        {
          lost: accountAt(key, 32),
          groupIndex: attempt.get("friendGroupIndex").toNumber(),
          initiator: attempt.get("initiator").toHex(),
          initBlock: attempt.get("initBlock").toNumber(),
          lastApprovalBlock: attempt.get("lastApprovalBlock").toNumber(),
          approvals,
          depositor: consideration.get("depositor").toHex(),
          deposit: (v[2] as AnyCodec).toBigInt(),
        },
      ];
    });
  }

  async inheritors(): Promise<InheritorRecord[]> {
    const ks = await this.#keys(PREFIX.inheritor);
    const values = await this.#values(ks);
    return ks.flatMap((key, i) => {
      const raw = values[i];
      if (!raw) return [];
      const v = this.#decode("Inheritor", raw);
      return [
        {
          lost: accountAt(key, 32),
          groupIndex: (v[0] as AnyCodec).toNumber(),
          inheritor: (v[1] as AnyCodec).toHex(),
        },
      ];
    });
  }

  // --- timeline -----------------------------------------------------------------------------

  async #hash(block: number): Promise<string> {
    const known = this.#hashes.get(block);
    if (known) return known;
    const [hash] = await getBlockHashes(this.client, [block]);
    this.#hashes.set(block, hash as string);
    return hash as string;
  }

  async #valueAt(key: string, block: number): Promise<string | null> {
    return this.client.send<string | null>("state_getStorage", [key, await this.#hash(block)]);
  }

  async #relayAt(block: number): Promise<number> {
    const raw = await this.#valueAt(LAST_RELAY_BLOCK, block);
    if (!raw) throw new Error(`no relay block number at #${block}`);
    return this.runtime.registry.createType("u32", hexToBytes(raw)).toNumber();
  }

  /**
   * Asset Hub blocks built on relay block `relay`. Recovery measures time in relay-chain blocks
   * (init_block, last_approval_block, delays), so events are located through
   * ParachainSystem.LastRelayChainBlockNumber, which never decreases.
   */
  async #localBlocksForRelay(relay: number): Promise<number[]> {
    let x = RECOVERY_FROM_BLOCK;
    let y = this.head.number;
    if ((await this.#relayAt(y)) < relay) return [];
    while (y - x > 1) {
      const n = Math.min(PROBES, y - x - 1);
      const probes = [
        ...new Set(
          Array.from({ length: n }, (_, j) => Math.floor(x + ((j + 1) * (y - x)) / (n + 1))),
        ),
      ];
      const vs = await Promise.all(probes.map((p) => this.#relayAt(p)));
      const first = vs.findIndex((v) => v >= relay);
      if (first === -1) x = probes.at(-1) as number;
      else {
        y = probes[first] as number;
        if (first > 0) x = probes[first - 1] as number;
      }
    }
    const out: number[] = [];
    for (let b = y; b <= this.head.number && out.length < 4; b++) {
      if ((await this.#relayAt(b)) !== relay) break;
      out.push(b);
    }
    return out;
  }

  /** Blocks in (lo, hi] where `key` changed, found by a 16-way parallel search between samples. */
  async #changes(key: string, lo: number, hi: number, samples = 32): Promise<number[]> {
    const step = Math.max(1, Math.floor((hi - lo) / samples));
    const points = [lo];
    for (let b = lo + step; b < hi; b += step) points.push(b);
    points.push(hi);
    const values = await Promise.all(points.map((b) => this.#valueAt(key, b)));
    const out: number[] = [];
    for (let i = 1; i < points.length; i++) {
      let a = points[i - 1] as number;
      let va = values[i - 1] ?? null;
      const b = points[i] as number;
      const vb = values[i] ?? null;
      while (va !== vb) {
        let x = a;
        let y = b;
        while (y - x > 1) {
          const n = Math.min(PROBES, y - x - 1);
          const probes = [
            ...new Set(
              Array.from({ length: n }, (_, j) => Math.floor(x + ((j + 1) * (y - x)) / (n + 1))),
            ),
          ];
          const vs = await Promise.all(probes.map((p) => this.#valueAt(key, p)));
          const first = vs.findIndex((v) => v !== va);
          if (first === -1) x = probes.at(-1) as number;
          else {
            y = probes[first] as number;
            if (first > 0) x = probes[first - 1] as number;
          }
        }
        out.push(y);
        a = y;
        va = await this.#valueAt(key, y);
      }
    }
    return out;
  }

  /** Unix ms from Timestamp.Now at `block`, 0 when it is not set. */
  async timeAt(block: number): Promise<number> {
    const now = await this.client.send<string | null>("state_getStorage", [
      TIMESTAMP_NOW,
      await this.#hash(block),
    ]);
    return now ? Number(this.runtime.registry.createType("u64", hexToBytes(now)).toBigInt()) : 0;
  }

  async #eventsAt(block: number): Promise<{ events: DecodedEvent[]; time: number }> {
    const hash = await this.#hash(block);
    const [raw, version, now] = await Promise.all([
      this.client.send<string | null>("state_getStorage", [SYSTEM_EVENTS_KEY, hash]),
      this.client.send<string | null>("state_getStorage", [LAST_RUNTIME_UPGRADE_KEY, hash]),
      this.client.send<string | null>("state_getStorage", [TIMESTAMP_NOW, hash]),
    ]);
    // LastRuntimeUpgrade at block b is the version that executed b; metadata comes from its parent.
    const runtime = await this.loader.load(
      version ? decodeCompactU32(version) : this.runtime.specVersion,
      await this.#hash(block - 1),
    );
    const time = now
      ? Number(this.runtime.registry.createType("u64", hexToBytes(now)).toBigInt())
      : 0;
    return { events: raw ? decodeEvents(runtime, block, hexToBytes(raw)) : [], time };
  }

  /**
   * Timeline of `account` rebuilt from the blocks its Recovery storage changed in: friend-group
   * changes, inheritor changes, and for each inherited or open attempt its initiation and
   * approvals (located through the attempt's init/last-approval blocks). Every entry is decoded
   * from the block's own events. Attempts that were canceled without ever finishing, and state
   * undone between samples, leave no trace here; `mergeTimelines` adds them from the Potluck
   * snapshot.
   */
  async accountTimeline(
    account: string,
    open: readonly OpenAttempt[],
    onProgress?: (stage: string) => void,
  ): Promise<TimelineEvent[]> {
    const lo = RECOVERY_FROM_BLOCK;
    const hi = this.head.number;
    onProgress?.("searching friend-group and inheritor changes");
    const [groupChanges, inheritorChanges] = await Promise.all([
      this.#changes(keys.friendGroups(account), lo, hi),
      this.#changes(keys.inheritor(account), lo, hi),
    ]);
    const blocks = new Set([...groupChanges, ...inheritorChanges]);
    const carried: TimelineEvent[] = [];
    const [groupsAtStart, inheritorAtStart] = await Promise.all([
      this.#valueAt(keys.friendGroups(account), lo),
      this.#valueAt(keys.inheritor(account), lo),
    ]);
    const startTime = (await this.#eventsAt(lo)).time;
    if (groupsAtStart) {
      carried.push({
        block: lo,
        eventIndex: -2,
        time: startTime,
        kind: "FriendGroupsCarriedOver",
        fields: { lost: account },
        source: "carried-over",
      });
    }
    if (inheritorAtStart) {
      const v = this.#decode("Inheritor", inheritorAtStart);
      carried.push({
        block: lo,
        eventIndex: -1,
        time: startTime,
        kind: "InheritorCarriedOver",
        fields: {
          lost: account,
          inheritor: (v[1] as AnyCodec).toHex(),
          friend_group_index: String((v[0] as AnyCodec).toNumber()),
        },
        source: "carried-over",
      });
    }

    // Attempts: those still open, and those that finished (the attempt is gone after the
    // inheritor is set, but it is still in state one block earlier).
    // Spans are in relay-chain blocks.
    const attemptSpans: { index: number; init: number; last: number }[] = open.map((a) => ({
      index: a.groupIndex,
      init: a.initBlock,
      last: a.lastApprovalBlock,
    }));
    for (const b of inheritorChanges) {
      const record = await this.#valueAt(keys.inheritor(account), b);
      if (!record) continue;
      const index = (this.#decode("Inheritor", record)[0] as AnyCodec).toNumber();
      const before = await this.#valueAt(keys.attempt(account, index), b - 1);
      if (!before) continue;
      const attempt = this.#decode("Attempt", before)[0] as AnyCodec;
      attemptSpans.push({
        index,
        init: attempt.get("initBlock").toNumber(),
        last: attempt.get("lastApprovalBlock").toNumber(),
      });
    }
    // Attempts that already existed at the upgrade were migrated from the previous pallet.
    for (const span of attemptSpans) {
      const atStart = await this.#valueAt(keys.attempt(account, span.index), lo);
      if (!atStart) continue;
      const attempt = this.#decode("Attempt", atStart)[0] as AnyCodec;
      carried.push({
        block: lo,
        eventIndex: span.index,
        time: startTime,
        kind: "AttemptCarriedOver",
        fields: {
          lost: account,
          friend_group_index: String(span.index),
          initiator: attempt.get("initiator").toHex(),
        },
        source: "carried-over",
      });
    }
    onProgress?.("locating attempt approvals");
    for (const span of attemptSpans) {
      const [initBlocks, lastBlocks] = await Promise.all([
        this.#localBlocksForRelay(span.init),
        this.#localBlocksForRelay(span.last),
      ]);
      for (const b of [...initBlocks, ...lastBlocks]) blocks.add(b);
      const from = initBlocks[0];
      const to = lastBlocks.at(-1);
      if (from !== undefined && to !== undefined && to > from + 1) {
        // Approvals between initiation and the last approval change the attempt's bitfield.
        for (const b of await this.#changes(keys.attempt(account, span.index), from, to, 4))
          blocks.add(b);
      }
    }

    onProgress?.(`reading events of ${blocks.size} blocks`);
    const entries = await mapPool(
      [...blocks].filter((b) => b > 0),
      8,
      async (block) => {
        const { events, time } = await this.#eventsAt(block);
        return events
          .filter((e) => e.pallet === "Recovery")
          .map((e) => ({
            block,
            eventIndex: e.eventIndex,
            time,
            kind: e.event,
            fields: Object.fromEntries(e.fields.map((f) => [f.name, normalizeField(f)])),
            source: "event" as const,
          }))
          .filter((e) => e.fields.lost === account || e.fields.recovered === account);
      },
    );
    return [...carried, ...entries.flat()].sort(
      (a, b) => a.block - b.block || a.eventIndex - b.eventIndex,
    );
  }
}

/**
 * A row of the `kusama-ah.recovery-timeline` spec as a timeline entry, with the event's own field
 * names (the spec stores the actor of each event in one `actor` column).
 */
export function rowToEvent(row: IndexedRow, time: number): TimelineEvent {
  const c = row.cells;
  const fields: Record<string, string | null> = {
    lost: c.lost ?? null,
    friend_group_index: c.friendGroupIndex ?? null,
  };
  switch (c.kind) {
    case "AttemptInitiated":
      fields.initiator = c.actor ?? null;
      break;
    case "AttemptApproved":
      fields.friend = c.actor ?? null;
      break;
    case "AttemptCanceled":
      fields.canceler = c.actor ?? null;
      break;
    case "AttemptFinished":
      fields.inheritor = c.inheritor ?? null;
      fields.previous_inheritor = c.previousInheritor ?? null;
      break;
    case "AttemptDiscarded":
      fields.existing_inheritor = c.inheritor ?? null;
      break;
    case "RecoveredAccountControlled":
      fields.recovered = c.lost ?? null;
      fields.inheritor = c.inheritor ?? null;
      fields.call_hash = c.callHash ?? null;
      break;
  }
  return {
    block: row.block,
    eventIndex: row.eventIndex,
    time,
    kind: String(c.kind),
    fields,
    source: "potluck",
  };
}

/**
 * One account's timeline from both sources: entries found through storage changes, plus the
 * snapshot's rows for the account that the storage search missed. An event both hold is kept
 * once, marked as confirmed by the snapshot.
 */
export function mergeTimelines(
  fromStorage: readonly TimelineEvent[],
  fromSnapshot: readonly TimelineEvent[],
): TimelineEvent[] {
  const key = (e: TimelineEvent) => `${e.block}:${e.eventIndex}`;
  const inSnapshot = new Set(fromSnapshot.map(key));
  const merged = fromStorage.map((e) =>
    e.source === "event" && inSnapshot.has(key(e)) ? { ...e, inSnapshot: true } : e,
  );
  const seen = new Set(fromStorage.map(key));
  for (const e of fromSnapshot) if (!seen.has(key(e))) merged.push(e);
  return merged.sort((a, b) => a.block - b.block || a.eventIndex - b.eventIndex);
}

function toGroup(g: AnyCodec): FriendGroup {
  const friends = g.get("friends");
  return {
    friends: Array.from({ length: friends.length }, (_, i) => (friends[i] as AnyCodec).toHex()),
    friendsNeeded: g.get("friendsNeeded").toNumber(),
    inheritor: g.get("inheritor").toHex(),
    inheritanceDelay: g.get("inheritanceDelay").toNumber(),
    inheritancePriority: g.get("inheritancePriority").toNumber(),
    cancelDelay: g.get("cancelDelay").toNumber(),
  };
}

export interface ReplayResult {
  /** Inheritor implied by the events (last AttemptFinished not followed by InheritorRevoked). */
  inheritor: string | null;
  /** Group indexes with an attempt initiated and not yet finished, canceled, discarded or slashed. */
  openAttempts: number[];
  configured: boolean;
}

/** Replays a timeline into the state it implies, to compare with the chain's current storage. */
export function replay(timeline: readonly TimelineEvent[]): ReplayResult {
  let inheritor: string | null = null;
  const open = new Set<number>();
  let configured = false;
  for (const e of timeline) {
    const index = Number(e.fields.friend_group_index ?? -1);
    switch (e.kind) {
      case "FriendGroupsChanged":
      case "FriendGroupsCarriedOver":
        configured = true;
        break;
      case "InheritorCarriedOver":
        inheritor = e.fields.inheritor ?? null;
        break;
      case "AttemptInitiated":
      case "AttemptCarriedOver":
        open.add(index);
        break;
      case "AttemptFinished":
        open.delete(index);
        inheritor = e.fields.inheritor ?? null;
        break;
      case "AttemptCanceled":
      case "AttemptDiscarded":
      case "AttemptSlashed":
        open.delete(index);
        break;
      case "InheritorRevoked":
        inheritor = null;
        break;
    }
  }
  return { inheritor, openAttempts: [...open].sort((a, b) => a - b), configured };
}
