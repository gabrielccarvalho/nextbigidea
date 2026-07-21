import "dotenv/config";
import { runPipeline } from "./run";

runPipeline()
  .then((report) => {
    report.writeGithubSummary();
    console.log(JSON.stringify(report.toStats(), null, 2));
    // Exit non-zero on anything alarming, not just total failure — see
    // PipelineRunReport.isAlarming. Previously this checked `status === "failed"`,
    // which requires EVERY source to fail, so a partly-broken or entirely fruitless
    // run exited 0 and reported a green check every week.
    if (report.isAlarming) {
      console.error(`pipeline run is alarming: ${report.alarmReason}`);
      process.exit(1);
    }
  })
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
