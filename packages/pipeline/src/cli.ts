import "dotenv/config";
import { runPipeline } from "./run";

runPipeline()
  .then((report) => {
    report.writeGithubSummary();
    console.log(JSON.stringify(report.toStats(), null, 2));
    // Non-zero exit on total failure so the Actions job (and issue-on-failure) fires.
    if (report.status === "failed") process.exit(1);
  })
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
