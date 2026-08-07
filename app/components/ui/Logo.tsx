interface LogoProps {
  size?: number;
  className?: string;
}

export function Logo({ size = 120, className }: LogoProps) {
  return (
    <svg
      viewBox="0 0 400 400"
      width={size}
      height={size}
      className={className}
      role="img"
      aria-label="Vici Sensei"
    >
      <rect x="14" y="14" width="372" height="372" rx="48" fill="none" stroke="var(--color-accent-red)" strokeWidth="10" />
      <rect x="26" y="26" width="348" height="348" rx="38" fill="none" stroke="var(--color-accent-red)" strokeWidth="3" />
      <path
        transform="translate(91,60) scale(0.34)"
        fill="var(--color-accent-red)"
        d="M0 80c0 26.5 21.5 48 48 48h16v64h64v-64h96v64h64v-64h96v64h64v-64h16c26.5 0 48-21.5 48-48V13.4C512 6 506 0 498.6 0c-1.7 0-3.4.3-5 1l-49 19.6C425.7 28.1 405.5 32 385.2 32H126.8c-20.4 0-40.5-3.9-59.4-11.4L18.4 1c-1.6-.6-3.3-1-5-1C6 0 0 6 0 13.4z"
      />
      <line x1="80" y1="290" x2="320" y2="290" stroke="var(--color-accent-red)" strokeWidth="6" strokeLinecap="round" />
      <text
        x="200"
        y="345"
        textAnchor="middle"
        fontSize="54"
        fontWeight="800"
        letterSpacing="-1"
        fill="var(--color-text-main)"
      >
        Vici Sensei
      </text>
    </svg>
  );
}
