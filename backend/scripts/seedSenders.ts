// Creates 2 Ethereal (fake SMTP) sender accounts and stores them in the DB.
//
//   npm run seed            create senders if none exist
//   npm run seed -- --reset give existing senders fresh, distinct Ethereal accounts
//
// --reset updates the existing rows in place (same ids), so emails that already
// reference those senders stay valid. Restart the backend afterwards: the worker
// caches one SMTP transporter per sender id.

// nodemailer caches the first test account per process (ETHEREAL_CACHE defaults
// to "yes"), which would give both senders the SAME mailbox. Disable it.
process.env.ETHEREAL_CACHE = "no";

import nodemailer from "nodemailer";
import { prisma } from "../src/db.js";

const SENDER_COUNT = 2;
const reset = process.argv.includes("--reset");

async function main() {
  const existing = await prisma.sender.findMany({ orderBy: { id: "asc" } });
  if (existing.length > 0 && !reset) {
    console.log(`${existing.length} sender(s) already exist — skipping. Use --reset to replace their accounts.`);
    return;
  }

  const usedUsers = new Set<string>();
  for (let i = 0; i < SENDER_COUNT; i++) {
    const account = await nodemailer.createTestAccount();
    if (usedUsers.has(account.user)) throw new Error("Ethereal returned a duplicate account");
    usedUsers.add(account.user);

    const name = `Sender ${i + 1}`;
    const data = { name, smtpUser: account.user, smtpPass: account.pass };
    const sender = existing[i]
      ? await prisma.sender.update({ where: { id: existing[i].id }, data })
      : await prisma.sender.create({ data });
    console.log(`${existing[i] ? "Updated" : "Created"} ${sender.name} (id ${sender.id}): ${account.user}`);
  }
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
