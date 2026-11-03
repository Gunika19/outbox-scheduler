import { Client } from "@elastic/elasticsearch";
import { config } from "./config.js";

export const es = new Client({ node: config.ELASTICSEARCH_URL });
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
  if (docs.length === 0) return;
  try {
    const operations = docs.flatMap((d) => [{ index: { _index: INDEX, _id: String(d.id) } }, d]);
    const res = await es.bulk({ operations, refresh: false });
    if (res.errors) console.error("Elasticsearch bulk index had errors");
  } catch (err) {
    console.error("Elasticsearch bulk index failed:", err);
  }
}

export async function updateEmailDoc(id: number, fields: Partial<EmailDoc>) {
  try {
    await es.update({ index: INDEX, id: String(id), doc: fields });
  } catch (err) {
    console.error(`Elasticsearch update failed for email ${id}:`, err);
  }
}

export async function searchEmails(userId: number, q: string) {
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
  return res.hits.hits.map((h) => h._source!).filter(Boolean);
}
