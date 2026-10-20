import { createInsertSchema } from "drizzle-zod";
import { jsonb, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { z } from "zod/v4";

export const reportStatusValues = [
  "submitted",
  "reviewing",
  "assigned",
  "resolved",
] as const;

export const reportCategoryValues = [
  "delay",
  "cleanliness",
  "safety",
  "accessibility",
  "staff",
  "vehicle",
  "other",
] as const;

export const reportsTable = pgTable("transit_reports", {
  id: text("id").primaryKey(),
  reference: text("reference").notNull().unique(),
  title: text("title").notNull(),
  description: text("description").notNull(),
  category: text("category").notNull(),
  route: text("route").notNull(),
  location: text("location").notNull(),
  happenedAt: text("happened_at").notNull(),
  status: text("status").notNull().default("submitted"),
  reporterName: text("reporter_name").notNull(),
  reporterContact: text("reporter_contact"),
  attachments: jsonb("attachments")
    .$type<
      Array<{
        id: string;
        kind: "image" | "audio";
        name: string;
        mimeType: string;
        dataUrl: string | null;
      }>
    >()
    .notNull()
    .default([]),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const reportActivityTable = pgTable("transit_report_activity", {
  id: text("id").primaryKey(),
  reportId: text("report_id").notNull(),
  reference: text("reference").notNull(),
  action: text("action").notNull(),
  detail: text("detail").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertReportSchema = createInsertSchema(reportsTable).omit({
  createdAt: true,
  updatedAt: true,
});

export const reportStatusSchema = z.enum(reportStatusValues);
export const reportCategorySchema = z.enum(reportCategoryValues);

export type Report = typeof reportsTable.$inferSelect;
export type ReportActivity = typeof reportActivityTable.$inferSelect;
export type InsertReport = z.infer<typeof insertReportSchema>;