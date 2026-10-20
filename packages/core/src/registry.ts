import { parseAbi } from "viem";

/** ABI of PotluckRegistry (source of truth: contracts/src/PotluckRegistry.sol). */
export const REGISTRY_ABI = parseAbi([
  "struct Spec { address author; uint64 registeredAt; uint32 tsBlock; uint32 tsIndex; }",
  "struct ManifestInput { bytes32 specHash; bytes32 sourceGenesis; uint64 fromBlock; uint64 toBlock; bytes32 toBlockHash; bytes32 chunksRoot; bytes32 manifestDigest; uint32 tsBlock; uint32 tsIndex; uint32 chunkCount; }",
  "struct Manifest { bytes32 specHash; bytes32 sourceGenesis; uint64 fromBlock; uint64 toBlock; bytes32 toBlockHash; bytes32 chunksRoot; bytes32 manifestDigest; uint32 tsBlock; uint32 tsIndex; uint32 chunkCount; address publisher; uint64 publishedAt; uint32 flags; }",
  "function MANIFEST_BLOB() view returns (uint32)",
  "function registerSpec(bytes32 specHash, uint32 tsBlock, uint32 tsIndex)",
  "function getSpec(bytes32 specHash) view returns (Spec)",
  "function specCount() view returns (uint256)",
  "function specHashAt(uint256 index) view returns (bytes32)",
  "function publish(ManifestInput m) returns (uint256 id)",
  "function getManifest(uint256 id) view returns (Manifest)",
  "function manifestCount() view returns (uint256)",
  "function manifestCountBySpec(bytes32 specHash) view returns (uint256)",
  "function manifestIdsBySpec(bytes32 specHash, uint256 offset, uint256 limit) view returns (uint256[])",
  "function latest(bytes32 specHash, uint256 n) view returns (Manifest[])",
  "function flag(uint256 id, uint32 chunkIndex, uint8 reason, bytes32 evidence)",
  "function hasFlagged(uint256 id, address flagger) view returns (bool)",
  "function noteRenewal(uint256 id, uint32 chunkIndex, uint32 tsBlock, uint32 tsIndex)",
  "event SpecRegistered(bytes32 indexed specHash, address indexed author, uint32 tsBlock, uint32 tsIndex)",
  "event ManifestPublished(uint256 indexed id, bytes32 indexed specHash, address indexed publisher, bytes32 sourceGenesis, uint64 fromBlock, uint64 toBlock, bytes32 chunksRoot, bytes32 manifestDigest)",
  "event ManifestFlagged(uint256 indexed id, address indexed flagger, uint32 chunkIndex, uint8 reason, bytes32 evidence)",
  "event Renewed(uint256 indexed id, uint32 indexed chunkIndex, uint32 tsBlock, uint32 tsIndex, address indexed renewer)",
]);

/** FlagReason enum values of the registry. */
export const FLAG_REASON = {
  Integrity: 1,
  RowMismatch: 2,
  Reconciliation: 3,
  Unavailable: 4,
} as const;
