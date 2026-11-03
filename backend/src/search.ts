import { Client } from "@elastic/elasticsearch";
import { config } from "./config.js";

// Elasticsearch is optional. Without ELASTICSEARCH_URL there is no client and every
// function below is a no-op; search callers fall back to Postgres (see routes/emails.ts).
// Short timeout + no retries so an unreachable cluster never stalls the worker or API.
export const es = config.ELASTICSEARCH_URL
  ? new Client({ node: config.ELASTICSEARCH_URL, requestTimeout: 3000, maxRetries: 0 })
  : null;
const INDEX = "emails";

export type EmailDoc = {
  id: number;
  userId: number;
  campaignId: number;
  recipient: string;
  subject: string;
  body: string;
  status: string;
  scheduledAt: Date;
  sentAt?: Date | null;
};

export async function ensureIndex() {
  if (!es) {
    console.log("ELASTICSEARCH_URL not set — search will use Postgres ILIKE");
    return;
  }
  const exists = await es.indices.exists({ index: INDEX });
  if (exists) return;
  await es.indices.create({
    index: INDEX,
    mappings: {
      properties: {
        id: { type: "integer" },
        userId: { type: "integer" },
        campaignId: { type: "integer" },
        recipient: { type: "text", fields: { keyword: { type: "keyword" } } },
        subject: { type: "text" },
        body: { type: "text" },
        status: { type: "keyword" },
        scheduledAt: { type: "date" },
        sentAt: { type: "date" },
      },
    },
  });
}

// Search is a secondary index: failures are logged, never fatal.
export async function bulkIndexEmails(docs: EmailDoc[]) {
  if (!es || docs.length === 0) return;
  try {
    const operations = docs.flatMap((d) => [{ index: { _index: INDEX, _id: String(d.id) } }, d]);
    const res = await es.bulk({ operations, refresh: false });
    if (res.errors) console.error("Elasticsearch bulk index had errors");
  } catch (err) {
    console.error("Elasticsearch bulk index failed:", err instanceof Error ? err.message : err);
  }
}

export async function updateEmailDoc(id: number, fields: Partial<EmailDoc>) {
  if (!es) return;
  try {
    await es.update({ index: INDEX, id: String(id), doc: fields });
  } catch (err) {
    console.error(`Elasticsearch update failed for email ${id}:`, err instanceof Error ? err.message : err);
  }
}

// Returns matching email ids in relevance order, or null when Elasticsearch is not
// configured or not reachable — the caller then falls back to Postgres.
export async function searchEmailIds(userId: number, q: string): Promise<number[] | null> {
  if (!es) return null;
  try {
    const res = await es.search<EmailDoc>({
      index: INDEX,
      size: 50,
      query: {
        bool: {
          must: [{ multi_match: { query: q, fields: ["recipient", "subject", "body"], fuzziness: "AUTO" } }],
          filter: [{ term: { userId } }],
        },
      },
      sort: [{ scheduledAt: "desc" }],
    });
    return res.hits.hits.flatMap((h) => (h._source ? [h._source.id] : []));
  } catch (err) {
    console.error("Elasticsearch search failed, using Postgres fallback:", err instanceof Error ? err.message : err);
    return null;
  }
}
