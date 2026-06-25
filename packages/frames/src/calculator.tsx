import { defineFrame } from "@zframes/core";
import { useEffect, useMemo, useState } from "react";
import type { z } from "zod";
import { interactiveSurface } from "./content-shared";
import { calculatorMeta } from "./schemas";
import { scrollAreaClass } from "./ui";

const schema = calculatorMeta.schema;
type Config = z.output<typeof schema>;

const accent = "var(--color-highlight)";

function toNum(v: string): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function Field({
  label,
  value,
  onChange,
  prefix,
  suffix,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  prefix?: string;
  suffix?: string;
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="caption text-soft uppercase tracking-[0.12em]">
        {label}
      </span>
      <span
        className={`flex items-center gap-1 px-2 py-1.5 ${interactiveSurface}`}
      >
        {prefix && <span className="body-sm text-soft">{prefix}</span>}
        <input
          type="number"
          inputMode="decimal"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="body-sm text-normal min-w-0 flex-1 bg-transparent text-right tabular-nums outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
        />
        {suffix && <span className="body-sm text-soft">{suffix}</span>}
      </span>
    </label>
  );
}

function Calculator({ config }: { config: Config }) {
  const [account, setAccount] = useState(String(config.account));
  const [riskPct, setRiskPct] = useState(String(config.riskPct));
  const [entry, setEntry] = useState(String(config.entry));
  const [stop, setStop] = useState(String(config.stop));

  // Reflect config-rail edits into the live inputs (config only changes via
  // the rail, never mid-typing, so this never clobbers in-progress input).
  useEffect(() => setAccount(String(config.account)), [config.account]);
  useEffect(() => setRiskPct(String(config.riskPct)), [config.riskPct]);
  useEffect(() => setEntry(String(config.entry)), [config.entry]);
  useEffect(() => setStop(String(config.stop)), [config.stop]);

  const r = useMemo(() => {
    const acct = toNum(account);
    const risk = toNum(riskPct);
    const e = toNum(entry);
    const s = toNum(stop);
    const riskAmount = (acct * risk) / 100;
    const perUnit = Math.abs(e - s);
    const size = perUnit > 0 ? riskAmount / perUnit : 0;
    const value = size * e;
    const side = e === s ? "—" : s < e ? "long" : "short";
    return { riskAmount, perUnit, size, value, side, hasStop: perUnit > 0 };
  }, [account, riskPct, entry, stop]);

  const cur = config.currency;
  const money = (n: number) =>
    `${cur}${n.toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
  const units = (n: number) =>
    n.toLocaleString(undefined, { maximumFractionDigits: n >= 1 ? 2 : 4 });

  return (
    <div className={`${scrollAreaClass} flex flex-col gap-3`}>
      <div className="grid grid-cols-2 gap-2">
        <Field
          label="Account"
          value={account}
          onChange={setAccount}
          prefix={cur}
        />
        <Field label="Risk" value={riskPct} onChange={setRiskPct} suffix="%" />
        <Field label="Entry" value={entry} onChange={setEntry} prefix={cur} />
        <Field label="Stop" value={stop} onChange={setStop} prefix={cur} />
      </div>

      <div className="flex flex-col gap-1.5 rounded-lg border border-white/[0.07] bg-white/[0.03] p-2.5">
        <div className="flex items-baseline justify-between">
          <span className="caption text-soft uppercase tracking-[0.12em]">
            Position size
          </span>
          <span
            className="body-lg font-extrabold tabular-nums"
            style={{ color: r.hasStop ? accent : undefined }}
          >
            {r.hasStop ? units(r.size) : "—"}
          </span>
        </div>
        <Row label="Risk amount" value={money(r.riskAmount)} />
        <Row
          label="Per-unit risk"
          value={r.hasStop ? money(r.perUnit) : "set a stop"}
        />
        <Row label="Position value" value={r.hasStop ? money(r.value) : "—"} />
        <Row label="Direction" value={r.side} />
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between">
      <span className="body-sm text-soft">{label}</span>
      <span className="body-sm text-normal tabular-nums">{value}</span>
    </div>
  );
}

export const calculatorFrame = defineFrame({
  ...calculatorMeta,
  component: Calculator,
});
