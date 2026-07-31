import Link from "next/link";
import { fetchServer, fetchServerOptional } from "@/lib/api/server";
import type { KanjiDetail, KanjiProgressResponse } from "@/lib/types";
import { StatusPill } from "@/app/components/ui/StatusPill";
import { LevelBadge } from "@/app/components/ui/LevelBadge";
import { CardActions } from "@/app/components/browse/CardActions";
import { formatDueAt } from "@/lib/format";
import { buttonClasses } from "@/app/components/ui/Button";

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function KanjiDetailPage({ params }: PageProps) {
  const { id } = await params;
  const kanji = await fetchServerOptional<KanjiDetail>(`/api/kanji/${id}`);

  if (!kanji) {
    return (
      <div className="px-5 py-15 text-center text-text-muted">
        <h3 className="mb-2 text-[1.15rem] text-white">Kanji not found</h3>
        <p>This kanji doesn&apos;t exist or may have been removed.</p>
        <Link href="/browse/kanji" className={buttonClasses({ variant: "secondary", size: "sm", hover: "hover", className: "mt-4" })}>
          ← Back to results
        </Link>
      </div>
    );
  }

  const progress = await fetchServer<KanjiProgressResponse>(`/api/progress/kanji/${id}`);
  const hasProgress = progress.meaning !== null || progress.readings.length > 0;

  const colLabel = "mb-1 text-[0.72rem] font-extrabold uppercase tracking-[1px] text-text-muted";

  return (
    <div>
      <Link href="/browse/kanji" className={buttonClasses({ variant: "secondary", size: "sm", hover: "hover", className: "mb-6" })}>
        ← Back to results
      </Link>

      <div className="mb-7.5 flex flex-wrap items-center gap-7.5">
        <div className="text-[clamp(4.5rem,10vw,6rem)] font-extrabold leading-none">{kanji.kanji}</div>
        <div className="min-w-55 flex-1">
          <div className="mb-3 text-[1.35rem] font-bold">{kanji.meanings?.join(", ")}</div>
          <div className="flex flex-wrap gap-6">
            <div>
              <div className={colLabel}>Kun reading</div>
              <div className="text-[1.1rem] font-bold">{kanji.kun_readings?.join("、") || "—"}</div>
            </div>
            <div>
              <div className={colLabel}>On reading</div>
              <div className="text-[1.1rem] font-bold">{kanji.on_readings?.join("、") || "—"}</div>
            </div>
            <div>
              <div className={colLabel}>JLPT level</div>
              <div className="text-[1.1rem] font-bold">
                <LevelBadge level={kanji.level} />
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="mt-8 mb-3.5 text-[0.8rem] font-extrabold uppercase tracking-[1.2px] text-text-muted">Example words</div>
      <div className="grid grid-cols-3 gap-3 text-left max-[700px]:grid-cols-1">
        {kanji.words.map((w) => (
          <div className="rounded-xl border border-border-soft bg-white/[0.03] px-3.5 py-4" key={w.id}>
            <div className="text-[0.85rem] font-bold text-accent-blue">{w.vocabulary.kana_reading}</div>
            <div className="mb-1.5 text-2xl font-extrabold">{w.vocabulary.word}</div>
            <div className="text-[0.8rem] leading-[1.4] text-text-muted">{w.vocabulary.meanings?.join(", ")}</div>
            {w.reading_number != null && (
              <div className="mt-2 inline-block rounded-md bg-white/5 px-2 py-0.5 text-[0.68rem] font-extrabold text-text-muted">
                Reading group {w.reading_number}
              </div>
            )}
          </div>
        ))}
      </div>

      <div className="mt-8 mb-3.5 text-[0.8rem] font-extrabold uppercase tracking-[1.2px] text-text-muted">Your progress</div>
      {hasProgress ? (
        <div>
          {progress.meaning && (
            <div className="mb-2 flex flex-wrap items-center justify-between gap-4 rounded-xl border border-border-soft bg-white/[0.02] px-4.5 py-3.5">
              <div className="text-[0.92rem] font-bold">Meaning — &quot;{kanji.meanings?.[0] ?? kanji.kanji}&quot;</div>
              <div className="flex flex-wrap items-center gap-3.5">
                <StatusPill status={progress.meaning.status} />
                <span className="text-[0.8rem] tabular-nums text-text-muted">
                  due {formatDueAt(progress.meaning.due_at)} &nbsp;·&nbsp; ease {progress.meaning.ease_factor.toFixed(2)}
                </span>
                <CardActions type="meaning" id={kanji.id} status={progress.meaning.status} />
              </div>
            </div>
          )}
          {progress.readings.map((r) => (
            <div
              className="mb-2 flex flex-wrap items-center justify-between gap-4 rounded-xl border border-border-soft bg-white/[0.02] px-4.5 py-3.5"
              key={r.id}
            >
              <div className="text-[0.92rem] font-bold">
                Reading — {r.kanji_word?.vocabulary?.word ?? "—"}
                {r.kanji_word?.vocabulary?.kana_reading && (
                  <span className="font-semibold text-text-muted"> ({r.kanji_word.vocabulary.kana_reading})</span>
                )}
              </div>
              <div className="flex flex-wrap items-center gap-3.5">
                <StatusPill status={r.status} />
                <span className="text-[0.8rem] tabular-nums text-text-muted">
                  due {formatDueAt(r.due_at)} &nbsp;·&nbsp; ease {r.ease_factor.toFixed(2)}
                </span>
                <CardActions type="reading" id={r.kanji_word_id} status={r.status} />
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="rounded-xl border border-dashed border-border-soft bg-white/[0.02] px-5 py-4.5 text-[0.92rem] text-text-muted">
          You haven&apos;t started this kanji yet. It&apos;ll appear here once it comes up in your normal study queue.
        </div>
      )}
    </div>
  );
}
