import { NextRequest, NextResponse } from "next/server";

const COOKIE_NAME = "auth_token";
const COOKIE_VALUE = "authenticated";

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Allow login page and static assets
  if (
    pathname.startsWith("/login") ||
    pathname.startsWith("/_next") ||
    pathname.startsWith("/favicon")
  ) {
    return NextResponse.next();
  }

  const auth = request.cookies.get(COOKIE_NAME)?.value;
  if (auth !== COOKIE_VALUE) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("from", pathname);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
