/** Logo C, "Balance": an A whose crossbar is an assayer's balance beam. */
export function Logo({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 120 120" aria-hidden="true">
      <path d="M60 18 L94 100 M60 18 L26 100" fill="none" stroke="#F2EFE8" strokeWidth="11" strokeLinecap="square" />
      <path d="M18 62 H102" fill="none" stroke="#D6AE55" strokeWidth="7" strokeLinecap="round" />
    </svg>
  );
}
