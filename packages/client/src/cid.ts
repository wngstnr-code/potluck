const BASE32 = "abcdefghijklmnopqrstuvwxyz234567";

function base32(bytes: Uint8Array): string {
  let out = "";
  let bits = 0;
  let value = 0;
  for (const byte of bytes) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += BASE32[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += BASE32[(value << (5 - bits)) & 31];
  return out;
}

/**
 * CIDv1 (raw codec 0x55, multihash blake2b-256 = 0xb220) of a TransactionStorage blob digest,
 * multibase base32 ("b…"). This is what `bitswap_v1_get` resolves on a Portaldot node.
 */
export function blobCid(digest: string): string {
  const hex = digest.startsWith("0x") ? digest.slice(2) : digest;
  if (!/^[0-9a-fA-F]{64}$/.test(hex)) throw new Error("blobCid: digest must be 32 bytes");
  const bytes = new Uint8Array(6 + 32);
  bytes.set([0x01, 0x55, 0xa0, 0xe4, 0x02, 0x20]); // version, raw, varint(0xb220), length 32
  for (let i = 0; i < 32; i++) bytes[6 + i] = Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return `b${base32(bytes)}`;
}
