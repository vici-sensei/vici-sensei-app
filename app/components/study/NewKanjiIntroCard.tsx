import type { KanjiDetail, NewKanjiCandidate } from "@/lib/types";

interface Props {
  candidate: NewKanjiCandidate;
  detail: KanjiDetail | "loading" | "error" | undefined;
  disabled: boolean;
  onConfirm: () => void;
}

export function NewKanjiIntroCard({ candidate, detail, disabled, onConfirm }: Props) {
  const words = detail && detail !== "loading" && detail !== "error" ? detail.words : [];

  return (
    <div className="study-card" style={{ maxWidth: 620 }}>
      <div className="card-type-tag" style={{ color: "var(--color-accent-gold)" }}>
        New kanji
      </div>
      <div className="kanji-display">{candidate.kanji}</div>
      <div className="reveal-meanings" style={{ marginBottom: 10 }}>
        {candidate.meanings?.join(", ")}
      </div>
      <div className="intro-readings">
        {candidate.kun_readings && candidate.kun_readings.length > 0 && (
          <div className="reading-chip">
            Kun: <b>{candidate.kun_readings.join("、")}</b>
          </div>
        )}
        {candidate.on_readings && candidate.on_readings.length > 0 && (
          <div className="reading-chip">
            On: <b>{candidate.on_readings.join("、")}</b>
          </div>
        )}
      </div>
      {detail === "loading" && (
        <p className="subtitle" style={{ marginTop: 20 }}>
          Loading example words…
        </p>
      )}
      {words.length > 0 && (
        <div className="example-words">
          {words.map((w) => (
            <div className="example-word-card" key={w.id}>
              <div className="ew-word">{w.vocabulary.word}</div>
              <div className="ew-kana">{w.vocabulary.kana_reading}</div>
              <div className="ew-meaning">{w.vocabulary.meanings?.join(", ")}</div>
            </div>
          ))}
        </div>
      )}
      <div className="study-actions">
        <button type="button" className="btn-primary" style={{ width: "100%" }} disabled={disabled} onClick={onConfirm}>
          Got it — next
        </button>
      </div>
    </div>
  );
}
