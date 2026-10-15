import { env } from "cloudflare:workers";
import {
  addDaysToTimestamp,
  buildPerformance,
  buildRestartPerformance,
  getCycleWindows,
  type ListingRow,
  type RestartItemRow,
  type VariationRow,
} from "./calculations";
import type {
  CampaignSummary,
  CompletionListing,
  DashboardData,
  ParsedFlashSaleFile,
  RestartCandidate,
  RestartPreview,
  UploadSummary,
} from "./types";

type RuntimeEnv = {
  DB: D1Database;
  UPLOADS?: R2Bucket;
  ADMIN_EMAILS?: string;
};

function runtime(): RuntimeEnv {
  return env as unknown as RuntimeEnv;
}

let databaseReady = false;

async function runInChunks(statements: D1PreparedStatement[], size = 50) {
  const db = runtime().DB;
  for (let index = 0; index < statements.length; index += size) {
    await db.batch(statements.slice(index, index + size));
  }
}

async function seedIfEmpty() {
  await runtime().DB.prepare(
    "INSERT OR IGNORE INTO campaigns (id, name, slug, start_date, created_at) VALUES (?, ?, ?, ?, ?)",
  ).bind("team-shopee", "Shopee Team Tracker", "team-shopee", "2026-07-24", new Date().toISOString()).run();
}

export async function ensureDatabase() {
  if (databaseReady) return;
  await seedIfEmpty();
  databaseReady = true;
}

export async function listCampaigns(): Promise<CampaignSummary[]> {
  await ensureDatabase();
  const result = await runtime().DB.prepare(
    `SELECT c.id, c.name, c.slug, c.start_date AS startDate,
            CASE WHEN rc.campaign_id IS NULL THEN 'standard' ELSE 'restart' END AS mode,
            rc.source_campaign_id AS sourceCampaignId
       FROM campaigns c
       LEFT JOIN restart_campaigns rc ON rc.campaign_id = c.id
      ORDER BY c.start_date DESC, c.created_at DESC`,
  ).all<CampaignSummary>();
  return result.results;
}

