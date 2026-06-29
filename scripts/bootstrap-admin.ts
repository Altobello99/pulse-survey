import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import pg from "pg";
import bcrypt from "bcryptjs";
import "dotenv/config";
import { getAdminPortalAccounts, getAdminPortalEmail } from "../src/lib/admin-portal";

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

const adminPassword = process.env.ADMIN_BOOTSTRAP_PASSWORD || "admin123";
const adminName = process.env.ADMIN_BOOTSTRAP_NAME || "Admin";

async function main() {
  const department = await prisma.department.upsert({
    where: { name: "Administration" },
    create: { name: "Administration" },
    update: {},
  });

  const team = await prisma.team.upsert({
    where: {
      name_departmentId: {
        name: "Administration",
        departmentId: department.id,
      },
    },
    create: { name: "Administration", departmentId: department.id },
    update: {},
  });

  const accounts = getAdminPortalAccounts(adminPassword);

  for (const account of accounts) {
    const passwordHash = await bcrypt.hash(account.password, 10);
    const adminEmail = getAdminPortalEmail(account.loginId);

    await prisma.user.upsert({
      where: { email: adminEmail },
      create: {
        email: adminEmail,
        name: adminName,
        passwordHash,
        role: "admin",
        status: "active",
        departmentId: department.id,
        teamId: team.id,
      },
      update: {
        name: adminName,
        passwordHash,
        role: "admin",
        status: "active",
        departmentId: department.id,
        teamId: team.id,
      },
    });
  }

  console.log(`Admin login IDs: ${accounts.map((account) => account.loginId).join(", ")}`);
  console.log("Passwords are set from ADMIN_PORTAL_ACCOUNTS or ADMIN_BOOTSTRAP_PASSWORD.");
}

main()
  .then(async () => {
    await pool.end();
  })
  .catch(async (error) => {
    console.error(error);
    await pool.end();
    process.exit(1);
  });
