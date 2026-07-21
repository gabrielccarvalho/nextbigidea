import { appendFileSync } from "node:fs";

interface SourceStat {
  fetched: number;
  failed: boolean;
  error?: string;
}

export class PipelineRunReport {
  private sources: Record<string, SourceStat> = {};
  ideasCreated = 0;
  ideasUpdated = 0;
  spentMillicents = 0;

  addSource(name: string, fetched: number, failed = false, error?: string): void {
    this.sources[name] = { fetched, failed, ...(error ? { error } : {}) };
  }

  get status(): "success" | "partial" | "failed" {
    const entries = Object.values(this.sources);
    if (entries.length === 0) return "failed";
    const anyFailed = entries.some((s) => s.failed);
    const anySucceeded = entries.some((s) => !s.failed);
    if (!anySucceeded) return "failed";
    return anyFailed ? "partial" : "success";
  }

  // Whether the process should exit non-zero, which is what makes the Actions job
  // red and opens the issue.
  //
  // "failed" alone is not enough. It requires EVERY source to fail, so with two
  // sources registered a run where one dies still scores "partial" — and the first
  // real run did exactly that: reddit 403'd, hackernews returned posts, exit code 0,
  // green check, nobody told. A degraded source is a real incident; it just isn't a
  // total one.
  //
  // Zero ideas is also a failure signal. A run can fetch posts, filter them all out,
  // and report "success" having produced nothing — which is indistinguishable from a
  // healthy week where nothing was worth publishing. The distinction that matters to
  // the business is "did this run add anything", so treat a dry run as alarming and
  // let a human dismiss it, rather than staying silent for weeks.
  get isAlarming(): boolean {
    return this.status !== "success" || this.ideasCreated + this.ideasUpdated === 0;
  }

  // Human-readable reason, so the Actions summary and the issue say WHY.
  get alarmReason(): string | null {
    if (!this.isAlarming) return null;
    const failed = Object.entries(this.sources)
      .filter(([, s]) => s.failed)
      .map(([n, s]) => `${n} (${s.error ?? "unknown error"})`);
    const parts: string[] = [];
    if (failed.length > 0) parts.push(`source(s) failed: ${failed.join("; ")}`);
    if (this.ideasCreated + this.ideasUpdated === 0) parts.push("no ideas created or updated");
    return parts.join(" — ") || "run did not succeed";
  }

  toStats(): Record<string, unknown> {
    return {
      sources: this.sources,
      ideasCreated: this.ideasCreated,
      ideasUpdated: this.ideasUpdated,
      spentUsd: (this.spentMillicents / 100000).toFixed(4),
    };
  }

  writeGithubSummary(): void {
    const path = process.env.GITHUB_STEP_SUMMARY;
    if (!path) return;
    const lines = [
      `## Pipeline run: ${this.status}`,
      "",
      ...(this.isAlarming ? [`> [!WARNING]`, `> ${this.alarmReason}`, ""] : []),
      "| source | fetched | failed | error |",
      "| --- | --- | --- | --- |",
      ...Object.entries(this.sources).map(
        ([n, s]) => `| ${n} | ${s.fetched} | ${s.failed} | ${s.error ?? ""} |`,
      ),
      "",
      `- ideas created: ${this.ideasCreated}`,
      `- ideas updated: ${this.ideasUpdated}`,
      `- estimated spend: $${(this.spentMillicents / 100000).toFixed(4)}`,
    ];
    appendFileSync(path, lines.join("\n") + "\n");
  }
}