export async function getDashboard(
  campaignSlug?: string,
): Promise<DashboardData> {
  await ensureDatabase();
  const db = runtime().DB;
  const campaigns = await listCampaigns();
  const campaign =
    campaigns.find((candidate) => candidate.slug === campaignSlug) ??
    campaigns[0];
  if (!campaign) throw new Error("No campaign is available.");

  const uploadResult = await db
    .prepare(
      `SELECT id, source_file AS sourceFile, session_start AS sessionStart,
              session_end AS sessionEnd, revision, active, created_at AS createdAt,
              uploaded_by AS uploadedBy
         FROM uploads
        WHERE campaign_id = ?
        ORDER BY session_start DESC, revision DESC`,
    )
    .bind(campaign.id)
    .all<UploadSummary & { active: number }>();

  let performance;
  if (campaign.mode === "restart") {
    const [restartItemResult, baselineVariationResult, listingResult, variationResult] =
      await Promise.all([
        db
          .prepare(
            `SELECT item_id, listing_title, baseline_upload_id,
                    baseline_session_start, baseline_session_end,
                    baseline_sales, baseline_orders, baseline_units,
                    baseline_reminder_clicks, baseline_impressions, baseline_clicks
               FROM restart_items
              WHERE campaign_id = ?
              ORDER BY listing_title`,
          )
          .bind(campaign.id)
          .all<RestartItemRow>(),
        db
          .prepare(
            `SELECT vm.item_id, vm.listing_title, vm.variation_id, vm.variation_title,
                    vm.sku, u.session_start, vm.sales, vm.orders, vm.units
               FROM variation_metrics vm
               JOIN uploads u ON u.id = vm.upload_id
               JOIN restart_items ri
                 ON ri.baseline_upload_id = vm.upload_id
                AND ri.item_id = vm.item_id
              WHERE ri.campaign_id = ?`,
          )
          .bind(campaign.id)
          .all<VariationRow>(),
        db
          .prepare(
            `SELECT lm.item_id, lm.listing_title, u.session_start,
                    lm.sales, lm.orders, lm.units, lm.reminder_clicks,
                    lm.impressions, lm.clicks
               FROM listing_metrics lm
               JOIN uploads u ON u.id = lm.upload_id
              WHERE u.campaign_id = ? AND u.active = 1`,
          )
          .bind(campaign.id)
          .all<ListingRow>(),
        db
          .prepare(
            `SELECT vm.item_id, vm.listing_title, vm.variation_id, vm.variation_title,
                    vm.sku, u.session_start, vm.sales, vm.orders, vm.units
               FROM variation_metrics vm
               JOIN uploads u ON u.id = vm.upload_id
              WHERE u.campaign_id = ? AND u.active = 1`,
          )
          .bind(campaign.id)
          .all<VariationRow>(),
      ]);
    performance = buildRestartPerformance(
      restartItemResult.results,
      baselineVariationResult.results,
      listingResult.results,
      variationResult.results,
    );
  } else {
    const [listingResult, variationResult] = await Promise.all([
      db
        .prepare(
          `SELECT lm.item_id, lm.listing_title, u.session_start,
                  lm.sales, lm.orders, lm.units, lm.reminder_clicks, lm.impressions, lm.clicks
             FROM listing_metrics lm
             JOIN uploads u ON u.id = lm.upload_id
            WHERE u.campaign_id = ? AND u.active = 1`,
        )
        .bind(campaign.id)
        .all<ListingRow>(),
      db
        .prepare(
          `SELECT vm.item_id, vm.listing_title, vm.variation_id, vm.variation_title, vm.sku,
                  u.session_start, vm.sales, vm.orders, vm.units
             FROM variation_metrics vm
             JOIN uploads u ON u.id = vm.upload_id
            WHERE u.campaign_id = ? AND u.active = 1`,
        )
        .bind(campaign.id)
        .all<VariationRow>(),
    ]);
    performance = buildPerformance(
      campaign.startDate,
      listingResult.results,
      variationResult.results,
    );
  }

  return {
    campaign,
    campaigns,
    ...performance,
    uploads: uploadResult.results.map((upload) => ({
      ...upload,
      active: Boolean(upload.active),
    })),
  };
}

