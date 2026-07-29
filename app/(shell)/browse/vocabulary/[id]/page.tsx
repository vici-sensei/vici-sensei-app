import Link from "next/link";
import { fetchServerOptional } from "@/lib/api/server";
import type { VocabularyProgress, VocabularyRow } from "@/lib/types";
import { StatusPill } from "@/app/components/ui/StatusPill";
import { CardActions } from "@/app/components/browse/CardActions";
import { formatDueAt } from "@/lib/format";

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function VocabularyDetailPage({ params }: PageProps) {
  const { id } = await params;
  const word = await fetchServerOptional<VocabularyRow>(`/api/vocabulary/${id}`);

  if (!word) {
    return (
      <div className="empty-state">
        <h3>Word not found</h3>
        <p>This vocabulary entry doesn&apos;t exist or may have been removed.</p>
        <Link href="/browse/vocabulary" className="btn-secondary btn-sm" style={{ marginTop: 16, display: "inline-flex" }}>
          ← Back to results
        </Link>
      </div>
    );
  }

  const progress = await fetchServerOptional<VocabularyProgress>(`/api/progress/vocabulary/${id}`);

  return (
    <div>
      <Link href="/browse/vocabulary" className="btn-secondary btn-sm" style={{ marginBottom: 24, display: "inline-flex" }}>
        ← Back to results
      </Link>

      <div className="detail-header">
        <div className="detail-word-block">
          <div className="detail-word">{word.word}</div>
          <div className="detail-kana">
            {word.kana_reading}
            {word.romaji_reading && <> &nbsp;·&nbsp; romaji: {word.romaji_reading}</>}
          </div>
          <div className="detail-meanings">{word.meanings?.join(", ")}</div>
          <div className="detail-facts">
            <div className="fact-col">
              <div className="lbl">Part of speech</div>
              <div className="vals">{word.parts_of_speech?.join(", ") || "—"}</div>
            </div>
            <div className="fact-col">
              <div className="lbl">JLPT level</div>
              <div className="vals">
                <span className="lvl-badge">{word.jlpt_level ?? "—"}</span>
              </div>
            </div>
            <div className="fact-col">
              <div className="lbl">Other readings</div>
              <div className="vals" style={{ color: "var(--color-text-muted)" }}>
                {word.other_readings?.join(", ") || "—"}
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="section-title">Your progress</div>
      {progress ? (
        <div className="progress-row">
          <div className="pr-label">Meaning — &quot;{word.meanings?.[0] ?? word.word}&quot;</div>
          <div className="progress-meta-group">
            <StatusPill status={progress.status} />
            <span className="pr-meta">
              due {formatDueAt(progress.due_at)} &nbsp;·&nbsp; ease {progress.ease_factor.toFixed(2)}
            </span>
            <CardActions type="vocab" id={word.id} status={progress.status} />
          </div>
        </div>
      ) : (
        <div className="no-progress-note">
          You haven&apos;t started this word yet. It&apos;ll appear here once it comes up in your normal study queue.
        </div>
      )}
    </div>
  );
}
