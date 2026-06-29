import "next-auth";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      name: string;
      email: string;
      role: string;
      departmentId: string;
      teamId: string | null;
      managerEmail: string | null;
      status: string;
      location: string | null;
      division: string | null;
      loginId: string | null;
    };
  }

  interface User {
    role?: string;
    departmentId?: string;
    teamId?: string | null;
    managerEmail?: string | null;
    status?: string;
    location?: string | null;
    division?: string | null;
    loginId?: string | null;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id?: string;
    role?: string;
    departmentId?: string;
    teamId?: string | null;
    managerEmail?: string | null;
    status?: string;
    location?: string | null;
    division?: string | null;
    loginId?: string | null;
  }
}
