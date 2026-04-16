import { NextRequest } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import bcrypt from "bcryptjs";
import Papa from "papaparse";

interface Row {
  email: string;
  name: string;
  department: string;
  team?: string;
  role?: string;
  jobTitle?: string;
  jobLevel?: string;
  hireDate?: string;
  managerEmail?: string;
}

function normalizeKey(k: string) {
  return k.trim().toLowerCase().replace(/[\s_-]/g, "");
}

const FIELD_MAP: Record<string, keyof Row> = {
  email: "email",
  name: "name",
  fullname: "name",
  department: "department",
  dept: "department",
  team: "team",
  role: "role",
  jobtitle: "jobTitle",
  title: "jobTitle",
  joblevel: "jobLevel",
  level: "jobLevel",
  seniority: "jobLevel",
  hiredate: "hireDate",
  startdate: "hireDate",
  manageremail: "managerEmail",
  manager: "managerEmail",
};

export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session || session.user.role !== "admin") {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await request.json();
  const csvText: string = body.csv;
  const defaultPassword: string = body.defaultPassword || "welcome123";

  if (!csvText) {
    return Response.json({ error: "Missing CSV content" }, { status: 400 });
  }

  const parsed = Papa.parse<Record<string, string>>(csvText, {
    header: true,
    skipEmptyLines: true,
  });

  if (parsed.errors.length) {
    return Response.json(
      { error: "CSV parse error", details: parsed.errors.slice(0, 3) },
      { status: 400 }
    );
  }

  // Normalize rows with flexible column naming
  const rows: Row[] = parsed.data.map((raw) => {
    const r: any = {};
    for (const [key, value] of Object.entries(raw)) {
      const mapped = FIELD_MAP[normalizeKey(key)];
      if (mapped) r[mapped] = value?.trim();
    }
    return r;
  });

  const results = {
    total: rows.length,
    created: 0,
    updated: 0,
    errors: [] as { row: number; email: string; message: string }[],
  };

  const passwordHash = await bcrypt.hash(defaultPassword, 10);

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    try {
      if (!row.email || !row.name || !row.department) {
        throw new Error("Missing required field: email, name, or department");
      }

      // Find or create department
      let dept = await prisma.department.findUnique({
        where: { name: row.department },
      });
      if (!dept) {
        dept = await prisma.department.create({ data: { name: row.department } });
      }

      // Find or create team if provided
      let teamId: string | null = null;
      if (row.team) {
        let team = await prisma.team.findUnique({
          where: { name_departmentId: { name: row.team, departmentId: dept.id } },
        });
        if (!team) {
          team = await prisma.team.create({
            data: { name: row.team, departmentId: dept.id },
          });
        }
        teamId = team.id;
      }

      const role = ["admin", "manager", "employee"].includes(row.role || "")
        ? row.role!
        : "employee";

      const existing = await prisma.user.findUnique({ where: { email: row.email } });

      const data = {
        name: row.name,
        role,
        departmentId: dept.id,
        teamId,
        jobTitle: row.jobTitle || null,
        jobLevel: row.jobLevel || null,
        hireDate: row.hireDate ? new Date(row.hireDate) : null,
        managerEmail: row.managerEmail || null,
      };

      if (existing) {
        await prisma.user.update({ where: { email: row.email }, data });
        results.updated++;
      } else {
        await prisma.user.create({
          data: { ...data, email: row.email, passwordHash },
        });
        results.created++;
      }
    } catch (e: any) {
      results.errors.push({
        row: i + 2, // +2 to account for header row and 1-indexing
        email: row.email || "(missing)",
        message: e.message || "Unknown error",
      });
    }
  }

  return Response.json({ data: results });
}
