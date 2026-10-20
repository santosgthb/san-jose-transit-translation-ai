import { Router, type IRouter } from "express";
import { and, desc, eq, ilike, or } from "drizzle-orm";
import {
  CreateReportBody,
  CreateReportResponse,
  GetRecentReportActivityResponse,
  GetReportParams,
  GetReportResponse,
  GetReportStatsResponse,
  ListReportsQueryParams,
  ListReportsResponse,
  UpdateReportStatusBody,
  UpdateReportStatusParams,
  UpdateReportStatusResponse,
} from "@workspace/api-zod";
import { db } from "@workspace/db";
import {
  reportActivityTable,
  reportCategoryValues,
  reportsTable,
  reportStatusValues,
} from "@workspace/db/schema";

const router: IRouter = Router();

const iso = (value: Date | string) =>
  value instanceof Date ? value.toISOString() : new Date(value).toISOString();

const toReport = (report: typeof reportsTable.$inferSelect) => ({
  ...report,
  category: report.category as (typeof reportCategoryValues)[number],
  status: report.status as (typeof reportStatusValues)[number],
  createdAt: iso(report.createdAt),
  updatedAt: iso(report.updatedAt),
});

const activityId = () => `activity-${crypto.randomUUID()}`;

let seedPromise: Promise<void> | undefined;
const ensureSeeded = () => {
  seedPromise ??= (async () => {
    const existing = await db.select({ id: reportsTable.id }).from(reportsTable).limit(1);
    if (existing.length > 0) return;

    const now = new Date();
    const firstId = "report-demo-001";
    const secondId = "report-demo-002";
    await db.insert(reportsTable).values([
      {
        id: firstId,
        reference: "TR-2026-0142",
        title: "Bus 24 arrived with no ramp",
        description:
          "The driver stopped at Market & 5th, but the wheelchair ramp did not deploy. I had to wait for the next bus.",
        category: "accessibility",
        route: "24",
        location: "Market & 5th",
        happenedAt: "Today, 8:42 AM",
        status: "reviewing",
        reporterName: "Maya Chen",
        reporterContact: "maya@example.com",
        attachments: [],
        createdAt: new Date(now.getTime() - 1000 * 60 * 38),
        updatedAt: new Date(now.getTime() - 1000 * 60 * 18),
      },
      {
        id: secondId,
        reference: "TR-2026-0141",
        title: "Missed connection at North Station",
        description:
          "The 6:10 train left two minutes early and several riders were left on the platform.",
        category: "delay",
        route: "Green line",
        location: "North Station",
        happenedAt: "Yesterday, 6:10 PM",
        status: "assigned",
        reporterName: "Jordan Ellis",
        reporterContact: null,
        attachments: [],
        createdAt: new Date(now.getTime() - 1000 * 60 * 60 * 17),
        updatedAt: new Date(now.getTime() - 1000 * 60 * 60 * 12),
      },
    ]);

    await db.insert(reportActivityTable).values([
      {
        id: activityId(),
        reportId: firstId,
        reference: "TR-2026-0142",
        action: "Report received",
        detail: "New accessibility report submitted by Maya Chen",
        createdAt: new Date(now.getTime() - 1000 * 60 * 38),
      },
      {
        id: activityId(),
        reportId: secondId,
        reference: "TR-2026-0141",
        action: "Assigned to operations",
        detail: "Green line operations team is reviewing the departure",
        createdAt: new Date(now.getTime() - 1000 * 60 * 60 * 12),
      },
    ]);
  })().catch((error) => {
    seedPromise = undefined;
    throw error;
  });
  return seedPromise;
};

router.get("/reports", async (req, res) => {
  try {
    await ensureSeeded();
    const { status, search } = ListReportsQueryParams.parse(req.query);
    const filters = [];

    if (status) filters.push(eq(reportsTable.status, status));
    if (search) {
      filters.push(
        or(
          ilike(reportsTable.title, `%${search}%`),
          ilike(reportsTable.reference, `%${search}%`),
          ilike(reportsTable.location, `%${search}%`),
        ),
      );
    }

    const rows = await db
      .select()
      .from(reportsTable)
      .where(filters.length ? and(...filters) : undefined)
      .orderBy(desc(reportsTable.createdAt));
    res.json(ListReportsResponse.parse(rows.map(toReport)));
  } catch (error) {
    req.log.error({ err: error }, "Failed to list transit reports");
    res.status(400).json({ error: "Unable to load reports" });
  }
});

