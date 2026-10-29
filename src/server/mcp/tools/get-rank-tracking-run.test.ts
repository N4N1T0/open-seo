import { beforeEach, describe, expect, it, vi } from "vitest";
import { AppError } from "@/server/lib/errors";
import { getRankTrackingRunTool } from "./get-rank-tracking-run";
import { makeToolContext, textContent } from "./tool-test-support";

const mocks = vi.hoisted(() => ({
  getProjectForOrganization: vi.fn(),
  getLatestRun: vi.fn(),
  captureServerEvent: vi.fn(),
  waitUntil: vi.fn(),
}));

vi.mock("cloudflare:workers", () => ({
  env: {},
  waitUntil: mocks.waitUntil,
}));
vi.mock("@/server/features/projects/services/ProjectService", () => ({
  ProjectService: {
    getProjectForOrganization: mocks.getProjectForOrganization,
  },
}));
vi.mock("@/server/features/rank-tracking/services/RankTrackingService", () => ({
  RankTrackingService: {
    getLatestRun: mocks.getLatestRun,
  },
}));
vi.mock("@/server/lib/posthog", () => ({
  captureServerEvent: mocks.captureServerEvent,
}));

const projectId = "11111111-1111-4111-8111-111111111111";
const trackerId = "22222222-2222-4222-8222-222222222222";

const toolContext = makeToolContext();

describe("get_latest_rank_run MCP tool", () => {
  beforeEach(() => {
    mocks.getProjectForOrganization.mockResolvedValue({
      id: projectId,
      domain: "openseo.so",
      locationCode: 2840,
      languageCode: "en",
    });
    mocks.captureServerEvent.mockResolvedValue(undefined);
  });

  it("returns the latest run status and keyword progress", async () => {
    mocks.getLatestRun.mockResolvedValue({
      id: "run_1",
      status: "completed",
      keywordsTotal: 10,
      keywordsChecked: 10,
      isSubsetRun: false,
      errorMessage: null,
      startedAt: "2026-10-28T09:00:00Z",
      completedAt: "2026-10-28T09:15:00Z",
      maybeStale: false,
      staleReason: null,
    });

    const result = await getRankTrackingRunTool.handler(
      { projectId, trackerId },
      toolContext,
    );

    expect(mocks.getLatestRun).toHaveBeenCalledWith(trackerId, projectId);
    expect(textContent(result)).toContain("Status: completed");
    expect(textContent(result)).toContain("Keywords: 10 of 10 checked");
    expect(result.structuredContent?.run).toMatchObject({
      id: "run_1",
      status: "completed",
    });
  });

  it("returns null when the tracker has never run", async () => {
    mocks.getLatestRun.mockResolvedValue(null);

    const result = await getRankTrackingRunTool.handler(
      { projectId, trackerId },
      toolContext,
    );

    expect(textContent(result)).toContain("No rank check run found");
    expect(result.structuredContent?.run).toBeNull();
  });

  it("reports a failed run with its error", async () => {
    mocks.getLatestRun.mockResolvedValue({
      id: "run_2",
      status: "failed",
      keywordsTotal: 5,
      keywordsChecked: 2,
      isSubsetRun: true,
      errorMessage: "All SERPs timed out",
      startedAt: "2026-10-28T09:00:00Z",
      completedAt: "2026-10-28T09:05:00Z",
      maybeStale: false,
      staleReason: null,
    });

    const result = await getRankTrackingRunTool.handler(
      { projectId, trackerId },
      toolContext,
    );

    expect(textContent(result)).toContain("Status: failed");
    expect(textContent(result)).toContain("All SERPs timed out");
    expect(result.structuredContent?.run?.status).toBe("failed");
  });

  it("propagates a NOT_FOUND error when the config does not exist", async () => {
    mocks.getLatestRun.mockRejectedValue(
      new AppError("NOT_FOUND", "Rank tracking config not found"),
    );

    await expect(
      getRankTrackingRunTool.handler({ projectId, trackerId }, toolContext),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});
