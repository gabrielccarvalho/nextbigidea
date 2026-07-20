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
