"use client";

import { useEffect, useRef, useState } from "react";
import styles from "./LeaderboardAliasDice.module.css";

const IDLE_DURATION_MS = 9000;
const ROLL_DURATION_MS = 700;

function prefersReducedMotion(): boolean {
  return typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/**
 * A real CSS 3D die (6 faces via `preserve-3d`/`translateZ`, not a sprite) that floats
 * idly and, on click, tumbles to a new resting angle. Idle and reroll are both driven
 * imperatively through the Web Animations API on the same element with matching
 * `rotateX()/rotateY()` keyframe shapes throughout — mixing in a `getComputedStyle()`
 * matrix snapshot (the obvious-looking shortcut) forces the browser into matrix/quaternion
 * interpolation instead of a direct numeric one, which collapses multi-turn spins to their
 * shortest path and looks like a jarring wobble rather than a real tumble.
 */
export function LeaderboardAliasDice({
  onReroll,
  disabled,
  interactive = true,
}: {
  /** Must not throw — catch and toast internally; the dice always finishes its animation regardless of outcome. Unused when `interactive` is false. */
  onReroll?: () => Promise<void>;
  disabled?: boolean;
  /** false renders just the idle-floating die with no click/reroll -- for decorating a name elsewhere (e.g. a leaderboard row) without offering a reroll action out of context. */
  interactive?: boolean;
}) {
  const cubeRef = useRef<HTMLDivElement>(null);
  const floatRef = useRef<HTMLDivElement>(null);
  const idleAnimRef = useRef<Animation | null>(null);
  const baseYaw = useRef(35);
  const basePitch = useRef(18);
  const [rolling, setRolling] = useState(false);

  useEffect(() => {
    const cube = cubeRef.current;
    if (!cube || prefersReducedMotion()) return;

    idleAnimRef.current = cube.animate(
      [
        { transform: `rotateX(${basePitch.current}deg) rotateY(${baseYaw.current}deg)` },
        { transform: `rotateX(${basePitch.current}deg) rotateY(${baseYaw.current + 360}deg)` },
      ],
      { duration: IDLE_DURATION_MS, iterations: Infinity, easing: "linear" }
    );

    return () => idleAnimRef.current?.cancel();
  }, []);

  async function handleClick() {
    if (!interactive || rolling || disabled || !onReroll) return;
    const cube = cubeRef.current;
    const floatEl = floatRef.current;
    if (!cube || !floatEl) {
      await onReroll();
      return;
    }
    setRolling(true);

    const idle = idleAnimRef.current;
    const startYaw =
      idle && typeof idle.currentTime === "number"
        ? baseYaw.current + ((idle.currentTime % IDLE_DURATION_MS) / IDLE_DURATION_MS) * 360
        : baseYaw.current;
    idle?.cancel();

    floatEl.classList.remove(styles.bounceAnim);
    void floatEl.offsetWidth; // restart the CSS animation even if a previous roll's class is still attached
    floatEl.classList.add(styles.bounceAnim);

    // One continuous, monotonic spin (2-3 full turns) plus a single settle of
    // the tilt — exactly one interpolation segment, so there's nothing for the
    // easing curve to fight and no direction reversal to look like a glitch.
    const turns = 2 + Math.floor(Math.random() * 2);
    const endYaw = startYaw + turns * 360 + Math.random() * 360;
    const endPitch = 12 + Math.random() * 14;

    const anim = cube.animate(
      [
        { transform: `rotateX(${basePitch.current}deg) rotateY(${startYaw}deg)` },
        { transform: `rotateX(${endPitch}deg) rotateY(${endYaw}deg)` },
      ],
      { duration: ROLL_DURATION_MS, easing: "cubic-bezier(.16,.7,.25,1)", fill: "forwards" }
    );

    const animationFinished = new Promise<void>((resolve) => {
      anim.onfinish = () => resolve();
    });

    // Run the RPC and the animation together so a fast response doesn't cut the roll short.
    await Promise.all([onReroll(), animationFinished]);

    baseYaw.current = endYaw % 360;
    basePitch.current = endPitch;
    anim.cancel();
    idleAnimRef.current = prefersReducedMotion()
      ? null
      : cube.animate(
          [
            { transform: `rotateX(${basePitch.current}deg) rotateY(${baseYaw.current}deg)` },
            { transform: `rotateX(${basePitch.current}deg) rotateY(${baseYaw.current + 360}deg)` },
          ],
          { duration: IDLE_DURATION_MS, iterations: Infinity, easing: "linear" }
        );
    setRolling(false);
  }

  const scene = (
    <div className={styles.dieScene}>
      <div className={styles.dieFloat} ref={floatRef}>
        <div className={styles.dieCube} ref={cubeRef}>
          <div className={`${styles.dieFace} ${styles.faceFront}`}>
            <span className={`${styles.pip} ${styles.posC}`} />
          </div>
          <div className={`${styles.dieFace} ${styles.faceBack}`}>
            <span className={`${styles.pip} ${styles.posTl}`} />
            <span className={`${styles.pip} ${styles.posMl}`} />
            <span className={`${styles.pip} ${styles.posBl}`} />
            <span className={`${styles.pip} ${styles.posTr}`} />
            <span className={`${styles.pip} ${styles.posMr}`} />
            <span className={`${styles.pip} ${styles.posBr}`} />
          </div>
          <div className={`${styles.dieFace} ${styles.faceRight}`}>
            <span className={`${styles.pip} ${styles.posTl}`} />
            <span className={`${styles.pip} ${styles.posC}`} />
            <span className={`${styles.pip} ${styles.posBr}`} />
          </div>
          <div className={`${styles.dieFace} ${styles.faceLeft}`}>
            <span className={`${styles.pip} ${styles.posTl}`} />
            <span className={`${styles.pip} ${styles.posTr}`} />
            <span className={`${styles.pip} ${styles.posBl}`} />
            <span className={`${styles.pip} ${styles.posBr}`} />
          </div>
          <div className={`${styles.dieFace} ${styles.faceTop}`}>
            <span className={`${styles.pip} ${styles.posTl}`} />
            <span className={`${styles.pip} ${styles.posTr}`} />
            <span className={`${styles.pip} ${styles.posC}`} />
            <span className={`${styles.pip} ${styles.posBl}`} />
            <span className={`${styles.pip} ${styles.posBr}`} />
          </div>
          <div className={`${styles.dieFace} ${styles.faceBottom}`}>
            <span className={`${styles.pip} ${styles.posTl}`} />
            <span className={`${styles.pip} ${styles.posBr}`} />
          </div>
        </div>
      </div>
    </div>
  );

  if (!interactive) {
    return (
      <div className="inline-flex h-9 w-9 shrink-0 items-center justify-center" aria-hidden>
        {scene}
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={rolling || disabled}
      aria-label="Reroll random name"
      title="Reroll"
      className="flex h-13 w-13 shrink-0 cursor-pointer items-center justify-center rounded-[13px] border border-border-soft bg-white/[0.035] transition-colors enabled:hover:border-accent-red/30 enabled:hover:bg-white/[0.06] disabled:cursor-not-allowed"
    >
      {scene}
    </button>
  );
}
