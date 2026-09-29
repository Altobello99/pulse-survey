import "next-auth";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      name: string;
      email: string;
      role: string;
      jobTitle: string | null;
      departmentId: string;
      teamId: string | null;
      managerEmail: string | null;
      status: string;
      location: string | null;
      division: string | null;
      loginId: string | null;
      canViewResults: boolean;
      canManageResults: boolean;
      companyWideResults: boolean;
    };
  }

  interface User {
    role?: string;
    jobTitle?: string | null;
    departmentId?: string;
    teamId?: string | null;
    managerEmail?: string | null;
    status?: string;
    location?: string | null;
    division?: string | null;
    loginId?: string | null;
    canViewResults?: boolean;
    canManageResults?: boolean;
    companyWideResults?: boolean;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id?: string;
    role?: string;
    jobTitle?: string | null;
    departmentId?: string;
    teamId?: string | null;
    managerEmail?: string | null;
    status?: string;
    location?: string | null;
    division?: string | null;
    loginId?: string | null;
    canViewResults?: boolean;
    canManageResults?: boolean;
    companyWideResults?: boolean;
  }
}
