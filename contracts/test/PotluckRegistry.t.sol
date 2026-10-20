// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {PotluckRegistry} from "../src/PotluckRegistry.sol";

contract PotluckRegistryTest is Test {
    PotluckRegistry internal registry;

    address internal alice = makeAddr("alice");
    address internal bob = makeAddr("bob");
    address internal carol = makeAddr("carol");

    bytes32 internal constant SPEC = keccak256("polkadot-ah.balance-history");
    bytes32 internal constant OTHER_SPEC = keccak256("kusama-ah.recovery-timeline");
    bytes32 internal constant GENESIS = keccak256("polkadot-asset-hub-genesis");
    uint32 internal constant MANIFEST_BLOB = type(uint32).max;

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
        PotluckRegistry.FlagReason reason,
        bytes32 evidence
    );
    event Renewed(
        uint256 indexed id,
        uint32 indexed chunkIndex,
        uint32 tsBlock,
        uint32 tsIndex,
        address indexed renewer
    );

    function setUp() public {
        registry = new PotluckRegistry();
        vm.warp(1_790_000_000);
    }

    // ---------------------------------------------------------------- helpers

    function _input(uint64 fromBlock, uint64 toBlock, bytes32 root)
        internal
        pure
        returns (PotluckRegistry.ManifestInput memory)
    {
        return PotluckRegistry.ManifestInput({
            specHash: SPEC,
            sourceGenesis: GENESIS,
            fromBlock: fromBlock,
            toBlock: toBlock,
            toBlockHash: keccak256(abi.encode("hash", toBlock)),
            chunksRoot: root,
            manifestDigest: keccak256(abi.encode("manifest", fromBlock, toBlock, root)),
            tsBlock: 1000,
            tsIndex: 2,
            chunkCount: 12
        });
    }

    function _registerSpec() internal {
        vm.prank(alice);
        registry.registerSpec(SPEC, 900, 0);
    }

    function _publishAs(address who, uint64 fromBlock, uint64 toBlock, bytes32 root)
        internal
        returns (uint256)
    {
        vm.prank(who);
        return registry.publish(_input(fromBlock, toBlock, root));
    }

    // ------------------------------------------------------------------ specs

    function test_RegisterSpec_StoresAuthorTimeAndLocation() public {
        vm.expectEmit(true, true, false, true);
        emit SpecRegistered(SPEC, alice, 900, 0);
        _registerSpec();

        PotluckRegistry.Spec memory spec = registry.getSpec(SPEC);
        assertEq(spec.author, alice);
        assertEq(spec.registeredAt, 1_790_000_000);
        assertEq(spec.tsBlock, 900);
        assertEq(spec.tsIndex, 0);
        assertEq(registry.specCount(), 1);
        assertEq(registry.specHashAt(0), SPEC);
    }

    function test_RegisterSpec_RevertsOnDuplicate() public {
        _registerSpec();
        vm.expectRevert(
            abi.encodeWithSelector(PotluckRegistry.SpecAlreadyRegistered.selector, SPEC)
        );
        vm.prank(bob);
        registry.registerSpec(SPEC, 1, 1);
    }

    function test_RegisterSpec_RevertsOnZeroHash() public {
        vm.expectRevert(PotluckRegistry.ZeroValue.selector);
        registry.registerSpec(bytes32(0), 1, 1);
    }

    // -------------------------------------------------------------- publish

    function test_Publish_StoresManifestAndEmits() public {
        _registerSpec();
        PotluckRegistry.ManifestInput memory input = _input(20_500_000, 22_000_000, keccak256("r"));

        vm.expectEmit(true, true, true, true);
        emit ManifestPublished(
            0, SPEC, bob, GENESIS, 20_500_000, 22_000_000, input.chunksRoot, input.manifestDigest
        );
        vm.prank(bob);
        uint256 id = registry.publish(input);

        assertEq(id, 0);
        PotluckRegistry.Manifest memory m = registry.getManifest(id);
        assertEq(m.specHash, SPEC);
        assertEq(m.sourceGenesis, GENESIS);
        assertEq(m.fromBlock, 20_500_000);
        assertEq(m.toBlock, 22_000_000);
        assertEq(m.toBlockHash, input.toBlockHash);
        assertEq(m.chunksRoot, input.chunksRoot);
        assertEq(m.manifestDigest, input.manifestDigest);
        assertEq(m.tsBlock, 1000);
        assertEq(m.tsIndex, 2);
        assertEq(m.chunkCount, 12);
        assertEq(m.publisher, bob);
        assertEq(m.publishedAt, 1_790_000_000);
        assertEq(m.flags, 0);
        assertEq(registry.manifestCount(), 1);
        assertEq(registry.manifestCountBySpec(SPEC), 1);
    }

    function test_Publish_RevertsWhenSpecNotRegistered() public {
        vm.expectRevert(abi.encodeWithSelector(PotluckRegistry.SpecNotRegistered.selector, SPEC));
        registry.publish(_input(1, 2, keccak256("r")));
    }

    function test_Publish_RevertsOnInvalidRange() public {
        _registerSpec();
        vm.expectRevert(abi.encodeWithSelector(PotluckRegistry.InvalidRange.selector, 10, 9));
        registry.publish(_input(10, 9, keccak256("r")));
    }

    function test_Publish_AllowsSingleBlockRange() public {
        _registerSpec();
        uint256 id = _publishAs(bob, 7, 7, keccak256("r"));
        assertEq(registry.getManifest(id).fromBlock, 7);
    }

    function test_Publish_RevertsOnZeroFields() public {
        _registerSpec();
        PotluckRegistry.ManifestInput memory input = _input(1, 2, keccak256("r"));

        input.sourceGenesis = bytes32(0);
        vm.expectRevert(PotluckRegistry.ZeroValue.selector);
        registry.publish(input);

        input = _input(1, 2, keccak256("r"));
        input.toBlockHash = bytes32(0);
        vm.expectRevert(PotluckRegistry.ZeroValue.selector);
        registry.publish(input);

        input = _input(1, 2, bytes32(0));
        vm.expectRevert(PotluckRegistry.ZeroValue.selector);
        registry.publish(input);

        input = _input(1, 2, keccak256("r"));
        input.manifestDigest = bytes32(0);
        vm.expectRevert(PotluckRegistry.ZeroValue.selector);
        registry.publish(input);

        input = _input(1, 2, keccak256("r"));
        input.chunkCount = 0;
        vm.expectRevert(PotluckRegistry.ZeroValue.selector);
        registry.publish(input);
    }

    function test_Publish_RevertsOnDuplicateFromSamePublisher() public {
        _registerSpec();
        uint256 first = _publishAs(bob, 1, 100, keccak256("r"));
        vm.expectRevert(abi.encodeWithSelector(PotluckRegistry.DuplicateManifest.selector, first));
        _publishAs(bob, 1, 100, keccak256("r"));
    }

    function test_Publish_AllowsSameRangeFromOtherPublishers_Quorum() public {
        _registerSpec();
        uint256 a = _publishAs(bob, 1, 100, keccak256("r"));
        uint256 b = _publishAs(carol, 1, 100, keccak256("r"));
        assertEq(a, 0);
        assertEq(b, 1);
        assertEq(registry.manifestCountBySpec(SPEC), 2);
    }

    function test_Publish_AllowsDifferentRangesOfOneSpec_Backfill() public {
        _registerSpec();
        _publishAs(bob, 20_000_000, 22_000_000, keccak256("newest"));
        _publishAs(bob, 18_000_000, 19_999_999, keccak256("older"));
        _publishAs(bob, 11_405_259, 17_999_999, keccak256("oldest"));
        assertEq(registry.manifestCountBySpec(SPEC), 3);
    }

    function test_GetManifest_RevertsOnUnknownId() public {
        vm.expectRevert(abi.encodeWithSelector(PotluckRegistry.UnknownManifest.selector, 0));
        registry.getManifest(0);
    }

    // ---------------------------------------------------------- latest/paging

    function test_Latest_ReturnsNewestFirstAndClamps() public {
        _registerSpec();
        _publishAs(bob, 1, 10, keccak256("a"));
        _publishAs(bob, 11, 20, keccak256("b"));
        _publishAs(bob, 21, 30, keccak256("c"));

        PotluckRegistry.Manifest[] memory two = registry.latest(SPEC, 2);
        assertEq(two.length, 2);
        assertEq(two[0].fromBlock, 21);
        assertEq(two[1].fromBlock, 11);

        assertEq(registry.latest(SPEC, 99).length, 3);
        assertEq(registry.latest(SPEC, 0).length, 0);
        assertEq(registry.latest(OTHER_SPEC, 5).length, 0);
    }

    function test_ManifestIdsBySpec_Pages() public {
        _registerSpec();
        vm.prank(alice);
        registry.registerSpec(OTHER_SPEC, 901, 0);
        _publishAs(bob, 1, 10, keccak256("a")); // id 0, SPEC
        PotluckRegistry.ManifestInput memory other = _input(1, 10, keccak256("x"));
        other.specHash = OTHER_SPEC;
        vm.prank(bob);
        registry.publish(other); // id 1, OTHER_SPEC
        _publishAs(bob, 11, 20, keccak256("b")); // id 2, SPEC
        _publishAs(bob, 21, 30, keccak256("c")); // id 3, SPEC

        uint256[] memory page = registry.manifestIdsBySpec(SPEC, 1, 5);
        assertEq(page.length, 2);
        assertEq(page[0], 2);
        assertEq(page[1], 3);
        assertEq(registry.manifestIdsBySpec(SPEC, 3, 5).length, 0);
        assertEq(registry.manifestIdsBySpec(SPEC, 0, 0).length, 0);
        assertEq(registry.manifestIdsBySpec(OTHER_SPEC, 0, 10)[0], 1);
    }

    // ------------------------------------------------------------------ flags

    function test_Flag_CountsOncePerAddressAndEmits() public {
        _registerSpec();
        uint256 id = _publishAs(bob, 1, 100, keccak256("r"));

        vm.expectEmit(true, true, false, true);
        emit ManifestFlagged(
            id, carol, 3, PotluckRegistry.FlagReason.Reconciliation, keccak256("evidence")
        );
        vm.prank(carol);
        registry.flag(id, 3, PotluckRegistry.FlagReason.Reconciliation, keccak256("evidence"));

        assertEq(registry.getManifest(id).flags, 1);
        assertTrue(registry.hasFlagged(id, carol));

        vm.prank(carol);
        vm.expectRevert(PotluckRegistry.AlreadyFlagged.selector);
        registry.flag(id, 4, PotluckRegistry.FlagReason.RowMismatch, bytes32(0));

        vm.prank(alice);
        registry.flag(id, MANIFEST_BLOB, PotluckRegistry.FlagReason.Unavailable, bytes32(0));
        assertEq(registry.getManifest(id).flags, 2);
    }

    function test_Flag_RevertsForOwnManifest() public {
        _registerSpec();
        uint256 id = _publishAs(bob, 1, 100, keccak256("r"));
        vm.prank(bob);
        vm.expectRevert(PotluckRegistry.CannotFlagOwnManifest.selector);
        registry.flag(id, 0, PotluckRegistry.FlagReason.Integrity, bytes32(0));
    }

    function test_Flag_RevertsOnNoneReasonBadChunkOrUnknownId() public {
        _registerSpec();
        uint256 id = _publishAs(bob, 1, 100, keccak256("r"));

        vm.startPrank(carol);
        vm.expectRevert(PotluckRegistry.InvalidReason.selector);
        registry.flag(id, 0, PotluckRegistry.FlagReason.None, bytes32(0));

        vm.expectRevert(abi.encodeWithSelector(PotluckRegistry.InvalidChunkIndex.selector, 12));
        registry.flag(id, 12, PotluckRegistry.FlagReason.Integrity, bytes32(0));

        vm.expectRevert(abi.encodeWithSelector(PotluckRegistry.UnknownManifest.selector, 9));
        registry.flag(9, 0, PotluckRegistry.FlagReason.Integrity, bytes32(0));
        vm.stopPrank();
    }

    // --------------------------------------------------------------- renewal

    function test_NoteRenewal_ManifestBlobUpdatesLocation() public {
        _registerSpec();
        uint256 id = _publishAs(bob, 1, 100, keccak256("r"));

        vm.expectEmit(true, true, true, true);
        emit Renewed(id, MANIFEST_BLOB, 5000, 7, carol);
        vm.prank(carol);
        registry.noteRenewal(id, MANIFEST_BLOB, 5000, 7);

        PotluckRegistry.Manifest memory m = registry.getManifest(id);
        assertEq(m.tsBlock, 5000);
        assertEq(m.tsIndex, 7);
    }

    function test_NoteRenewal_ChunkOnlyEmits() public {
        _registerSpec();
        uint256 id = _publishAs(bob, 1, 100, keccak256("r"));

        vm.expectEmit(true, true, true, true);
        emit Renewed(id, 11, 6000, 1, alice);
        vm.prank(alice);
        registry.noteRenewal(id, 11, 6000, 1);

        PotluckRegistry.Manifest memory m = registry.getManifest(id);
        assertEq(m.tsBlock, 1000);
        assertEq(m.tsIndex, 2);
    }

    function test_NoteRenewal_RevertsOnBadChunkOrUnknownId() public {
        _registerSpec();
        uint256 id = _publishAs(bob, 1, 100, keccak256("r"));
        vm.expectRevert(abi.encodeWithSelector(PotluckRegistry.InvalidChunkIndex.selector, 12));
        registry.noteRenewal(id, 12, 1, 1);
        vm.expectRevert(abi.encodeWithSelector(PotluckRegistry.UnknownManifest.selector, 1));
        registry.noteRenewal(1, 0, 1, 1);
    }

    // ------------------------------------------------------------------ fuzz

    function testFuzz_Publish_RoundTripsAnyValidRange(
        uint64 fromBlock,
        uint64 span,
        bytes32 root,
        uint32 chunkCount
    ) public {
        vm.assume(root != bytes32(0) && chunkCount > 0);
        uint64 toBlock = fromBlock > type(uint64).max - span ? type(uint64).max : fromBlock + span;
        _registerSpec();
        PotluckRegistry.ManifestInput memory input = _input(fromBlock, toBlock, root);
        input.chunkCount = chunkCount;
        vm.prank(bob);
        uint256 id = registry.publish(input);

        PotluckRegistry.Manifest memory m = registry.getManifest(id);
        assertEq(m.fromBlock, fromBlock);
        assertEq(m.toBlock, toBlock);
        assertEq(m.chunksRoot, root);
        assertEq(m.chunkCount, chunkCount);
        assertEq(registry.latest(SPEC, 1)[0].manifestDigest, input.manifestDigest);
    }
}
