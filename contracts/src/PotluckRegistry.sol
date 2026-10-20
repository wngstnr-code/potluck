// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title PotluckRegistry
/// @notice Permissionless catalog of Potluck index specs and the manifests that publish them.
/// @dev Specs, manifests and chunks live in Portaldot's TransactionStorage. This contract only
///      records their content digests (blake2b-256, the TransactionStorage content hash) and the
///      location where they were last stored, so that anyone can find, verify and renew them.
///      The contract never judges correctness: clients verify manifests against the source chain,
///      and flags are public claims that clients weigh themselves.
contract PotluckRegistry {
    /// @notice `chunkIndex` value that refers to the manifest blob itself rather than a chunk.
    uint32 public constant MANIFEST_BLOB = type(uint32).max;

    enum FlagReason {
        None,
        Integrity, // blob or raw hash does not match the manifest
        RowMismatch, // a row differs from the source chain's events
        Reconciliation, // balance/state reconciliation against the source chain failed
        Unavailable // blob cannot be retrieved from TransactionStorage
    }

    struct Spec {
        address author;
        uint64 registeredAt;
        uint32 tsBlock; // TransactionStorage location of the canonical spec JSON
        uint32 tsIndex;
    }

    /// @notice Publisher-supplied manifest fields.
    struct ManifestInput {
        bytes32 specHash; // blake2b-256 of the canonical spec JSON (= its TransactionStorage digest)
        bytes32 sourceGenesis; // genesis hash of the indexed source chain
        uint64 fromBlock;
        uint64 toBlock;
        bytes32 toBlockHash; // finalized hash of `toBlock` on the source chain
        bytes32 chunksRoot; // keccak256 Merkle root over the chunks' raw hashes
        bytes32 manifestDigest; // blake2b-256 of the manifest JSON blob
        uint32 tsBlock; // TransactionStorage location of the manifest JSON blob
        uint32 tsIndex;
        uint32 chunkCount;
    }

    struct Manifest {
        bytes32 specHash;
        bytes32 sourceGenesis;
        uint64 fromBlock;
        uint64 toBlock;
        bytes32 toBlockHash;
        bytes32 chunksRoot;
        bytes32 manifestDigest;
        uint32 tsBlock;
        uint32 tsIndex;
        uint32 chunkCount;
        address publisher;
        uint64 publishedAt;
        uint32 flags;
    }

    mapping(bytes32 specHash => Spec) private _specs;
    bytes32[] private _specHashes;

    Manifest[] private _manifests;
    mapping(bytes32 specHash => uint256[]) private _manifestIdsBySpec;
    /// @dev keccak256(spec, source, range, chunksRoot, publisher) => manifest id + 1 (0 = unused).
    mapping(bytes32 key => uint256) private _manifestKeys;
    mapping(uint256 id => mapping(address flagger => bool)) private _flaggedBy;

    event SpecRegistered(
        bytes32 indexed specHash, address indexed author, uint32 tsBlock, uint32 tsIndex
    );
    event ManifestPublished(
        uint256 indexed id,
        bytes32 indexed specHash,
        address indexed publisher,
        bytes32 sourceGenesis,
        uint64 fromBlock,
        uint64 toBlock,
        bytes32 chunksRoot,
        bytes32 manifestDigest
    );
    event ManifestFlagged(
        uint256 indexed id,
        address indexed flagger,
        uint32 chunkIndex,
        FlagReason reason,
        bytes32 evidence
    );
    event Renewed(
        uint256 indexed id,
        uint32 indexed chunkIndex,
        uint32 tsBlock,
        uint32 tsIndex,
        address indexed renewer
    );

    error ZeroValue();
    error SpecAlreadyRegistered(bytes32 specHash);
    error SpecNotRegistered(bytes32 specHash);
    error InvalidRange(uint64 fromBlock, uint64 toBlock);
    error DuplicateManifest(uint256 existingId);
    error UnknownManifest(uint256 id);
    error InvalidChunkIndex(uint32 chunkIndex);
    error InvalidReason();
    error CannotFlagOwnManifest();
    error AlreadyFlagged();

    // ------------------------------------------------------------------ specs

    /// @notice Registers a spec whose canonical JSON is stored in TransactionStorage.
    function registerSpec(bytes32 specHash, uint32 tsBlock, uint32 tsIndex) external {
        if (specHash == bytes32(0)) revert ZeroValue();
        if (_specs[specHash].author != address(0)) revert SpecAlreadyRegistered(specHash);
        _specs[specHash] = Spec({
            author: msg.sender,
            // Seconds since epoch fit in uint64 for ~5.8e11 years.
            // forge-lint: disable-next-line(unsafe-typecast)
            registeredAt: uint64(block.timestamp),
            tsBlock: tsBlock,
            tsIndex: tsIndex
        });
        _specHashes.push(specHash);
        emit SpecRegistered(specHash, msg.sender, tsBlock, tsIndex);
    }

    function getSpec(bytes32 specHash) external view returns (Spec memory) {
        return _specs[specHash];
    }

    function specCount() external view returns (uint256) {
        return _specHashes.length;
    }

    function specHashAt(uint256 index) external view returns (bytes32) {
        return _specHashes[index];
    }

    // ------------------------------------------------------------- manifests

    /// @notice Publishes a manifest. Several publishers may publish the same range (quorum) and a
    ///         spec may have many manifests over different ranges (progressive backfill).
    function publish(ManifestInput calldata m) external returns (uint256 id) {
        if (_specs[m.specHash].author == address(0)) revert SpecNotRegistered(m.specHash);
        if (m.fromBlock > m.toBlock) revert InvalidRange(m.fromBlock, m.toBlock);
        if (
            m.sourceGenesis == bytes32(0) || m.toBlockHash == bytes32(0)
                || m.chunksRoot == bytes32(0) || m.manifestDigest == bytes32(0) || m.chunkCount == 0
        ) revert ZeroValue();

        bytes32 key = keccak256(
            abi.encode(
                m.specHash, m.sourceGenesis, m.fromBlock, m.toBlock, m.chunksRoot, msg.sender
            )
        );
        uint256 existing = _manifestKeys[key];
        if (existing != 0) revert DuplicateManifest(existing - 1);

        id = _manifests.length;
        _manifests.push(
            Manifest({
                specHash: m.specHash,
                sourceGenesis: m.sourceGenesis,
                fromBlock: m.fromBlock,
                toBlock: m.toBlock,
                toBlockHash: m.toBlockHash,
                chunksRoot: m.chunksRoot,
                manifestDigest: m.manifestDigest,
                tsBlock: m.tsBlock,
                tsIndex: m.tsIndex,
                chunkCount: m.chunkCount,
                publisher: msg.sender,
                // forge-lint: disable-next-line(unsafe-typecast)
                publishedAt: uint64(block.timestamp),
                flags: 0
            })
        );
        _manifestKeys[key] = id + 1;
        _manifestIdsBySpec[m.specHash].push(id);

        emit ManifestPublished(
            id,
            m.specHash,
            msg.sender,
            m.sourceGenesis,
            m.fromBlock,
            m.toBlock,
            m.chunksRoot,
            m.manifestDigest
        );
    }

    function getManifest(uint256 id) external view returns (Manifest memory) {
        if (id >= _manifests.length) revert UnknownManifest(id);
        return _manifests[id];
    }

    function manifestCount() external view returns (uint256) {
        return _manifests.length;
    }

    function manifestCountBySpec(bytes32 specHash) external view returns (uint256) {
        return _manifestIdsBySpec[specHash].length;
    }

    /// @notice Manifest ids of a spec in publication order, paged.
    function manifestIdsBySpec(bytes32 specHash, uint256 offset, uint256 limit)
        external
        view
        returns (uint256[] memory ids)
    {
        uint256[] storage all = _manifestIdsBySpec[specHash];
        if (offset >= all.length) return new uint256[](0);
        uint256 end = offset + limit > all.length ? all.length : offset + limit;
        ids = new uint256[](end - offset);
        for (uint256 i = offset; i < end; i++) {
            ids[i - offset] = all[i];
        }
    }

    /// @notice The `n` most recently published manifests of a spec, newest first.
    function latest(bytes32 specHash, uint256 n) external view returns (Manifest[] memory out) {
        uint256[] storage all = _manifestIdsBySpec[specHash];
        uint256 count = n > all.length ? all.length : n;
        out = new Manifest[](count);
        for (uint256 i = 0; i < count; i++) {
            out[i] = _manifests[all[all.length - 1 - i]];
        }
    }

    // ----------------------------------------------------------- flags/renew

    /// @notice Publicly flags a manifest (or one of its chunks) as faulty. One flag per address.
    /// @param evidence Digest of off-chain evidence (e.g. the mismatching row or block hash).
    function flag(uint256 id, uint32 chunkIndex, FlagReason reason, bytes32 evidence) external {
        Manifest storage m = _existing(id);
        _checkChunkIndex(m, chunkIndex);
        if (reason == FlagReason.None) revert InvalidReason();
        if (m.publisher == msg.sender) revert CannotFlagOwnManifest();
        if (_flaggedBy[id][msg.sender]) revert AlreadyFlagged();
        _flaggedBy[id][msg.sender] = true;
        m.flags += 1;
        emit ManifestFlagged(id, msg.sender, chunkIndex, reason, evidence);
    }

    function hasFlagged(uint256 id, address flagger) external view returns (bool) {
        return _flaggedBy[id][flagger];
    }

    /// @notice Announces where a blob was re-stored after `transactionStorage.renew`, so renewers
    ///         can find the latest location. Anyone may renew; clients verify blobs by digest, so a
    ///         false announcement cannot corrupt data, only point to an unusable location.
    function noteRenewal(uint256 id, uint32 chunkIndex, uint32 tsBlock, uint32 tsIndex) external {
        Manifest storage m = _existing(id);
        _checkChunkIndex(m, chunkIndex);
        if (chunkIndex == MANIFEST_BLOB) {
            m.tsBlock = tsBlock;
            m.tsIndex = tsIndex;
        }
        emit Renewed(id, chunkIndex, tsBlock, tsIndex, msg.sender);
    }

    // -------------------------------------------------------------- internal

    function _existing(uint256 id) private view returns (Manifest storage) {
        if (id >= _manifests.length) revert UnknownManifest(id);
        return _manifests[id];
    }

    function _checkChunkIndex(Manifest storage m, uint32 chunkIndex) private view {
        if (chunkIndex != MANIFEST_BLOB && chunkIndex >= m.chunkCount) {
            revert InvalidChunkIndex(chunkIndex);
        }
    }
}