export async function getCombinedDashboard(): Promise<DashboardData> {
  await ensureDatabase();
  const db = runtime().DB;
  const campaigns = await listCampaigns();
  const campaign: CampaignSummary = {
    id: "combined",
    name: "Combined Flash Sale Cycle Tracker",
    slug: "combined",
    startDate: "2026-07-24",
    mode: "standard",
    sourceCampaignId: null,
  };

  const uploadResult = await db
    .prepare(
      `SELECT u.id, u.session_key AS sessionKey, u.source_file AS sourceFile,
              u.session_start AS sessionStart, u.session_end AS sessionEnd,
              u.revision, u.active, u.created_at AS createdAt,
              u.uploaded_by AS uploadedBy
         FROM uploads u
         JOIN campaigns c ON c.id = u.campaign_id
         LEFT JOIN restart_campaigns rc ON rc.campaign_id = c.id
        WHERE u.active = 1 AND rc.campaign_id IS NULL
        ORDER BY u.session_start DESC, u.created_at DESC, u.revision DESC`,
    )
    .all<UploadSummary & { active: number; sessionKey: string }>();
  const selectedUploads = new Map<
    string,
    UploadSummary & { active: number; sessionKey: string }
  >();
  for (const upload of uploadResult.results) {
    const existing = selectedUploads.get(upload.sessionKey);
    if (
      !existing ||
      upload.createdAt.localeCompare(existing.createdAt) > 0 ||
      (upload.createdAt === existing.createdAt && upload.revision > existing.revision)
    ) {
      selectedUploads.set(upload.sessionKey, upload);
    }
  }
  const selectedUploadIds = new Set(
    [...selectedUploads.values()].map((upload) => upload.id),
  );

  const [listingResult, variationResult] = await Promise.all([
    db
      .prepare(
        `SELECT lm.upload_id, lm.item_id, lm.listing_title, u.session_start,
                lm.sales, lm.orders, lm.units, lm.reminder_clicks,
                lm.impressions, lm.clicks
           FROM listing_metrics lm
           JOIN uploads u ON u.id = lm.upload_id
           JOIN campaigns c ON c.id = u.campaign_id
           LEFT JOIN restart_campaigns rc ON rc.campaign_id = c.id
          WHERE u.active = 1 AND rc.campaign_id IS NULL`,
      )
      .all<ListingRow & { upload_id: string }>(),
    db
      .prepare(
        `SELECT vm.upload_id, vm.item_id, vm.listing_title, vm.variation_id,
                vm.variation_title, vm.sku, u.session_start, vm.sales,
                vm.orders, vm.units
           FROM variation_metrics vm
           JOIN uploads u ON u.id = vm.upload_id
           JOIN campaigns c ON c.id = u.campaign_id
           LEFT JOIN restart_campaigns rc ON rc.campaign_id = c.id
          WHERE u.active = 1 AND rc.campaign_id IS NULL`,
      )
      .all<VariationRow & { upload_id: string }>(),
  ]);
  const listingRows = listingResult.results.filter((row) =>
    selectedUploadIds.has(row.upload_id),
  );
  const variationRows = variationResult.results.filter((row) =>
    selectedUploadIds.has(row.upload_id),
  );
  const performance = buildPerformance(
    campaign.startDate,
    listingRows,
    variationRows,
  );
  const completionResult = await db
    .prepare(
      `SELECT item_id AS itemId, completed, completed_by AS completedBy,
              completed_at AS completedAt
         FROM listing_completion_overrides
        WHERE completed = 1`,
    )
    .all<{
      itemId: string;
      completed: number;
      completedBy: string | null;
      completedAt: string | null;
    }>();
  const completions = new Map(
    completionResult.results.map((row) => [row.itemId, row]),
  );
  const listings = performance.listings
    .map((listing) => {
      const completion = completions.get(listing.itemId);
      return {
        ...listing,
        doneComplete: Boolean(completion?.completed),
        completedBy: completion?.completedBy ?? null,
        completedAt: completion?.completedAt ?? null,
      };
    })
    .sort(
      (a, b) =>
        Number(a.doneComplete) - Number(b.doneComplete) ||
        b.total.orders - a.total.orders ||
        a.listingTitle.localeCompare(b.listingTitle),
    );

  return {
    campaign,
    campaigns,
    cycles: performance.cycles,
    listings,
    totals: performance.totals,
    uploads: [...selectedUploads.values()].map((upload) => ({
      id: upload.id,
      sourceFile: upload.sourceFile,
      sessionStart: upload.sessionStart,
      sessionEnd: upload.sessionEnd,
      revision: upload.revision,
      active: Boolean(upload.active),
      createdAt: upload.createdAt,
      uploadedBy: upload.uploadedBy,
    })),
  };
}

export async function listCompletionListings(): Promise<CompletionListing[]> {
  const dashboard = await getCombinedDashboard();
  return dashboard.listings.map((listing) => ({
    itemId: listing.itemId,
    listingTitle: listing.listingTitle,
    doneComplete: Boolean(listing.doneComplete),
    successStreak: listing.successStreak,
    longestSuccessStreak: listing.longestSuccessStreak,
    readyToComplete: listing.readyToComplete,
    activeBaselineCycle: listing.activeBaselineCycle,
    activeBaselineOrders: listing.activeBaselineOrders,
    selectedPathStatus: listing.selectedPathStatus,
    totalOrders: listing.total.orders,
    totalSales: listing.total.sales,
  }));
}

