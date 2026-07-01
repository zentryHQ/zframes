// The official zframes mark (docs/assets/zframes-icon.svg) — the gradient "Z"
// glyph on a rounded, softly-lit tile. Inlined so it scales crisply and stays
// server-safe. `idKey` namespaces the gradient ids so multiple marks on one page
// (header + footer + sign-in) don't collide.
export function BrandMark({
  className = "h-7 w-7",
  idKey = "d",
}: {
  className?: string;
  idKey?: string;
}) {
  const tile = `zf-tile-${idKey}`;
  const glow = `zf-glow-${idKey}`;
  const zg = `zf-zg-${idKey}`;
  return (
    <svg viewBox="0 0 64 64" className={className} fill="none" aria-hidden="true">
      <defs>
        <linearGradient id={tile} x1="0" y1="0" x2="0" y2="64" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#15151E" />
          <stop offset="1" stopColor="#0A0A11" />
        </linearGradient>
        <radialGradient id={glow} cx="0.5" cy="0.46" r="0.55">
          <stop offset="0" stopColor="#7C5CFF" stopOpacity="0.42" />
          <stop offset="1" stopColor="#7C5CFF" stopOpacity="0" />
        </radialGradient>
        <linearGradient id={zg} x1="0" y1="0" x2="64" y2="64" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#5C8CFF" />
          <stop offset="1" stopColor="#A974FF" />
        </linearGradient>
      </defs>
      <rect width="64" height="64" rx="15" fill={`url(#${tile})`} />
      <rect x="6" y="6" width="52" height="52" rx="12" fill={`url(#${glow})`} />
      <g transform="translate(32,32) scale(0.05542,-0.05542) translate(-440.0,-415.0)">
        <path d="M202 830 26 0H188L364 830Z" fill="#FFFFFF" />
        <g transform="translate(428,0)">
          <path d="M16 0H420V190H237L426 660V830H18V640H205L16 170Z" fill={`url(#${zg})`} />
        </g>
      </g>
      <rect x="0.6" y="0.6" width="62.8" height="62.8" rx="14.4" stroke="#FFFFFF" strokeOpacity="0.10" />
    </svg>
  );
}
