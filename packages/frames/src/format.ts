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
