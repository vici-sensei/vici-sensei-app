"use client";

import { useAnimatedPercent } from "@/lib/useAnimatedPercent";

interface RingCircleProps {
  cx: number;
  cy: number;
  radius: number;
  strokeWidth: number;
}

export function RingTrack({ cx, cy, radius, strokeWidth, className = "stroke-white/10" }: RingCircleProps & { className?: string }) {
  return <circle cx={cx} cy={cy} r={radius} fill="none" strokeWidth={strokeWidth} className={className} />;
}

interface AnimatedRingStrokeProps extends RingCircleProps {
  percent: number;
  inView: boolean;
  className: string;
}

/** One animated progress-ring stroke: pair with RingTrack for the static background circle it
 * draws over. Eases toward `percent` once `inView` flips true (see useAnimatedPercent) -- shared
 * by the dashboard's per-stat rings (StatRing) and the multi-ring level-progress rings (LevelRing). */
export function AnimatedRingStroke({ cx, cy, radius, strokeWidth, percent, inView, className }: AnimatedRingStrokeProps) {
  const animatedPercent = useAnimatedPercent(percent, inView);
  const circumference = 2 * Math.PI * radius;
  const offset = circumference * (1 - animatedPercent / 100);
  return (
    <circle
      cx={cx}
      cy={cy}
      r={radius}
      fill="none"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeDasharray={circumference}
      strokeDashoffset={offset}
      className={`${className} transition-[stroke-dashoffset] duration-1000 ease-out`}
    />
  );
}
