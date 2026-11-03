// Creates 2 Ethereal (fake SMTP) sender accounts and stores them in the DB.
// Run once: npm run seed
import nodemailer from "nodemailer";
import { prisma } from "../src/db.js";

async function main() {
  const existing = await prisma.sender.count();
  if (existing > 0) {
    console.log(`${existing} sender(s) already exist — skipping.`);
    return;
  }
  for (let i = 1; i <= 2; i++) {
    const account = await nodemailer.createTestAccount();
    const sender = await prisma.sender.create({
      data: { name: `Sender ${i}`, smtpUser: account.user, smtpPass: account.pass },
    });
    console.log(`Created ${sender.name}: ${account.user} / ${account.pass}`);
  }
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
