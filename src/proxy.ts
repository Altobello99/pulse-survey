import { getToken } from "next-auth/jwt";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const AUTH_ENTRY_BYPASS_COOKIE = "pulse-auth-entry";

export async function proxy(request: NextRequest) {
  const token = await getToken({ req: request });
  const { pathname } = request.nextUrl;
  const authenticationReturn =
    pathname === "/login" && request.nextUrl.searchParams.get("authenticated") === "1";

  // Allow auth, BambooHR cron sync, login, and PWA asset routes without login.
  if (
    pathname.startsWith("/api/auth") ||
    pathname === "/api/integrations/bamboohr/sync" ||
    pathname === "/login" ||
    pathname === "/fresh-login" ||
    pathname === "/reset-cache" ||
    pathname === "/manifest.json" ||
    pathname === "/sw.js" ||
    pathname.startsWith("/icon") ||
    pathname.startsWith("/apple-icon") ||
    pathname === "/favicon.png" ||
    pathname === "/logo.svg"
  ) {
    if (token && authenticationReturn) {
      const response = NextResponse.redirect(new URL("/dashboard", request.url));
      response.cookies.set(AUTH_ENTRY_BYPASS_COOKIE, "1", {
        httpOnly: true,
        maxAge: 60,
        path: "/",
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production",
      });
      return response;
    }
    if (token && pathname === "/login") {
      return NextResponse.redirect(
        new URL(isExternalAppEntry(request) ? "/fresh-login" : "/dashboard", request.url)
      );
    }
    const response = NextResponse.next();
    if (pathname === "/login" || pathname === "/reset-cache" || pathname === "/manifest.json" || pathname === "/sw.js") {
      response.headers.set("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
      response.headers.set("Pragma", "no-cache");
      response.headers.set("Expires", "0");
    }
    return response;
  }

  // Redirect unauthenticated users to login
  if (!token) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  const hasAuthenticationReturnBypass =
    request.cookies.get(AUTH_ENTRY_BYPASS_COOKIE)?.value === "1";
  if (isExternalAppEntry(request) && !hasAuthenticationReturnBypass) {
    return NextResponse.redirect(new URL("/fresh-login", request.url));
  }

  // Role-based route protection
  if (pathname.startsWith("/admin") && token.role !== "admin") {
    return NextResponse.redirect(new URL("/dashboard", request.url));
  }

  if (
    pathname.startsWith("/manager") &&
    token.role !== "manager" &&
    token.role !== "admin"
  ) {
    return NextResponse.redirect(new URL("/dashboard", request.url));
  }

  if (pathname.startsWith("/feedback") && token.role === "employee") {
    return NextResponse.redirect(new URL("/surveys", request.url));
  }

  const response = NextResponse.next();
  // /dashboard immediately redirects to the role-specific home page. Keep the
  // one-use bypass through that redirect and consume it on the destination.
  if (hasAuthenticationReturnBypass && pathname !== "/dashboard") {
    response.cookies.set(AUTH_ENTRY_BYPASS_COOKIE, "", {
      expires: new Date(0),
      maxAge: 0,
      path: "/",
    });
  }
  return response;
}

function isExternalAppEntry(request: NextRequest) {
  const fetchMode = request.headers.get("sec-fetch-mode");
  const fetchDestination = request.headers.get("sec-fetch-dest");
  if (fetchMode !== "navigate" && fetchDestination !== "document") return false;

  const fetchSite = request.headers.get("sec-fetch-site");
  if (fetchSite === "none" || fetchSite === "cross-site") return true;

  return !fetchSite && !request.headers.get("referer");
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico).*)",
  ],
};
