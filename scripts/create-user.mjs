// Usage: node --env-file=.env.local scripts/create-user.mjs <username> <password> [displayName]
// (or node --env-file=.env scripts/create-user.mjs ...)

import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import bcrypt from "bcryptjs";

const [username, password, displayName] = process.argv.slice(2);

if (!username || !password) {
  console.error(
    "Usage: node --env-file=.env.local scripts/create-user.mjs <username> <password> [displayName]",
  );
  process.exit(1);
}

const connectionString =
  process.env.DIRECT_URL || process.env.DATABASE_URL;

if (!connectionString) {
  console.error("DATABASE_URL or DIRECT_URL must be set");
  process.exit(1);
}

const adapter = new PrismaPg({ connectionString });
const prisma = new PrismaClient({ adapter });

const existing = await prisma.user.findUnique({ where: { username } });
if (existing) {
  console.error(`User "${username}" already exists (id=${existing.id}).`);
  await prisma.$disconnect();
  process.exit(1);
}

const passwordHash = await bcrypt.hash(password, 10);
const user = await prisma.user.create({
  data: { username, passwordHash, name: displayName ?? null },
});

console.log("Created user:");
console.log(JSON.stringify({ id: user.id, username: user.username, name: user.name }, null, 2));

await prisma.$disconnect();
