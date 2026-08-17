import type { CSSProperties } from "react";

// Bars morph into an X with a slight overshoot past 45deg before settling -- picked over a plain
// rotate for a touch of personality (matches the streak-flame playfulness used elsewhere in the
// app). Plain inline transitions (rather than Tailwind's translate/rotate/scale utilities) so the
// morph is one real CSS `transform` per bar, matching the approved design sketch exactly.
const barBase: CSSProperties = {
  position: "absolute",
  left: 0,
  width: 18,
  height: 2,
  borderRadius: 2,
  background: "#fff",
  transition: "transform 420ms cubic-bezier(.34,1.56,.64,1), opacity 260ms ease",
};

export function MenuIcon({ open }: { open: boolean }) {
  return (
    <span style={{ position: "relative", display: "inline-block", width: 18, height: 14 }}>
      <span style={{ ...barBase, top: 0, transform: open ? "translateY(6px) rotate(45deg)" : "none" }} />
      <span
        style={{
          ...barBase,
          top: 6,
          opacity: open ? 0 : 1,
          transform: open ? "scaleX(0)" : "none",
        }}
      />
      <span style={{ ...barBase, top: 12, transform: open ? "translateY(-6px) rotate(-45deg)" : "none" }} />
    </span>
  );
}
