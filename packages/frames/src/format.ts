export function formatPrice(value: number): string {
  if (value >= 1000)
    return `$${value.toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
  if (value >= 1)
    return `$${value.toLocaleString("en-US", { maximumFractionDigits: 2 })}`;
  return `$${value.toPrecision(4)}`;
}

export function formatChangePct(changePct: number): string {
  return `${changePct >= 0 ? "+" : ""}${changePct.toFixed(2)}%`;
}

export function changeColor(changePct: number): string {
  return changePct >= 0 ? "#3fd08f" : "#ff6b81";
}

/** Format sats as BTC with sensible precision: "1.23 BTC", "0.0042 BTC". */
export function formatBtc(sats: number): string {
  const btc = sats / 1e8;
  if (btc >= 100) return `${btc.toFixed(0)} BTC`;
  if (btc >= 1) return `${btc.toFixed(2)} BTC`;
  if (btc >= 0.001) return `${btc.toFixed(4)} BTC`;
  return `${Math.round(sats).toLocaleString("en-US")} sats`;
}

/** Format a hashrate in H/s with a binary-ish SI suffix, e.g. "612 EH/s". */
export function formatHashrate(hs: number): string {
  const units = ["H/s", "kH/s", "MH/s", "GH/s", "TH/s", "PH/s", "EH/s", "ZH/s"];
  let v = hs;
  let i = 0;
  while (v >= 1000 && i < units.length - 1) {
    v /= 1000;
    i++;
  }
  return `${v.toFixed(v >= 100 ? 0 : v >= 10 ? 1 : 2)} ${units[i]}`;
}

/** Compact "time since" label for feeds: "now", "5m", "3h", "2d", "4w", then a date. */
export function timeAgo(ms: number): string {
  const sec = Math.max(0, Math.round((Date.now() - ms) / 1000));
  if (sec < 60) return "now";
  const min = Math.round(sec / 60);
  if (min < 60) return `${min}m`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `${hr}h`;
  const day = Math.round(hr / 24);
  if (day < 7) return `${day}d`;
  const wk = Math.round(day / 7);
  if (wk < 5) return `${wk}w`;
  return new Date(ms).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}
