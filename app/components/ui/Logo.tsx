interface LogoProps {
  size?: number;
  className?: string;
}

export function Logo({ size = 120, className }: LogoProps) {
  return (
    <svg
      role="img"
      aria-label="Vici Sensei"
      width={size}
      height={size}
      viewBox="0 0 400 400"
      xmlns="http://www.w3.org/2000/svg"
      className={`shrink-0 ${className ?? ""}`}
    >
      <defs>
        <symbol id="torii" viewBox="0 0 512 512">
          <path d="M0 80c0 26.5 21.5 48 48 48h16v64h64v-64h96v64h64v-64h96v64h64v-64h16c26.5 0 48-21.5 48-48V13.4C512 6 506 0 498.6 0c-1.7 0-3.4.3-5 1l-49 19.6C425.7 28.1 405.5 32 385.2 32H126.8c-20.4 0-40.5-3.9-59.4-11.4L18.4 1c-1.6-.6-3.3-1-5-1C6 0 0 6 0 13.4zm64 208v192c0 17.7 14.3 32 32 32s32-14.3 32-32V288h256v192c0 17.7 14.3 32 32 32s32-14.3 32-32V288h32c17.7 0 32-14.3 32-32s-14.3-32-32-32H32c-17.7 0-32 14.3-32 32s14.3 32 32 32z" />
        </symbol>
      </defs>
      <rect x="6" y="6" width="388" height="388" fill="none" stroke="var(--color-accent-red)" strokeWidth="6" />
      <rect
        x="16"
        y="16"
        width="368"
        height="368"
        fill="none"
        stroke="var(--color-accent-red)"
        strokeWidth="4"
        opacity="0.5"
      />
      <use href="#torii" x="95" y="50" width="210" height="191" fill="var(--color-accent-red)" />
      <line x1="54" y1="276" x2="346" y2="276" stroke="var(--color-accent-red)" strokeWidth="3" opacity="0.5" />
      <line x1="34" y1="286" x2="366" y2="286" stroke="var(--color-accent-red)" strokeWidth="6" />
      <text
        x="200"
        y="350"
        textAnchor="middle"
        fontFamily="var(--font-sans)"
        fontWeight="800"
        fontSize="56"
        letterSpacing="-0.5"
        fill="var(--color-text-main)"
      >
        Vici Sensei
      </text>
    </svg>
  );
}