router.post("/reports", async (req, res) => {
  try {
    const input = CreateReportBody.parse(req.body);
    const now = new Date();
    const id = `report-${crypto.randomUUID()}`;
    const reference = `TR-${now.getUTCFullYear()}-${String(Math.floor(Math.random() * 9000) + 1000)}`;
    const report = {
      ...input,
      id,
      reference,
      status: "submitted" as const,
      reporterContact: input.reporterContact ?? null,
      createdAt: now,
      updatedAt: now,
    };

    await db.insert(reportsTable).values(report);
    await db.insert(reportActivityTable).values({
      id: activityId(),
      reportId: id,
      reference,
      action: "Report received",
      detail: `New ${input.category} report submitted by ${input.reporterName}`,
      createdAt: now,
    });
    res.status(201).json(CreateReportResponse.parse(toReport(report)));
  } catch (error) {
    req.log.error({ err: error }, "Failed to create transit report");
    res.status(400).json({ error: "Unable to submit report" });
  }
});

router.get("/reports/stats", async (req, res) => {
  try {
    await ensureSeeded();
    const rows = await db.select().from(reportsTable);
    const weekAgo = Date.now() - 1000 * 60 * 60 * 24 * 7;
    const counts = Object.fromEntries(reportStatusValues.map((status) => [status, 0]));
    rows.forEach((report) => {
      if (report.status in counts) counts[report.status as keyof typeof counts] += 1;
    });
    const response = {
      total: rows.length,
      submitted: counts.submitted,
      reviewing: counts.reviewing,
      assigned: counts.assigned,
      resolved: counts.resolved,
      thisWeek: rows.filter((report) => report.createdAt.getTime() >= weekAgo).length,
      averageResponseHours: 2.4,
    };
    res.json(GetReportStatsResponse.parse(response));
  } catch (error) {
    req.log.error({ err: error }, "Failed to load report stats");
    res.status(400).json({ error: "Unable to load report stats" });
  }
});

router.get("/reports/recent", async (req, res) => {
  try {
    await ensureSeeded();
    const rows = await db
      .select()
      .from(reportActivityTable)
      .orderBy(desc(reportActivityTable.createdAt))
      .limit(12);
    res.json(
      GetRecentReportActivityResponse.parse(
        rows.map((activity) => ({ ...activity, createdAt: iso(activity.createdAt) })),
      ),
    );
  } catch (error) {
    req.log.error({ err: error }, "Failed to load report activity");
    res.status(400).json({ error: "Unable to load report activity" });
  }
});

router.get("/reports/:id", async (req, res) => {
  try {
    await ensureSeeded();
    const { id } = GetReportParams.parse(req.params);
    const [report] = await db.select().from(reportsTable).where(eq(reportsTable.id, id));
    if (!report) {
      res.status(404).json({ error: "Report not found" });
      return;
    }
    res.json(GetReportResponse.parse(toReport(report)));
  } catch (error) {
    req.log.error({ err: error }, "Failed to load transit report");
    res.status(400).json({ error: "Unable to load report" });
  }
});

router.patch("/reports/:id", async (req, res) => {
  try {
    const { id } = UpdateReportStatusParams.parse(req.params);
    const { status } = UpdateReportStatusBody.parse(req.body);
    const [current] = await db.select().from(reportsTable).where(eq(reportsTable.id, id));
    if (!current) {
      res.status(404).json({ error: "Report not found" });
      return;
    }
    const updatedAt = new Date();
    const [updated] = await db
      .update(reportsTable)
      .set({ status, updatedAt })
      .where(eq(reportsTable.id, id))
      .returning();
    await db.insert(reportActivityTable).values({
      id: activityId(),
      reportId: id,
      reference: current.reference,
      action: `Status changed to ${status}`,
      detail: `${current.reference} moved from ${current.status} to ${status}`,
      createdAt: updatedAt,
    });
    res.json(UpdateReportStatusResponse.parse(toReport(updated)));
  } catch (error) {
    req.log.error({ err: error }, "Failed to update report status");
    res.status(400).json({ error: "Unable to update report" });
  }
});

export default router;