export async function setListingDoneComplete(input: {
  itemId: string;
  listingTitle: string;
  completed: boolean;
  updatedBy: string;
}) {
  await ensureDatabase();
  const itemId = input.itemId.trim();
  const listingTitle = input.listingTitle.trim();
  if (!itemId) throw new Error("Choose a valid Item ID.");
  if (!listingTitle) throw new Error("Listing title is required.");
  const now = new Date().toISOString();
  await runtime().DB.prepare(
    `INSERT INTO listing_completion_overrides
      (item_id, listing_title, completed, completed_by, completed_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(item_id) DO UPDATE SET
       listing_title = excluded.listing_title,
       completed = excluded.completed,
       completed_by = excluded.completed_by,
       completed_at = excluded.completed_at,
       updated_at = excluded.updated_at`,
  )
    .bind(
      itemId,
      listingTitle,
      input.completed ? 1 : 0,
      input.completed ? input.updatedBy : null,
      input.completed ? now : null,
      now,
    )
    .run();
}

export async function createCampaign(input: {
  name: string;
  startDate: string;
}): Promise<CampaignSummary> {
  await ensureDatabase();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.startDate)) {
    throw new Error("Choose a valid Cycle 1 start date.");
  }
  const name = input.name.trim();
  if (name.length < 3 || name.length > 80) {
    throw new Error("Campaign name must be between 3 and 80 characters.");
  }
  const baseSlug =
    name
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 40) || "flash-sale";
  const slug = `${baseSlug}-${input.startDate.replaceAll("-", "")}`;
  const campaign = {
    id: crypto.randomUUID(),
    name,
    slug,
    startDate: input.startDate,
    mode: "standard" as const,
    sourceCampaignId: null,
  };
  await runtime().DB.prepare(
    "INSERT INTO campaigns (id, name, slug, start_date, created_at) VALUES (?, ?, ?, ?, ?)",
  )
    .bind(
      campaign.id,
      campaign.name,
      campaign.slug,
      campaign.startDate,
      new Date().toISOString(),
    )
    .run();
  return campaign;
}

async function baselineForListing(
  campaignId: string,
  itemId: string,
  beforeTimestamp: string,
) {
  return runtime().DB.prepare(
    `SELECT u.id AS baselineUploadId, u.session_start AS baselineSessionStart,
            u.session_end AS baselineSessionEnd, lm.listing_title AS listingTitle,
            lm.sales AS baselineSales, lm.orders AS baselineOrders,
            lm.units AS baselineUnits, lm.reminder_clicks AS baselineReminderClicks,
            lm.impressions AS baselineImpressions, lm.clicks AS baselineClicks
       FROM listing_metrics lm
       JOIN uploads u ON u.id = lm.upload_id
      WHERE u.campaign_id = ? AND u.active = 1
        AND lm.item_id = ? AND lm.orders > 0
        AND u.session_end <= ?
      ORDER BY u.session_start DESC
      LIMIT 1`,
  )
    .bind(campaignId, itemId, beforeTimestamp)
    .first<{
      baselineUploadId: string;
      baselineSessionStart: string;
      baselineSessionEnd: string;
      listingTitle: string;
      baselineSales: number;
      baselineOrders: number;
      baselineUnits: number;
      baselineReminderClicks: number;
      baselineImpressions: number;
      baselineClicks: number;
    }>();
}

