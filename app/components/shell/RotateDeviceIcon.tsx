interface RotateDeviceIconProps {
  size?: number;
  className?: string;
}

export function RotateDeviceIcon({ size = 24, className }: RotateDeviceIconProps) {
  return (
    <svg
      aria-hidden="true"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      xmlns="http://www.w3.org/2000/svg"
      className={`shrink-0 origin-center animate-[vici-rotate-phone_1.8s_ease-in-out_infinite] ${className ?? ""}`}
    >
      <rect
        x="6"
        y="2"
        width="12"
        height="20"
        rx="2.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
      />
      <circle cx="12" cy="18.5" r="1" fill="currentColor" />
    </svg>
  );
}
