import { blake2AsU8a } from "@polkadot/util-crypto";
import { hexToBytes } from "./runtime.js";

/** Bits per element for a ~1% false-positive rate with k = 7. */
const BITS_PER_ELEMENT = 9.6;
export const BLOOM_HASHES = 7;
const MIN_BYTES = 64;

/**
 * Bloom filter over account ids (hex AccountId32 or H160), sized per chunk for ~1% false
 * positives. Index i = (h1 + i·h2) mod m with h1, h2 from blake2b-256(account) (double hashing).
 * A client downloads a chunk only when the bloom may contain the account it queries.
 */
export class AccountBloom {
  readonly bits: Uint8Array;

  constructor(bits: Uint8Array) {
    if (bits.length === 0) throw new Error("bloom must have at least one byte");
    this.bits = bits;
  }

  static forCount(expectedElements: number): AccountBloom {
    const bytes = Math.max(
      MIN_BYTES,
      Math.ceil((Math.max(1, expectedElements) * BITS_PER_ELEMENT) / 8 / 8) * 8,
    );
    return new AccountBloom(new Uint8Array(bytes));
  }

  static of(accounts: Iterable<string>): AccountBloom {
    const unique = new Set(accounts);
    const bloom = AccountBloom.forCount(unique.size);
    for (const account of unique) bloom.add(account);
    return bloom;
  }

  static fromBase64(encoded: string): AccountBloom {
    return new AccountBloom(Uint8Array.from(atob(encoded), (c) => c.charCodeAt(0)));
  }

  toBase64(): string {
    let binary = "";
    for (const byte of this.bits) binary += String.fromCharCode(byte);
    return btoa(binary);
  }

  add(account: string): void {
    for (const index of this.#indices(account)) {
      this.bits[index >>> 3] = (this.bits[index >>> 3] as number) | (1 << (index & 7));
    }
  }

  has(account: string): boolean {
    for (const index of this.#indices(account)) {
      if (((this.bits[index >>> 3] as number) & (1 << (index & 7))) === 0) return false;
    }
    return true;
  }

  *#indices(account: string): Generator<number> {
    const digest = blake2AsU8a(hexToBytes(account.toLowerCase()), 256);
    const view = new DataView(digest.buffer, digest.byteOffset, digest.byteLength);
    const h1 = view.getUint32(0, true);
    const h2 = view.getUint32(4, true) | 1;
    const m = this.bits.length * 8;
    for (let i = 0; i < BLOOM_HASHES; i++) yield ((h1 + Math.imul(i, h2)) >>> 0) % m;
  }
}