export async function previewRestartCandidates(
  sourceCampaignId: string,
  sourceCycle = 2,
): Promise<RestartPreview> {
  await ensureDatabase();
  if (sourceCycle < 2 || sourceCycle > 4) {
    throw new Error("Choose Cycle 2, 3, or 4.");
  }
  const sourceCampaign = (await listCampaigns()).find(
    (campaign) => campaign.id === sourceCampaignId,
  );
  if (!sourceCampaign || sourceCampaign.mode !== "standard") {
    throw new Error("Choose a standard campaign as the restart source.");
  }
  const dashboard = await getDashboard(sourceCampaign.slug);
  const index = sourceCycle - 1;
  const failed = dashboard.listings.filter((listing) => {
    const goal = listing.goals[index];
    return goal !== null && listing.cycles[index].orders < goal;
  });
  const beforeTimestamp = `${dashboard.cycles[index].endDate} 00:00`;
  const candidates: RestartCandidate[] = [];
  const excluded: RestartCandidate[] = [];
  for (const listing of failed) {
    const baseline = await baselineForListing(
      sourceCampaign.id,
      listing.itemId,
      beforeTimestamp,
    );
    const candidate: RestartCandidate = {
      itemId: listing.itemId,
      listingTitle: listing.listingTitle,
      failedCycle: sourceCycle,
      failedGoal: listing.goals[index] ?? 0,
      failedOrders: listing.cycles[index].orders,
      baselineUploadId: baseline?.baselineUploadId ?? null,
      baselineSessionStart: baseline?.baselineSessionStart ?? null,
      baselineSessionEnd: baseline?.baselineSessionEnd ?? null,
      baselineOrders: baseline?.baselineOrders ?? null,
    };
    (baseline ? candidates : excluded).push(candidate);
  }
  return { sourceCampaign, sourceCycle, candidates, excluded };
}

async function backfillRestartCampaign(
  campaignId: string,
  sourceCampaignId: string,
) {
  const db = runtime().DB;
  const bounds = await db
    .prepare(
      `SELECT MIN(substr(baseline_session_start, 1, 10) || ' 00:00') AS minStart,
              MAX(substr(baseline_session_start, 1, 10) || ' 00:00') AS maxStart
         FROM restart_items
        WHERE campaign_id = ?`,
    )
    .bind(campaignId)
    .first<{ minStart: string | null; maxStart: string | null }>();
  if (!bounds?.minStart || !bounds.maxStart) return;
  const firstCycleTwoStart = addDaysToTimestamp(bounds.minStart, 3);
  const finalEnd = addDaysToTimestamp(bounds.maxStart, 12);
  const sourceUploads = await db
    .prepare(
      `SELECT id, session_key, session_start, session_end, source_file, r2_key,
              revision, uploaded_by, created_at
         FROM uploads
        WHERE campaign_id = ? AND active = 1
          AND session_start >= ? AND session_start < ?
        ORDER BY session_start`,
    )
    .bind(sourceCampaignId, firstCycleTwoStart, finalEnd)
    .all<{
      id: string;
      session_key: string;
      session_start: string;
      session_end: string;
      source_file: string;
      r2_key: string | null;
      revision: number;
      uploaded_by: string;
      created_at: string;
    }>();

  for (const upload of sourceUploads.results) {
    const targetUploadId = `${campaignId}:${upload.id}`;
    await db.batch([
      db
        .prepare(
          `INSERT OR IGNORE INTO uploads
            (id, campaign_id, session_key, session_start, session_end, source_file,
             r2_key, revision, active, uploaded_by, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)`,
        )
        .bind(
          targetUploadId,
          campaignId,
          upload.session_key,
          upload.session_start,
          upload.session_end,
          upload.source_file,
          upload.r2_key,
          upload.revision,
          upload.uploaded_by,
          upload.created_at,
        ),
      db
        .prepare(
          `INSERT OR IGNORE INTO listing_metrics
            (id, upload_id, item_id, listing_title, sales, orders, units,
             reminder_clicks, impressions, clicks)
           SELECT ? || ':' || lm.id, ?, lm.item_id, lm.listing_title, lm.sales,
                  lm.orders, lm.units, lm.reminder_clicks, lm.impressions, lm.clicks
             FROM listing_metrics lm
             JOIN restart_items ri
               ON ri.campaign_id = ? AND ri.item_id = lm.item_id
            WHERE lm.upload_id = ?`,
        )
        .bind(campaignId, targetUploadId, campaignId, upload.id),
      db
        .prepare(
          `INSERT OR IGNORE INTO variation_metrics
            (id, upload_id, item_id, listing_title, variation_id, variation_title,
             sku, sales, orders, units)
           SELECT ? || ':' || vm.id, ?, vm.item_id, vm.listing_title,
                  vm.variation_id, vm.variation_title, vm.sku, vm.sales,
                  vm.orders, vm.units
             FROM variation_metrics vm
             JOIN restart_items ri
               ON ri.campaign_id = ? AND ri.item_id = vm.item_id
            WHERE vm.upload_id = ?`,
        )
        .bind(campaignId, targetUploadId, campaignId, upload.id),
    ]);
  }
}

