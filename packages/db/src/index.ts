export { db, schema, getTransactionalDb } from "./client";
export * from "./schema";
export * from "./queries";

import type {
  ideas,
  rawPosts,
  pipelineRuns,
  ideaEvidence,
  purchases,
} from "./schema";

export type Idea = typeof ideas.$inferSelect;
export type NewIdea = typeof ideas.$inferInsert;
export type RawPost = typeof rawPosts.$inferSelect;
export type NewRawPost = typeof rawPosts.$inferInsert;
export type PipelineRun = typeof pipelineRuns.$inferSelect;
export type IdeaEvidence = typeof ideaEvidence.$inferSelect;
export type Purchase = typeof purchases.$inferSelect;
