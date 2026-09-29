import type { DefaultUser, NextAuthOptions, Profile } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import GoogleProvider from "next-auth/providers/google";
import bcrypt from "bcryptjs";
import { prisma } from "./prisma";
import {
  canManageResultsRelease,
  hasCompanyWideResultsAccess,
  isAdminEmail,
  normalizeEmail,
} from "./access";
import { getAdminPortalEmail, isAdminPortalLoginId, normalizeAdminLoginId } from "./admin-portal";

type AppAuthUser = DefaultUser & {
  id: string;
  email: string;
  name: string;
  role: string;
  jobTitle: string | null;
  departmentId: string;
  teamId: string | null;
  managerEmail: string | null;
  status: string;
  location: string | null;
  division: string | null;
  loginId?: string | null;
  canViewResults: boolean;
  canManageResults: boolean;
  companyWideResults: boolean;
};

type GoogleProfile = Profile & {
  email?: string;
  email_verified?: boolean;
  hd?: string;
};

const googleClientId = process.env.GOOGLE_CLIENT_ID;
const googleClientSecret = process.env.GOOGLE_CLIENT_SECRET;
const googleHostedDomain = process.env.GOOGLE_HOSTED_DOMAIN?.trim().toLowerCase() || "clutch.ca";

async function findUserByEmail(email: string) {
  return prisma.user.findUnique({
    where: { email: email.toLowerCase() },
  });
}

function toAuthUser(user: {
  id: string;
  email: string;
  name: string;
  role: string;
  jobTitle: string | null;
  departmentId: string;
  teamId: string | null;
  managerEmail: string | null;
  status: string;
  location: string | null;
  division: string | null;
}, loginId?: string | null): AppAuthUser {
  const role = isAdminEmail(user.email) ? "admin" : user.role;
  const companyWideResults = hasCompanyWideResultsAccess({
    role,
    email: user.email,
    jobTitle: user.jobTitle,
  });
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role,
    jobTitle: user.jobTitle,
    departmentId: user.departmentId,
    teamId: user.teamId,
    managerEmail: user.managerEmail,
    status: user.status,
    location: user.location,
    division: user.division,
    loginId,
    canViewResults: companyWideResults || role === "manager",
    canManageResults: canManageResultsRelease({ role, email: user.email }),
    companyWideResults,
  };
}

const providers: NextAuthOptions["providers"] = [
  CredentialsProvider({
    name: "Credentials",
    credentials: {
      userId: { label: "User ID", type: "text" },
      password: { label: "Password", type: "password" },
    },
    async authorize(credentials) {
      if (!credentials?.userId || !credentials?.password) return null;

      const loginId = normalizeAdminLoginId(credentials.userId);
      const isAdminPortalLogin = isAdminPortalLoginId(loginId);
      const email = isAdminPortalLogin ? getAdminPortalEmail(loginId) : loginId;
      const user = await findUserByEmail(email);
      if (!user) return null;
      if (isAdminPortalLogin && user.role !== "admin") return null;
      if (!isAdminPortalLogin && user.role === "admin") return null;
      if (
        !isAdminPortalLogin &&
        !isAdminEmail(user.email) &&
        (user.status !== "active" || !user.bambooHrId)
      ) {
        return null;
      }

      const valid = await bcrypt.compare(credentials.password, user.passwordHash);
      if (!valid) return null;

      return toAuthUser(user, isAdminPortalLogin ? loginId : null);
    },
  }),
];

if (googleClientId && googleClientSecret) {
  providers.push(
    GoogleProvider({
      clientId: googleClientId,
      clientSecret: googleClientSecret,
      authorization: {
        params: {
          prompt: "select_account",
          ...(googleHostedDomain ? { hd: googleHostedDomain } : {}),
        },
      },
    })
  );
}

export const authOptions: NextAuthOptions = {
  session: { strategy: "jwt" },
  pages: { signIn: "/login" },
  providers,
  callbacks: {
    async signIn({ account, profile }) {
      if (account?.provider !== "google") return true;

      const googleProfile = profile as GoogleProfile | undefined;
      if (!googleProfile?.email || googleProfile.email_verified === false) {
        return false;
      }

      const email = normalizeEmail(googleProfile.email);
      const emailDomain = email.split("@")[1];

      if (emailDomain !== googleHostedDomain) {
        return false;
      }

      const user = await findUserByEmail(email);
      return Boolean(
        user &&
          ((user.status === "active" && user.bambooHrId) || isAdminEmail(user.email))
      );
    },
    async jwt({ token, user }) {
      if (user) {
        const authUser = user as Partial<AppAuthUser>;
        const dbUser =
          authUser.role && authUser.departmentId && authUser.email
            ? authUser
            : authUser.email
              ? await findUserByEmail(authUser.email)
              : null;

        if (dbUser) {
          token.id = dbUser.id;
          token.role = dbUser.role;
          token.jobTitle = dbUser.jobTitle ?? null;
          token.departmentId = dbUser.departmentId;
          token.teamId = dbUser.teamId ?? null;
          token.managerEmail = dbUser.managerEmail ?? null;
          token.status = dbUser.status ?? "active";
          token.location = dbUser.location ?? null;
          token.division = dbUser.division ?? null;
          token.loginId = authUser.loginId ?? null;
          token.companyWideResults = hasCompanyWideResultsAccess({
            role: dbUser.role,
            email: dbUser.email,
            jobTitle: dbUser.jobTitle,
          });
          token.canManageResults = canManageResultsRelease({
            role: dbUser.role,
            email: dbUser.email,
          });
          token.canViewResults =
            token.companyWideResults || dbUser.role === "manager";
        }
      } else if (token.email) {
        const dbUser = await findUserByEmail(token.email);
        if (dbUser) {
          token.id = dbUser.id;
          token.role = isAdminEmail(dbUser.email) ? "admin" : dbUser.role;
          token.jobTitle = dbUser.jobTitle;
          token.departmentId = dbUser.departmentId;
          token.teamId = dbUser.teamId;
          token.managerEmail = dbUser.managerEmail;
          token.status = dbUser.status;
          token.location = dbUser.location;
          token.division = dbUser.division;
          token.loginId = null;
          token.companyWideResults = hasCompanyWideResultsAccess({
            role: token.role,
            email: dbUser.email,
            jobTitle: dbUser.jobTitle,
          });
          token.canManageResults = canManageResultsRelease({
            role: token.role,
            email: dbUser.email,
          });
          token.canViewResults =
            token.companyWideResults || token.role === "manager";
        }
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.id ?? "";
        session.user.role = token.role ?? "employee";
        session.user.jobTitle = token.jobTitle ?? null;
        session.user.departmentId = token.departmentId ?? "";
        session.user.teamId = token.teamId ?? null;
        session.user.managerEmail = token.managerEmail ?? null;
        session.user.status = token.status ?? "active";
        session.user.location = token.location ?? null;
        session.user.division = token.division ?? null;
        session.user.loginId = token.loginId ?? null;
        session.user.canViewResults = token.canViewResults ?? false;
        session.user.canManageResults = token.canManageResults ?? false;
        session.user.companyWideResults = token.companyWideResults ?? false;
      }
      return session;
    },
  },
};
