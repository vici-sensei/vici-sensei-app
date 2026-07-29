import type { NewVocabCandidate } from "@/lib/types";

interface Props {
  candidate: NewVocabCandidate;
  disabled: boolean;
  onConfirm: () => void;
}

export function NewVocabIntroCard({ candidate, disabled, onConfirm }: Props) {
  return (
    <div className="study-card">
      <div className="card-type-tag" style={{ color: "var(--color-accent-gold)" }}>
        New word
      </div>
      <div className="word-display">{candidate.word}</div>
      <div className="kana-display">{candidate.kana_reading}</div>
      <div className="reveal-meanings" style={{ marginTop: 10 }}>
        {candidate.meanings?.join(", ")}
      </div>
      <div className="vocab-tags">
        {candidate.parts_of_speech?.map((pos) => (
          <span className="vocab-tag" key={pos}>
            {pos}
          </span>
        ))}
        {candidate.jlpt_level && <span className="vocab-tag">{candidate.jlpt_level}</span>}
      </div>
      <div className="study-actions">
        <button type="button" className="btn-primary" style={{ width: "100%" }} disabled={disabled} onClick={onConfirm}>
          Got it — next
        </button>
      </div>
    </div>
  );
}
