import { z } from "zod";
import { RankTrackingService } from "@/server/features/rank-tracking/services/RankTrackingService";
import { mcpResponse } from "@/server/mcp/formatters";
import { buildProjectMeta } from "@/server/mcp/context";
import {
  looseObjectOutputSchema,
  optionalMetaOutputSchema,
} from "@/server/mcp/output-schemas";
import { withMcpProjectAuth } from "@/server/mcp/project-auth";
import { projectIdSchema } from "@/server/mcp/schemas";

const inputSchema = {
  projectId: projectIdSchema,
  trackerId: z
    .string()
    .uuid()
    .describe(
      "Rank tracker config ID (trackerId from create_rank_tracker or get_rank_tracker).",
    ),
} as const;

type Args = z.infer<z.ZodObject<typeof inputSchema>>;

function formatRunText(run: { id: string; status: string; keywordsTotal: number; keywordsChecked: number; errorMessage: string | null; startedAt: string | null; completedAt: string | null; maybeStale: boolean; staleReason: string | null } | null): string {
  if (!run) return "No rank check run found for this tracker.";
  const lines = [
    `Latest run ${run.id}:`,
    `Status: ${run.status}`,
    `Keywords: ${run.keywordsChecked} of ${run.keywordsTotal} checked`,
    `Started: ${run.startedAt ?? "—"}`,
    `Completed: ${run.completedAt ?? "—"}`,
  ];
  if (run.maybeStale) lines.push(`Maybe stale: ${run.staleReason ?? "workflow result pending reconciliation"}`);
  if (run.errorMessage) lines.push(`Error: ${run.errorMessage}`);
  return lines.join("\n");
}

export const getRankTrackingRunTool = {
  name: "get_latest_rank_run",
  config: {
    title: "Get latest rank run",
    description:
      "Read-only status of the most recent rank check run for a tracker: status (pending, running, completed, failed), keywords checked vs total, start/complete times, and any error. Returns null when the tracker has never run. Uses no credits. Use run_rank_tracker to start a check; use get_rank_tracker to read the keyword positions a completed run saved.",

    inputSchema,
    outputSchema: z
      .object({
        run: looseObjectOutputSchema.nullable(),
        ...optionalMetaOutputSchema,
      })
      .passthrough(),
    annotations: {
      readOnlyHint: true,
      openWorldHint: false,
      destructiveHint: false,
    },
  },
  handler: withMcpProjectAuth(async (args: Args, context) => {
    const run = await RankTrackingService.getLatestRun(
      args.trackerId,
      args.projectId,
    );
    const text = formatRunText(run);
    return mcpResponse({
      text,
      meta: buildProjectMeta(
        context,
        args.projectId,
        `/p/${args.projectId}/rank-tracking/${args.trackerId}`,
      ),
      structuredContent: {
        run,
      },
    });
  }),
};
