import { ApiPromise, WsProvider } from "@polkadot/api";
import { u8aToHex } from "@polkadot/util";
import { decodeAddress } from "@polkadot/util-crypto";
import { fmt } from "@potluck/ui/format";
import { Icon } from "@potluck/ui/Icon";
import { Identicon } from "@potluck/ui/Identicon";
import { type FormEvent, useEffect, useMemo, useState } from "react";
import { KUSAMA_AH, PORTALDOT } from "./config";
import { useRecovery } from "./lib/RecoveryContext";
import { formatToken, ss58 } from "./lib/text";

/** An account shared by the wallet extension. */
type InjectedAccountWithMeta = Awaited<
  ReturnType<typeof import("@polkadot/extension-dapp")["web3Accounts"]>
>[number];

const DAY_BLOCKS = Math.round(86_400 / PORTALDOT.blockSeconds);

type Wallet =
  | { status: "idle" }
  | { status: "connecting" }
  | { status: "none"; message: string }
  | { status: "ready"; accounts: InjectedAccountWithMeta[] };

type Submit =
  | { status: "idle" }
  | { status: "estimating" }
  | { status: "estimated"; fee: string }
  | { status: "signing" }
  | { status: "included"; hash: string; block: string }
  | { status: "error"; message: string };

interface PortaldotInfo {
  api: ApiPromise;
  plans: number;
  securityDeposit: bigint;
  maxFriends: number;
  head: number;
}

const toHex = (address: string): string | null => {
  try {
    return u8aToHex(decodeAddress(address.trim())).toLowerCase();
  } catch {
    return null;
  }
};

/** Builds the set_friend_groups argument; friends must be sorted by bytes and unique (pallet rule). */
function validate(form: Form, owner: string | null, maxFriends: number) {
  const problems: string[] = [];
  const lines = form.friends.split(/[\s,]+/).filter(Boolean);
  const friends = lines.map(toHex);
  if (lines.length === 0) problems.push("add at least one friend");
  if (friends.some((f) => f === null)) problems.push("a friend address is not valid SS58");
  const unique = [...new Set(friends.filter((f): f is string => !!f))].sort();
  if (unique.length !== friends.filter(Boolean).length) problems.push("a friend is listed twice");
  if (owner && unique.includes(owner)) problems.push("the owner cannot be their own friend");
  if (unique.length > maxFriends) problems.push(`at most ${maxFriends} friends on this chain`);
  const needed = Number(form.needed);
  if (!Number.isInteger(needed) || needed < 1 || needed > unique.length)
    problems.push("friends needed must be between 1 and the number of friends");
  const inheritor = toHex(form.inheritor);
  if (!inheritor) problems.push("the inheritor is not a valid SS58 address");
  const delay = Number(form.delayDays);
  const cancel = Number(form.cancelDays);
  if (!(delay >= 0) || !(cancel >= 0)) problems.push("delays must be zero or more days");
  return {
    problems,
    group: {
      friends: unique,
      friends_needed: needed,
      inheritor: inheritor ?? "",
      inheritance_delay: Math.round(delay * DAY_BLOCKS),
      inheritance_priority: 0,
      cancel_delay: Math.round(cancel * DAY_BLOCKS),
    },
  };
}

interface Form {
  friends: string;
  needed: string;
  inheritor: string;
  delayDays: string;
  cancelDays: string;
}

