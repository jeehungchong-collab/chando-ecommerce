import {
  index,
  integer,
  primaryKey,
  real,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";

export const lazadaSessions = sqliteTable("lazada_sessions", {
  sessionKey: text("session_key").primaryKey(),
  payload: text("payload").notNull(),
  fingerprint: text("fingerprint").notNull(),
  revision: integer("revision").notNull(),
});

export const lazadaImports = sqliteTable("lazada_imports", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  sessionKey: text("session_key").notNull(),
  payload: text("payload").notNull(),
  status: text("status").notNull(),
  uploadedBy: text("uploaded_by").notNull(),
  createdAt: text("created_at").notNull(),
  r2Key: text("r2_key"),
});

export const campaigns = sqliteTable(
  "campaigns",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    slug: text("slug").notNull(),
    startDate: text("start_date").notNull(),
    createdAt: text("created_at").notNull(),
  },
  (table) => [uniqueIndex("campaigns_slug_idx").on(table.slug)],
);

export const uploads = sqliteTable(
  "uploads",
  {
    id: text("id").primaryKey(),
    campaignId: text("campaign_id").notNull(),
    sessionKey: text("session_key").notNull(),
    sessionStart: text("session_start").notNull(),
    sessionEnd: text("session_end").notNull(),
    sourceFile: text("source_file").notNull(),
    r2Key: text("r2_key"),
    revision: integer("revision").notNull(),
    active: integer("active", { mode: "boolean" }).notNull(),
    uploadedBy: text("uploaded_by").notNull(),
    createdAt: text("created_at").notNull(),
  },
  (table) => [
    uniqueIndex("uploads_session_revision_idx").on(
      table.campaignId,
      table.sessionKey,
      table.revision,
    ),
    index("uploads_active_idx").on(table.campaignId, table.active),
  ],
);

export const listingMetrics = sqliteTable(
  "listing_metrics",
  {
    id: text("id").primaryKey(),
    uploadId: text("upload_id").notNull(),
    itemId: text("item_id").notNull(),
    listingTitle: text("listing_title").notNull(),
    sales: real("sales").notNull(),
    orders: integer("orders").notNull(),
    units: integer("units").notNull(),
    reminderClicks: integer("reminder_clicks").notNull(),
    impressions: integer("impressions").notNull(),
    clicks: integer("clicks").notNull(),
  },
  (table) => [index("listing_metrics_upload_idx").on(table.uploadId)],
);

export const variationMetrics = sqliteTable(
  "variation_metrics",
  {
    id: text("id").primaryKey(),
    uploadId: text("upload_id").notNull(),
    itemId: text("item_id").notNull(),
    listingTitle: text("listing_title").notNull(),
    variationId: text("variation_id").notNull(),
    variationTitle: text("variation_title").notNull(),
    sku: text("sku").notNull(),
    sales: real("sales").notNull(),
    orders: integer("orders").notNull(),
    units: integer("units").notNull(),
  },
  (table) => [index("variation_metrics_upload_idx").on(table.uploadId)],
);

export const adminUsers = sqliteTable(
  "admin_users",
  {
    email: text("email").notNull(),
    role: text("role").notNull(),
    createdAt: text("created_at").notNull(),
  },
  (table) => [primaryKey({ columns: [table.email] })],
);

export const listingCompletionOverrides = sqliteTable(
  "listing_completion_overrides",
  {
    itemId: text("item_id").primaryKey(),
    listingTitle: text("listing_title").notNull(),
    completed: integer("completed", { mode: "boolean" }).notNull(),
    completedBy: text("completed_by"),
    completedAt: text("completed_at"),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [
    index("listing_completion_overrides_completed_idx").on(table.completed),
  ],
);

export const restartCampaigns = sqliteTable(
  "restart_campaigns",
  {
    campaignId: text("campaign_id").primaryKey(),
    sourceCampaignId: text("source_campaign_id").notNull(),
    sourceCycle: integer("source_cycle").notNull(),
    createdBy: text("created_by").notNull(),
    createdAt: text("created_at").notNull(),
  },
  (table) => [
    index("restart_campaigns_source_idx").on(table.sourceCampaignId),
  ],
);

export const restartItems = sqliteTable(
  "restart_items",
  {
    campaignId: text("campaign_id").notNull(),
    itemId: text("item_id").notNull(),
    listingTitle: text("listing_title").notNull(),
    baselineUploadId: text("baseline_upload_id").notNull(),
    baselineSessionStart: text("baseline_session_start").notNull(),
    baselineSessionEnd: text("baseline_session_end").notNull(),
    baselineSales: real("baseline_sales").notNull(),
    baselineOrders: integer("baseline_orders").notNull(),
    baselineUnits: integer("baseline_units").notNull(),
    baselineReminderClicks: integer("baseline_reminder_clicks").notNull(),
    baselineImpressions: integer("baseline_impressions").notNull(),
    baselineClicks: integer("baseline_clicks").notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.campaignId, table.itemId] }),
    index("restart_items_baseline_upload_idx").on(table.baselineUploadId),
  ],
);

export const reportUploads = sqliteTable(
  "report_uploads",
  {
    id: text("id").primaryKey(),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    uploadedByEmail: text("uploaded_by_email").notNull(),
    fileNamesJson: text("file_names_json").notNull(),
    fileCount: integer("file_count").notNull(),
    rowCount: integer("row_count").notNull(),
    dateRange: text("date_range").notNull(),
    totalGmv: real("total_gmv").notNull(),
    totalOrders: integer("total_orders").notNull(),
    totalViews: integer("total_views").notNull(),
    unclearRows: integer("unclear_rows").notNull(),
    reportJson: text("report_json").notNull(),
  },
  (table) => [index("idx_report_uploads_created_at").on(table.createdAt)],
);

export const uploadedFiles = sqliteTable(
  "uploaded_files",
  {
    id: text("id").primaryKey(),
    reportId: text("report_id")
      .notNull()
      .references(() => reportUploads.id),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    fileName: text("file_name").notNull(),
    contentType: text("content_type").notNull(),
    sizeBytes: integer("size_bytes").notNull(),
    r2Key: text("r2_key").notNull(),
  },
  (table) => [index("idx_uploaded_files_report_id").on(table.reportId)],
);
