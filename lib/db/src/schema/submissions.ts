import { createInsertSchema } from "drizzle-zod";
import { boolean, jsonb, pgEnum, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { z } from "zod/v4";

export const submissionLanguages = ["vi", "en", "es", "pa"] as const;
export const submissionDataSources = ["public dataset", "real document", "synthetic data"] as const;

export const submissionDataSourceEnum = pgEnum("submission_data_source", submissionDataSources);

export const submissionsTable = pgTable("rider_submissions", {
  id: text("id").primaryKey(),
  reference: text("reference").notNull().unique(),
  description: text("description").notNull(),
  language: text("language").notNull(),
  imageName: text("image_name"),
  assistantResponse: text("assistant_response").notNull(),
  staffResponseSent: boolean("staff_response_sent").notNull().default(false),
  dataSource: submissionDataSourceEnum("data_source").notNull().default("real document"),
  issueCategory: text("issue_category").notNull().default("other"),
  route: text("route").notNull().default(""),
  stop: text("stop").notNull().default(""),
  routeId: text("route_id"),
  stopId: text("stop_id"),
  operatorId: text("operator_id"),
  routeName: text("route_name"),
  stopName: text("stop_name"),
  inputIsSynthetic: boolean("input_is_synthetic").notNull().default(false),
  inputSource: text("input_source").notNull().default("legacy input; classification not recorded"),
  dataSourcesUsed: text("data_sources_used").array().notNull().default([]),
  sfBay511DataUsed: boolean("511_data_used").notNull().default(false),
  vtaOpenDataUsed: boolean("vta_open_data_used").notNull().default(false),
  liveArrivalSnapshot: jsonb("live_arrival_snapshot").$type<Record<string, unknown>>(),
  serviceAlertSnapshot: jsonb("service_alert_snapshot").$type<Record<string, unknown>>(),
  vtaOpenDataSnapshot: jsonb("vta_open_data_snapshot").$type<Record<string, unknown>>(),
  vtaOpenDataDatasetTitle: text("vta_open_data_dataset_title"),
  vtaOpenDataPublisher: text("vta_open_data_publisher"),
  vtaOpenDataSourceUrl: text("vta_open_data_source_url"),
  vtaOpenDataResourceUrl: text("vta_open_data_resource_url"),
  sourceRetrievedAt: timestamp("source_retrieved_at", { withTimezone: true }),
  transitNotes: text("transit_notes").array().notNull().default([]),
  responseKind: text("response_kind").notNull().default("legacy_fixed"),
  submittedAt: timestamp("submitted_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertSubmissionSchema = createInsertSchema(submissionsTable).omit({
  id: true,
  reference: true,
  assistantResponse: true,
  staffResponseSent: true,
  submittedAt: true,
});

export type Submission = typeof submissionsTable.$inferSelect;
export type InsertSubmission = z.infer<typeof insertSubmissionSchema>;