export function Setup() {
  const kusama = useRecovery();
  const [info, setInfo] = useState<PortaldotInfo | null>(null);
  const [infoError, setInfoError] = useState<string | null>(null);
  const [wallet, setWallet] = useState<Wallet>({ status: "idle" });
  const [owner, setOwner] = useState<string>("");
  const [form, setForm] = useState<Form>({
    friends: "",
    needed: "2",
    inheritor: "",
    delayDays: "30",
    cancelDays: "7",
  });
  const [submit, setSubmit] = useState<Submit>({ status: "idle" });

  useEffect(() => {
    let api: ApiPromise | undefined;
    let cancelled = false;
    (async () => {
      api = await ApiPromise.create({
        provider: new WsProvider(PORTALDOT.ws, 1_000),
        noInitWarn: true,
      });
      const [keys, head] = await Promise.all([
        api.query.recovery?.friendGroups?.keys() ?? Promise.resolve([]),
        api.rpc.chain.getHeader(),
      ]);
      const consts = api.consts.recovery as unknown as {
        securityDeposit: { toBigInt(): bigint };
        maxFriendsPerConfig: { toNumber(): number };
      };
      if (!cancelled) {
        setInfo({
          api,
          plans: keys.length,
          securityDeposit: consts.securityDeposit.toBigInt(),
          maxFriends: consts.maxFriendsPerConfig.toNumber(),
          head: head.number.toNumber(),
        });
      }
    })().catch(
      (e: unknown) => !cancelled && setInfoError(e instanceof Error ? e.message : String(e)),
    );
    return () => {
      cancelled = true;
      void api?.disconnect();
    };
  }, []);

  const ownerHex = owner ? toHex(owner) : null;
  const checked = useMemo(
    () => validate(form, ownerHex, info?.maxFriends ?? 100),
    [form, ownerHex, info],
  );
  const ready = info && ownerHex && checked.problems.length === 0;

  const connect = async () => {
    setWallet({ status: "connecting" });
    try {
      const { web3Accounts, web3Enable } = await import("@polkadot/extension-dapp");
      const extensions = await web3Enable("Wasiat-lite");
      if (extensions.length === 0) {
        setWallet({
          status: "none",
          message: "No Polkadot wallet extension found or access was declined.",
        });
        return;
      }
      const accounts = await web3Accounts({ ss58Format: PORTALDOT.ss58 });
      if (accounts.length === 0) {
        setWallet({ status: "none", message: "The wallet has no accounts to share." });
        return;
      }
      setWallet({ status: "ready", accounts });
      setOwner(accounts[0]?.address ?? "");
    } catch (e) {
      setWallet({ status: "none", message: e instanceof Error ? e.message : String(e) });
    }
  };

  const tx = () => info?.api.tx.recovery?.setFriendGroups?.([checked.group]);

  const estimate = async () => {
    const t = tx();
    if (!t || !ownerHex) return;
    setSubmit({ status: "estimating" });
    try {
      const fee = await t.paymentInfo(owner);
      setSubmit({
        status: "estimated",
        fee: formatToken(fee.partialFee.toBigInt(), PORTALDOT.decimals),
      });
    } catch (e) {
      setSubmit({ status: "error", message: e instanceof Error ? e.message : String(e) });
    }
  };

  const send = async (e: FormEvent) => {
    e.preventDefault();
    const t = tx();
    if (!t || !ready || wallet.status !== "ready") return;
    setSubmit({ status: "signing" });
    try {
      const { web3FromAddress } = await import("@polkadot/extension-dapp");
      const injector = await web3FromAddress(owner);
      const unsub = await t.signAndSend(owner, { signer: injector.signer }, (result) => {
        if (result.dispatchError) {
          const err = result.dispatchError;
          const message = err.isModule
            ? JSON.stringify(info.api.registry.findMetaError(err.asModule))
            : err.toString();
          setSubmit({ status: "error", message });
          unsub();
        } else if (result.status.isInBlock) {
          setSubmit({
            status: "included",
            hash: t.hash.toHex(),
            block: result.status.asInBlock.toHex(),
          });
          unsub();
        }
      });
    } catch (err) {
      setSubmit({ status: "error", message: err instanceof Error ? err.message : String(err) });
    }
  };

  const set = (k: keyof Form) => (ev: { target: { value: string } }) => {
    setForm((f) => ({ ...f, [k]: ev.target.value }));
    setSubmit({ status: "idle" });
  };

  return (
    <div className="page">
      <div className="head">
        <div>
          <h1 className="serif">Set up an inheritance plan on Portaldot</h1>
          <p>
            The same Recovery pallet runs on Portaldot V3. Your plan is a transaction from your own
            wallet; this page never sees your keys.
          </p>
        </div>
      </div>

      <div className="tiles">
        <div className="tile">
          <span className="lbl">Plans on Portaldot</span>
          <span className="big mono">{info ? fmt(info.plans) : "—"}</span>
          <span className="sub">
            {info ? `Recovery.FriendGroups at #${fmt(info.head)}` : (infoError ?? "connecting…")}
          </span>
        </div>
        <div className="tile">
          <span className="lbl">Max friends per plan</span>
          <span className="big mono">{info ? fmt(info.maxFriends) : "—"}</span>
          <span className="sub">
            {kusama.constants ? `${kusama.constants.maxFriends} on ${KUSAMA_AH.name}` : ""}
          </span>
        </div>
        <div className={`tile ${info && info.securityDeposit === 0n ? "red" : "yellow"}`}>
          <span className="lbl">Security deposit per attempt</span>
          <span className="big mono">
            {info ? formatToken(info.securityDeposit, PORTALDOT.decimals) : "—"}
            <small> {PORTALDOT.symbol}</small>
          </span>
          <span className="sub">
            {kusama.constants
              ? `${formatToken(kusama.constants.securityDeposit, KUSAMA_AH.decimals)} ${KUSAMA_AH.symbol} on ${KUSAMA_AH.name}`
              : ""}
          </span>
        </div>
        <div className="tile blue">
          <span className="lbl">Wallet</span>
          <span className="big">{wallet.status === "ready" ? "Connected" : "Not connected"}</span>
          <span className="sub">
            {wallet.status === "ready"
              ? `${wallet.accounts.length} account(s) shared`
              : "Polkadot.js, Talisman or SubWallet"}
          </span>
        </div>
      </div>

      <form className="content" onSubmit={send}>
        <section className="panel">
          <div className="ph">
            <h2>Friend group</h2>
            <span>one group, priority 0 · set_friend_groups</span>
          </div>
          <div className="form-grid scroll">
            <div className="field wide">
              <span id="owner-label">Owner (the account to protect)</span>
              {wallet.status === "ready" ? (
                <select
                  value={owner}
                  onChange={(e) => {
                    setOwner(e.target.value);
                    setSubmit({ status: "idle" });
                  }}
                >
                  {wallet.accounts.map((a) => (
                    <option key={a.address} value={a.address}>
                      {a.meta.name ? `${a.meta.name} · ` : ""}
                      {a.address}
                    </option>
                  ))}
                </select>
              ) : (
                <div className="inline">
                  <button
                    type="button"
                    className="btn primary"
                    onClick={connect}
                    disabled={wallet.status === "connecting"}
                  >
                    <Icon name="shield" />
                    {wallet.status === "connecting" ? "Connecting…" : "Connect wallet"}
                  </button>
                  <span className="muted">
                    {wallet.status === "none"
                      ? wallet.message
                      : "or type an SS58 address to estimate the fee"}
                  </span>
                </div>
              )}
              {wallet.status !== "ready" && (
                <input
                  className="mono"
                  value={owner}
                  onChange={(e) => {
                    setOwner(e.target.value);
                    setSubmit({ status: "idle" });
                  }}
                  aria-labelledby="owner-label"
                  placeholder="5… owner address (estimate only)"
                  spellCheck={false}
                />
              )}
            </div>
            <label className="field wide">
              <span>Friends (SS58, one per line)</span>
              <textarea
                className="mono"
                rows={5}
                value={form.friends}
                onChange={set("friends")}
                placeholder={"5F…\n5G…"}
                spellCheck={false}
              />
            </label>
            <label className="field">
              <span>Friends needed to approve</span>
              <input
                className="mono"
                type="number"
                min={1}
                value={form.needed}
                onChange={set("needed")}
              />
            </label>
            <label className="field">
              <span>Inheritor (SS58)</span>
              <input
                className="mono"
                value={form.inheritor}
                onChange={set("inheritor")}
                placeholder="5… who inherits"
                spellCheck={false}
              />
            </label>
            <label className="field">
              <span>Inheritance delay (days)</span>
              <input
                className="mono"
                type="number"
                min={0}
                step="0.5"
                value={form.delayDays}
                onChange={set("delayDays")}
              />
              <small className="mono">
                {fmt(checked.group.inheritance_delay)} blocks of ~{PORTALDOT.blockSeconds} s
              </small>
            </label>
            <label className="field">
              <span>Cancel delay (days)</span>
              <input
                className="mono"
                type="number"
                min={0}
                step="0.5"
                value={form.cancelDays}
                onChange={set("cancelDays")}
              />
              <small className="mono">{fmt(checked.group.cancel_delay)} blocks</small>
            </label>
          </div>
          <div
            className={`proof${checked.problems.length && (form.friends || form.inheritor) ? " bad" : ""}`}
          >
            <span className="t">
              <Icon name={checked.problems.length ? "cross" : "check"} />
              {checked.problems.length ? "Check" : "Ready"}
            </span>
            <p>
              {submit.status === "included"
                ? `Included in block ${submit.block.slice(0, 10)}… (tx ${submit.hash.slice(0, 10)}…).`
                : submit.status === "error"
                  ? submit.message
                  : checked.problems.length
                    ? `To fix: ${checked.problems.join("; ")}.`
                    : `Friends are sorted by address as the pallet requires. ${submit.status === "estimated" ? `Estimated fee ${submit.fee} ${PORTALDOT.symbol}.` : "Estimate the fee, then sign in your wallet."}`}
            </p>
          </div>
        </section>
        <aside className="side">
          <section className="panel">
            <div className="ph">
              <h2>Before you sign</h2>
              <span>{PORTALDOT.name}</span>
            </div>
            <ol className="explain">
              <li>
                <b>
                  {info && info.securityDeposit === 0n
                    ? "Starting a recovery is free here"
                    : "Starting a recovery costs a deposit"}
                </b>
                <span>
                  {info && info.securityDeposit === 0n
                    ? `Portaldot sets SecurityDeposit to 0 ${PORTALDOT.symbol} (Kusama Asset Hub: ${kusama.constants ? formatToken(kusama.constants.securityDeposit, KUSAMA_AH.decimals) : "…"} ${KUSAMA_AH.symbol}). Anyone can open attempts on your account for the cost of a fee, so pick friends you trust and a long inheritance delay.`
                    : "The deposit is slashed if the attempt is abusive."}
                </span>
              </li>
              <li>
                <b>Friends vouch, then the delay runs</b>
                <span>
                  After {form.needed || "?"} friend(s) approve, the inheritor waits{" "}
                  {form.delayDays || "?"} day(s) before taking control. You can cancel within the
                  cancel delay.
                </span>
              </li>
              <li>
                <b>A storage deposit is held</b>
                <span>
                  The plan is stored on chain; a small storage consideration is held from the owner
                  while the plan exists.
                </span>
              </li>
            </ol>
          </section>
          <section className="panel grow">
            <div className="ph">
              <h2>Transaction</h2>
              <span>recovery.set_friend_groups</span>
            </div>
            <div className="tx">
              {checked.group.friends.length > 0 && (
                <div className="friends">
                  {checked.group.friends.map((f) => (
                    <span key={f} className="friend" title={ss58(f, PORTALDOT.ss58)}>
                      <Identicon account={f} />
                      <span className="mono">{ss58(f, PORTALDOT.ss58).slice(0, 8)}…</span>
                    </span>
                  ))}
                </div>
              )}
              <div className="tx-actions">
                <button
                  type="button"
                  className="btn plain"
                  onClick={estimate}
                  disabled={!ready || submit.status === "estimating"}
                >
                  {submit.status === "estimating" ? "Estimating…" : "Estimate fee"}
                </button>
                <button
                  type="submit"
                  className="btn primary"
                  disabled={!ready || wallet.status !== "ready" || submit.status === "signing"}
                >
                  <Icon name="shield" />
                  {submit.status === "signing" ? "Waiting for wallet…" : "Sign and submit"}
                </button>
              </div>
              <small className="muted">
                Signing needs tPOT for the fee. The wallet shows the exact call before you approve
                it.
              </small>
            </div>
          </section>
        </aside>
      </form>
    </div>
  );
}
