import Link from "next/link";
import { fetchServer, fetchServerOptional } from "@/lib/api/server";
import type { KanjiDetail, KanjiProgressResponse } from "@/lib/types";
import { StatusPill } from "@/app/components/ui/StatusPill";
import { CardActions } from "@/app/components/browse/CardActions";
import { formatDueAt } from "@/lib/format";

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function KanjiDetailPage({ params }: PageProps) {
  const { id } = await params;
  const kanji = await fetchServerOptional<KanjiDetail>(`/api/kanji/${id}`);

  if (!kanji) {
    return (
      <div className="empty-state">
        <h3>Kanji not found</h3>
        <p>This kanji doesn&apos;t exist or may have been removed.</p>
        <Link href="/browse/kanji" className="btn-secondary btn-sm" style={{ marginTop: 16, display: "inline-flex" }}>
          ← Back to results
        </Link>
      </div>
    );
  }

  const progress = await fetchServer<KanjiProgressResponse>(`/api/progress/kanji/${id}`);
  const hasProgress = progress.meaning !== null || progress.readings.length > 0;

  return (
    <div>
      <Link href="/browse/kanji" className="btn-secondary btn-sm" style={{ marginBottom: 24, display: "inline-flex" }}>
        ← Back to results
      </Link>

      <div className="detail-header">
        <div className="detail-char">{kanji.kanji}</div>
        <div className="detail-meta">
          <div className="detail-meanings">{kanji.meanings?.join(", ")}</div>
          <div className="reading-row">
            <div className="reading-col">
              <div className="lbl">Kun reading</div>
              <div className="vals">{kanji.kun_readings?.join("、") || "—"}</div>
            </div>
            <div className="reading-col">
              <div className="lbl">On reading</div>
              <div className="vals">{kanji.on_readings?.join("、") || "—"}</div>
            </div>
            <div className="reading-col">
              <div className="lbl">JLPT level</div>
              <div className="vals">
                <span className="lvl-badge">{kanji.level ?? "—"}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="section-title">Example words</div>
      <div className="example-words">
        {kanji.words.map((w) => (
          <div className="example-word-card" key={w.id}>
            <div className="ew-word">{w.vocabulary.word}</div>
            <div className="ew-kana">{w.vocabulary.kana_reading}</div>
            <div className="ew-meaning">{w.vocabulary.meanings?.join(", ")}</div>
            {w.reading_number != null && <div className="ew-reading-tag">Reading group {w.reading_number}</div>}
          </div>
        ))}
      </div>

      <div className="section-title">Your progress</div>
      {hasProgress ? (
        <div>
          {progress.meaning && (
            <div className="progress-row">
              <div className="pr-label">Meaning — &quot;{kanji.meanings?.[0] ?? kanji.kanji}&quot;</div>
              <div className="progress-meta-group">
                <StatusPill status={progress.meaning.status} />
                <span className="pr-meta">
                  due {formatDueAt(progress.meaning.due_at)} &nbsp;·&nbsp; ease {progress.meaning.ease_factor.toFixed(2)}
                </span>
                <CardActions type="meaning" id={kanji.id} status={progress.meaning.status} />
              </div>
            </div>
          )}
          {progress.readings.map((r) => (
            <div className="progress-row" key={r.id}>
              <div className="pr-label">
                Reading — {r.kanji_word?.vocabulary?.word ?? "—"}
                {r.kanji_word?.vocabulary?.kana_reading && (
                  <span style={{ color: "var(--color-text-muted)", fontWeight: 600 }}>
                    {" "}
                    ({r.kanji_word.vocabulary.kana_reading})
                  </span>
                )}
              </div>
              <div className="progress-meta-group">
                <StatusPill status={r.status} />
                <span className="pr-meta">
                  due {formatDueAt(r.due_at)} &nbsp;·&nbsp; ease {r.ease_factor.toFixed(2)}
                </span>
                <CardActions type="reading" id={r.kanji_word_id} status={r.status} />
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="no-progress-note">
          You haven&apos;t started this kanji yet. It&apos;ll appear here once it comes up in your normal study queue.
        </div>
      )}
    </div>
  );
}