export async function createRestartCampaign(input: {
  sourceCampaignId: string;
  sourceCycle: number;
  name?: string;
  createdBy: string;
}) {
  const preview = await previewRestartCandidates(
    input.sourceCampaignId,
    input.sourceCycle,
  );
  if (preview.candidates.length === 0) {
    throw new Error("No failed listings with a non-zero baseline were found.");
  }
  const db = runtime().DB;
  const slug = `restart-${preview.sourceCampaign.slug}-cycle-${input.sourceCycle}`;
  const existing = (await listCampaigns()).find(
    (campaign) => campaign.slug === slug,
  );
  if (existing) {
    return {
      campaign: existing,
      candidates: preview.candidates,
      excluded: preview.excluded,
      created: false,
    };
  }
  const campaignId = `restart:${preview.sourceCampaign.id}:cycle:${input.sourceCycle}`;
  const now = new Date().toISOString();
  const startDate = preview.candidates
    .map((candidate) => candidate.baselineSessionStart!.slice(0, 10))
    .sort()[0];
  const name =
    input.name?.trim() ||
    `Cycle ${input.sourceCycle} Failure Restart · ${preview.sourceCampaign.name}`;
  await db.batch([
    db
      .prepare(
        `INSERT OR IGNORE INTO campaigns
          (id, name, slug, start_date, created_at)
         VALUES (?, ?, ?, ?, ?)`,
      )
      .bind(campaignId, name, slug, startDate, now),
    db
      .prepare(
        `INSERT OR IGNORE INTO restart_campaigns
          (campaign_id, source_campaign_id, source_cycle, created_by, created_at)
         VALUES (?, ?, ?, ?, ?)`,
      )
      .bind(
        campaignId,
        preview.sourceCampaign.id,
        input.sourceCycle,
        input.createdBy,
        now,
      ),
  ]);

  for (const candidate of preview.candidates) {
    const baseline = await baselineForListing(
      preview.sourceCampaign.id,
      candidate.itemId,
      `${getCycleWindows(preview.sourceCampaign.startDate)[input.sourceCycle - 1].endDate} 00:00`,
    );
    if (!baseline) continue;
    await db
      .prepare(
        `INSERT OR IGNORE INTO restart_items
          (campaign_id, item_id, listing_title, baseline_upload_id,
           baseline_session_start, baseline_session_end, baseline_sales,
           baseline_orders, baseline_units, baseline_reminder_clicks,
           baseline_impressions, baseline_clicks)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        campaignId,
        candidate.itemId,
        baseline.listingTitle,
        baseline.baselineUploadId,
        baseline.baselineSessionStart,
        baseline.baselineSessionEnd,
        baseline.baselineSales,
        baseline.baselineOrders,
        baseline.baselineUnits,
        baseline.baselineReminderClicks,
        baseline.baselineImpressions,
        baseline.baselineClicks,
      )
      .run();
  }
  await backfillRestartCampaign(campaignId, preview.sourceCampaign.id);
  const campaign = (await listCampaigns()).find(
    (candidate) => candidate.id === campaignId,
  )!;
  return {
    campaign,
    candidates: preview.candidates,
    excluded: preview.excluded,
    created: true,
  };
}

let requestedRestartReady = false;

export async function ensureRequestedRestartQueue() {
  if (requestedRestartReady) return;
  await ensureDatabase();
  const db = runtime().DB;
  const existing = await db
    .prepare("SELECT id FROM campaigns WHERE slug = ?")
    .bind("restart-july-2026-cycle-2")
    .first();
  if (existing) {
    requestedRestartReady = true;
    return;
  }
  const source = await db
    .prepare("SELECT id FROM campaigns WHERE slug = ?")
    .bind("july-2026")
    .first<{ id: string }>();
  if (!source) return;
  const ready = await db
    .prepare(
      `SELECT id FROM uploads
        WHERE campaign_id = ? AND active = 1 AND session_key = ?
        LIMIT 1`,
    )
    .bind(
      source.id,
      "2026-07-29 20:00|2026-07-30 00:00",
    )
    .first();
  if (!ready) return;
  const result = await createRestartCampaign({
    sourceCampaignId: source.id,
    sourceCycle: 2,
    name: "Cycle 2 Failure Restart · July 2026",
    createdBy: "System rollover",
  });
  if (result.campaign.slug !== "restart-july-2026-cycle-2") {
    await db
      .prepare("UPDATE campaigns SET slug = ? WHERE id = ?")
      .bind("restart-july-2026-cycle-2", result.campaign.id)
      .run();
  }
  requestedRestartReady = true;
}

export async function claimOrVerifyAdmin(email: string): Promise<boolean> {
  const normalizedEmail = email.trim().toLowerCase();
  return ["jeehung.chong@chando.my", "jinhui@chando.my"].includes(normalizedEmail);
}

async function insertSessionForCampaign(input: {
  campaignId: string;
  parsed: ParsedFlashSaleFile;
  sourceFile: string;
  r2Key: string | null;
  uploadedBy: string;
  itemIds?: Set<string>;
}) {
  const db = runtime().DB;
  const revisionRow = await db
    .prepare(
      "SELECT COALESCE(MAX(revision), 0) AS revision FROM uploads WHERE campaign_id = ? AND session_key = ?",
    )
    .bind(input.campaignId, input.parsed.sessionKey)
    .first<{ revision: number }>();
  const revision = Number(revisionRow?.revision ?? 0) + 1;
  const uploadId = crypto.randomUUID();

  await db
    .prepare(
      "UPDATE uploads SET active = 0 WHERE campaign_id = ? AND session_key = ? AND active = 1",
    )
    .bind(input.campaignId, input.parsed.sessionKey)
    .run();
  await db
    .prepare(
      `INSERT INTO uploads
        (id, campaign_id, session_key, session_start, session_end, source_file, r2_key, revision, active, uploaded_by, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)`,
    )
    .bind(
      uploadId,
      input.campaignId,
      input.parsed.sessionKey,
      input.parsed.sessionStart,
      input.parsed.sessionEnd,
      input.sourceFile,
      input.r2Key,
      revision,
      input.uploadedBy,
      new Date().toISOString(),
    )
    .run();

  await runInChunks(
    input.parsed.listings
      .filter((metric) => !input.itemIds || input.itemIds.has(metric.itemId))
      .map((metric) =>
      db
        .prepare(
          `INSERT INTO listing_metrics
            (id, upload_id, item_id, listing_title, sales, orders, units, reminder_clicks, impressions, clicks)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .bind(
          crypto.randomUUID(),
          uploadId,
          metric.itemId,
          metric.listingTitle,
          metric.confirmedSales,
          metric.confirmedOrders,
          metric.unitsSold,
          metric.reminderClicks,
          metric.impressions,
          metric.clicks,
        ),
      ),
  );
  await runInChunks(
    input.parsed.variations
      .filter((metric) => !input.itemIds || input.itemIds.has(metric.itemId))
      .map((metric) =>
      db
        .prepare(
          `INSERT INTO variation_metrics
            (id, upload_id, item_id, listing_title, variation_id, variation_title, sku, sales, orders, units)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .bind(
          crypto.randomUUID(),
          uploadId,
          metric.itemId,
          metric.listingTitle,
          metric.variationId,
          metric.variationTitle,
          metric.sku,
          metric.confirmedSales,
          metric.confirmedOrders,
          metric.unitsSold,
        ),
      ),
  );
  return { uploadId, revision };
}

export async function replaceSessionUpload(input: {
  campaignId: string;
  parsed: ParsedFlashSaleFile;
  sourceFile: string;
  bytes: ArrayBuffer;
  uploadedBy: string;
}) {
  await ensureDatabase();
  const db = runtime().DB;
  const selected = await db
    .prepare(
      `SELECT c.id, c.start_date AS startDate,
              COALESCE(rc.source_campaign_id, c.id) AS sourceCampaignId
         FROM campaigns c
         LEFT JOIN restart_campaigns rc ON rc.campaign_id = c.id
        WHERE c.id = ?`,
    )
    .bind(input.campaignId)
    .first<{
      id: string;
      startDate: string;
      sourceCampaignId: string;
    }>();
  if (!selected) throw new Error("Campaign not found.");
  const sourceCampaign = await db
    .prepare("SELECT start_date AS startDate FROM campaigns WHERE id = ?")
    .bind(selected.sourceCampaignId)
    .first<{ startDate: string }>();
  if (!sourceCampaign) throw new Error("Source campaign not found.");

  const restartRows = await db
    .prepare(
      `SELECT rc.campaign_id AS campaignId, ri.item_id AS itemId,
              ri.baseline_session_start AS baselineStart
         FROM restart_campaigns rc
         JOIN restart_items ri ON ri.campaign_id = rc.campaign_id
        WHERE rc.source_campaign_id = ?`,
    )
    .bind(selected.sourceCampaignId)
    .all<{ campaignId: string; itemId: string; baselineStart: string }>();
  const eligible = new Map<string, Set<string>>();
  for (const row of restartRows.results) {
    const cycleOneStart = `${row.baselineStart.slice(0, 10)} 00:00`;
    if (
      input.parsed.sessionStart >= addDaysToTimestamp(cycleOneStart, 3) &&
      input.parsed.sessionStart < addDaysToTimestamp(cycleOneStart, 12)
    ) {
      const itemIds = eligible.get(row.campaignId) ?? new Set<string>();
      itemIds.add(row.itemId);
      eligible.set(row.campaignId, itemIds);
    }
  }
  const sourceSessionDate = input.parsed.sessionStart.slice(0, 10);
  const insideSource = sourceSessionDate >= sourceCampaign.startDate;
  if (!insideSource && eligible.size === 0) {
    throw new Error(
      `This session is outside the source campaign window.`,
    );
  }

  const sourceRevision = await db
    .prepare(
      "SELECT COALESCE(MAX(revision), 0) AS revision FROM uploads WHERE campaign_id = ? AND session_key = ?",
    )
    .bind(selected.sourceCampaignId, input.parsed.sessionKey)
    .first<{ revision: number }>();
  const nextRevision = Number(sourceRevision?.revision ?? 0) + 1;
  const safeSession = input.parsed.sessionKey.replace(/[^0-9A-Za-z]+/g, "-");
  const r2Key = runtime().UPLOADS
    ? `${selected.sourceCampaignId}/${safeSession}/rev-${nextRevision}-${input.sourceFile.replace(/[^0-9A-Za-z._-]+/g, "-")}`
    : null;
  if (runtime().UPLOADS && r2Key) {
    await runtime().UPLOADS.put(r2Key, input.bytes, {
      httpMetadata: {
        contentType:
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      },
    });
  }

  const sourceResult = await insertSessionForCampaign({
    campaignId: selected.sourceCampaignId,
    parsed: input.parsed,
    sourceFile: input.sourceFile,
    r2Key,
    uploadedBy: input.uploadedBy,
  });
  const routedCampaignIds: string[] = [];
  for (const [campaignId, itemIds] of eligible) {
    await insertSessionForCampaign({
      campaignId,
      parsed: input.parsed,
      sourceFile: input.sourceFile,
      r2Key,
      uploadedBy: input.uploadedBy,
      itemIds,
    });
    routedCampaignIds.push(campaignId);
  }
  return {
    ...sourceResult,
    sourceCampaignId: selected.sourceCampaignId,
    routedCampaignIds,
  };
}
