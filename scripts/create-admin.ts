import "dotenv/config";
import bcrypt from "bcryptjs";
import { db } from "../src/lib/db";

async function main() {
  const [email, password, name = "Platform Admin"] = process.argv.slice(2);
  if (!email || !password) {
    console.error('Usage: npx tsx scripts/create-admin.ts <email> <password> ["Name"]');
    process.exit(1);
  }

  const hashed = await bcrypt.hash(password, 10);
  const user = await db.user.upsert({
    where: { email: email.toLowerCase() },
    update: { role: "ADMIN", password: hashed, name },
    create: { email: email.toLowerCase(), password: hashed, name, role: "ADMIN" },
  });

  await db.setting.upsert({ where: { id: 1 }, update: {}, create: { id: 1 } });

  console.log("Admin ready:", user.email);
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
