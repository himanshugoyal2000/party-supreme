import type { ReelStatus } from "@/lib/types";

const STYLES: Record<ReelStatus, { label: string; className: string }> = {
  pending: { label: "queued", className: "border-warn/40 bg-warn/10 text-warn" },
  fetched: { label: "extracting", className: "border-accent/40 bg-accent/10 text-accent" },
  done: { label: "captured", className: "border-good/40 bg-good/10 text-good" },
  failed: { label: "failed", className: "border-bad/40 bg-bad/10 text-bad" },
  unavailable: { label: "unavailable", className: "border-bad/30 bg-bad/5 text-bad" },
  merged: { label: "duplicate", className: "border-border bg-surface-raised text-muted" },
};

export function StatusPill({ status }: { status: ReelStatus }) {
  const style = STYLES[status] ?? STYLES.pending;

  return (
    <span
      className={`inline-flex shrink-0 items-center rounded-full border px-2 py-0.5 text-xs font-medium ${style.className}`}
    >
      {style.label}
    </span>
  );
}
