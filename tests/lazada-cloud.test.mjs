import { test } from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import { lazadaApi, validateDraft } from "../worker/lazada.ts";

function environment() {
  const sqlite = new DatabaseSync(":memory:");
  sqlite.exec(readFileSync(new URL("../drizzle/0003_stormy_felicia_hardy.sql", import.meta.url), "utf8"));
  function prepare(sql) {
    return { bind(...args) { this.args = args; return this; }, args: [],
      async all() { return { results: sqlite.prepare(sql).all(...this.args) }; },
      async run() { return sqlite.prepare(sql).run(...this.args); },
      execute() { const q = sqlite.prepare(sql); return { results: q.columns().length ? q.all(...this.args) : (q.run(...this.args), []) }; }
    };
  }
  const objects = new Map();
  return { DB: { prepare, async batch(statements) {
    sqlite.exec("BEGIN");
    try { const result = statements.map(s => s.execute()); sqlite.exec("COMMIT"); return result; }
    catch (error) { sqlite.exec("ROLLBACK"); throw error; }
  } }, UPLOADS: { async put(key, data) { objects.set(key, data); } }, objects };
}
const draft = { listingId: "4635243288", listingTitle: "Oil Control", periodStart: "2026-09-06T00:00", periodEnd: "2026-09-07T00:00", rows: [{ sku: "A", price: 48.51, stock: 1, sales: 1 }, { sku: "B", price: 93.95, stock: 1, sales: 1 }] };
function post(data, email = "jeehung.chong@chando.my", error) {
  const body = new FormData();
  body.set("draft", JSON.stringify(data));
  body.set("file", new File(["same original"], "test.pdf", { type: "application/pdf" }));
  if (error) body.set("error", error);
  return new Request("https://test.site/api/lazada", { method: "POST", body, headers: email ? { "oai-authenticated-user-email": email, origin: "https://test.site" } : {} });
}
const get = (email = "") => new Request("https://test.site/api/lazada", { headers: { "oai-authenticated-user-email": email } });
test("empty shared start, cross-user read, duplicate skip, replacement and audit", async () => {
  const env = environment();
  assert.equal((await (await lazadaApi(get(), env)).json()).records.length, 0);
  assert.equal((await (await lazadaApi(post(draft), env)).json()).status, "added");
  assert.equal((await (await lazadaApi(post(draft, "jinhui@chando.my"), env)).json()).status, "skipped");
  const replacement = { ...draft, rows: [{ ...draft.rows[0], sales: 3 }] };
  assert.equal((await (await lazadaApi(post(replacement, "jinhui@chando.my"), env)).json()).status, "replaced");
  const shared = await (await lazadaApi(get("jeehung.chong@chando.my"), env)).json();
  assert.equal(shared.records.length, 1);
  assert.equal(shared.records[0].sales, 3);
  assert.equal(shared.history.length, 3);
  assert.equal(shared.history[0].revision, 2);
  assert.equal(shared.history[0].uploadedBy, "jinhui@chando.my");
  assert.equal(env.objects.size, 1);
  assert.equal((await (await lazadaApi(get(), env)).json()).history.length, 0);
});
test("different sessions add, failures preserved and unauthorized writes blocked", async () => {
  const env = environment();
  assert.equal((await lazadaApi(post(draft, ""), env)).status, 401);
  assert.equal((await lazadaApi(post(draft, "stranger@example.com"), env)).status, 403);
  await lazadaApi(post(draft), env);
  await lazadaApi(post({ ...draft, periodStart: "2026-09-07T00:00", periodEnd: "2026-09-08T00:00" }), env);
  assert.equal((await lazadaApi(post(null, "jinhui@chando.my", "Unreadable SKU"), env)).status, 400);
  const data = await (await lazadaApi(get("jinhui@chando.my"), env)).json();
  assert.equal(data.records.reduce((sum, r) => sum + r.sales, 0), 4);
  assert.equal(data.history[0].status, "failed");
  assert.equal(data.history[0].error, "Unreadable SKU");
});
test("invalid inputs cannot erase a session", () => {
  for (const invalid of [
    { ...draft, rows: [] },
    { ...draft, rows: [draft.rows[0], draft.rows[0]] },
    { ...draft, periodEnd: draft.periodStart },
    { ...draft, rows: [{ ...draft.rows[0], sales: -1 }] },
    { ...draft, rows: [{ ...draft.rows[0], sku: "truncated…" }] },
  ]) assert.throws(() => validateDraft(invalid));
});
