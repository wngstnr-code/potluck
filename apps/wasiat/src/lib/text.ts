import { encodeAddress } from "@polkadot/util-crypto";
import { KUSAMA_AH } from "../config";
import type { TimelineEvent } from "./recovery";

export const ss58 = (hex: string, prefix = KUSAMA_AH.ss58) => encodeAddress(hex, prefix);
export const shortSs58 = (hex: string | null | undefined, prefix = KUSAMA_AH.ss58) => {
  if (!hex) return "—";
  const a = ss58(hex, prefix);
  return `${a.slice(0, 6)}…${a.slice(-4)}`;
};

/** Planck → token units with up to 4 decimals. */
export function formatToken(v: bigint, decimals: number): string {
  const scale = 10n ** BigInt(decimals);
  const whole = v / scale;
  const frac = (v % scale).toString().padStart(decimals, "0").slice(0, 4).replace(/0+$/, "");
  return `${whole.toLocaleString("en-US")}${frac ? `.${frac}` : ""}`;
}

/** A delay in relay-chain blocks as a human duration. */
export function blocksToDuration(blocks: number, seconds = KUSAMA_AH.relayBlockSeconds): string {
  if (blocks === 0) return "none";
  const s = blocks * seconds;
  if (s < 3_600) return `${Math.round(s / 60)} min`;
  if (s < 86_400) return `${Math.round(s / 3_600)} h`;
  return `${Math.round(s / 86_400)} days`;
}

export const formatDate = (ms: number) =>
  ms
    ? new Date(ms).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })
    : "—";

/** Human headline and detail for a timeline entry. */
export function describe(e: TimelineEvent): { title: string; detail: string } {
  const f = e.fields;
  const group =
    f.friend_group_index != null ? ` (friend group ${Number(f.friend_group_index) + 1})` : "";
  switch (e.kind) {
    case "FriendGroupsCarriedOver":
      return {
        title: "Plan already in place",
        detail:
          "Friend groups migrated from the previous Recovery pallet when the inheritance API went live.",
      };
    case "InheritorCarriedOver":
      return {
        title: "Already inherited",
        detail: `${shortSs58(f.inheritor)} controlled this account before the inheritance API went live${group}.`,
      };
    case "AttemptCarriedOver":
      return {
        title: "Recovery already underway",
        detail: `An attempt started by ${shortSs58(f.initiator)} under the previous pallet was migrated${group}.`,
      };
    case "FriendGroupsChanged":
      return {
        title: "Inheritance plan updated",
        detail: "The owner set or replaced the friend groups.",
      };
    case "AttemptInitiated":
      return {
        title: "Recovery attempt started",
        detail: `Started by ${shortSs58(f.initiator)}${group}.`,
      };
    case "AttemptApproved":
      return {
        title: "A friend approved",
        detail: `${shortSs58(f.friend)} vouched for the attempt${group}.`,
      };
    case "AttemptCanceled":
      return { title: "Attempt canceled", detail: `Canceled by ${shortSs58(f.canceler)}${group}.` };
    case "AttemptFinished":
      return {
        title: "Inheritance completed",
        detail: `${shortSs58(f.inheritor)} now inherits the account${group}.`,
      };
    case "AttemptDiscarded":
      return {
        title: "Attempt discarded",
        detail: `A higher-priority inheritor already exists${group}.`,
      };
    case "AttemptSlashed":
      return { title: "Attempt slashed", detail: `The initiator's deposit was slashed${group}.` };
    case "InheritorRevoked":
      return {
        title: "Inheritor revoked",
        detail: "The inheritor gave up control of the account.",
      };
    case "RecoveredAccountControlled":
      return {
        title: "Inheritor acted",
        detail: `${shortSs58(f.inheritor)} dispatched a call as the account.`,
      };
    default:
      return { title: e.kind, detail: "" };
  }
}
