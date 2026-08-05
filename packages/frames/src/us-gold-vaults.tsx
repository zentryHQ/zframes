import { BarChart, TreeChart, type TreeNode } from "@zframes/charts";
import {
  type GoldReserveEntry,
  defineFrame,
  useGoldReserve,
} from "@zframes/core";
import { useMemo } from "react";
import type { z } from "zod";
import { formatCompact, formatPct } from "./format";
import { usGoldVaultsMeta } from "./schemas";
import { TreemapLeaf } from "./treemap-leaf";
import { FrameStatus } from "./ui";

const schema = usGoldVaultsMeta.schema;

interface VaultNode extends TreeNode {
  ounces: number;
  sharePct: number;
}

/**
 * The Treasury's `location_desc` strings are written for a printed table
 * ("Federal Reserve Banks - NY Vault", "All locations - Coins, blanks,
 * miscellaneous") and are far too long for a treemap tile or a bar gutter, so
 * each line is matched to the name the vault is actually known by. Anything the
 * report adds later falls through to its own tail segment rather than vanishing.
 */
function vaultLabel(entry: GoldReserveEntry): string {
  const where = `${entry.location} ${entry.facility}`.toLowerCase();
  if (where.includes("fort knox")) return "Fort Knox";
  if (where.includes("west point")) return "West Point";
  if (where.includes("denver")) return "Denver";
  // Checked before the generic Federal-Reserve match: the display gold is a
  // Federal Reserve line too, and it's a museum case, not the vault.
  if (where.includes("display")) return "Display Cases";
  if (where.includes("working stock") || where.includes("coins, blanks"))
    return "Mint Working Stock";
  if (where.includes("ny vault") || where.includes("federal reserve"))
    return "NY Fed Vault";
  return entry.location.split(" - ").at(-1) ?? entry.location;
}

/**
 * The published table interleaves subtotal and total lines with the vault
 * lines; counting them would double every share.
 */
function isRollup(entry: GoldReserveEntry): boolean {
  return `${entry.location} ${entry.facility}`.toLowerCase().includes("total");
}

function formatOunces(value: number) {
  return `${formatCompact(value)} oz`;
}

function vaultSharePct(node: VaultNode) {
  return node.sharePct;
}

function Leaf({
  width,
  height,
  data,
}: {
  width: number;
  height: number;
  data: VaultNode;
}) {
  const ounces = `${formatCompact(data.ounces)} oz`;
  const share = formatPct(data.sharePct, 1);
  return (
    <TreemapLeaf
      width={width}
      height={height}
      label={data.id}
      secondary={`${ounces} · ${share}`}
      title={`${data.id} · ${ounces} · ${share} of the reserve`}
    />
  );
}

function UsGoldVaults({ config }: { config: z.output<typeof schema> }) {
  const { reserve, isLoading } = useGoldReserve();

  const { vaults, totalOunces, bars } = useMemo(() => {
    const byVault = new Map<string, number>();
    for (const entry of reserve?.entries ?? []) {
      if (entry.ounces <= 0 || isRollup(entry)) continue;
      const label = vaultLabel(entry);
      // Bullion and coin lines can share a location — one vault, one tile.
      byVault.set(label, (byVault.get(label) ?? 0) + entry.ounces);
    }
    const total = [...byVault.values()].reduce((sum, oz) => sum + oz, 0);
    const nodes: VaultNode[] = [...byVault.entries()]
      .map(([label, ounces]) => ({
        id: label,
        value: ounces,
        ounces,
        sharePct: total > 0 ? (ounces / total) * 100 : 0,
      }))
      .sort((a, b) => b.ounces - a.ounces);
    return {
      vaults: nodes,
      totalOunces: total,
      bars: nodes.map((v) => ({ label: v.id, value: v.ounces })),
    };
  }, [reserve]);

  if (isLoading && vaults.length === 0)
    return <FrameStatus loading>loading vault report…</FrameStatus>;
  if (vaults.length === 0)
    return <FrameStatus>no vault breakdown yet</FrameStatus>;

  return (
    <div className="flex h-full min-h-0 flex-col gap-2">
      <div className="caption text-soft flex items-baseline justify-between gap-3">
        <span className="truncate">
          {formatCompact(totalOunces)} oz across {vaults.length} locations
        </span>
        <span className="shrink-0">fine troy ounces</span>
      </div>

      {config.mode === "bars" ? (
        <div className="text-normal flex min-h-0 flex-1 flex-col justify-center">
          <BarChart
            data={bars}
            orientation="horizontal"
            height={Math.max(vaults.length * 26, 96)}
            formatValue={formatOunces}
          />
        </div>
      ) : (
        <div className="min-h-0 flex-1">
          <TreeChart
            data={vaults}
            LeafComponent={Leaf}
            getColorValue={vaultSharePct}
          />
        </div>
      )}
    </div>
  );
}

export const usGoldVaultsFrame = defineFrame({
  ...usGoldVaultsMeta,
  component: UsGoldVaults,
});
