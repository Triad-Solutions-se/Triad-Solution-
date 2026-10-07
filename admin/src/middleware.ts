import { NextResponse, type NextRequest } from "next/server";
import { createServerClient, type CookieOptions } from "@supabase/ssr";

type CookieTriple = { name: string; value: string; options?: CookieOptions };

// Former portal host (Triad Solutions → MCA Solutions AB, 2026). Page requests
// 308 to the same path on the new host; /api/* (analytics beacons from the
// products, webhooks) keeps serving on both.
const LEGACY_HOST = "portal.triadsolutions.se";
const CANONICAL_HOST = "portal.mcasolutions.se";

export async function middleware(request: NextRequest) {
  const hostname = (request.headers.get("host") ?? "").split(":")[0].toLowerCase();
  if (hostname === LEGACY_HOST && !request.nextUrl.pathname.startsWith("/api")) {
    const target = new URL(
      `${request.nextUrl.pathname}${request.nextUrl.search}`,
      `https://${CANONICAL_HOST}`,
    );
    return NextResponse.redirect(target, 308);
  }

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-pathname", request.nextUrl.pathname);
  let response = NextResponse.next({ request: { headers: requestHeaders } });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (arr: CookieTriple[]) => {
          arr.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request: { headers: requestHeaders } });
          arr.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  const { data: { user } } = await supabase.auth.getUser();
  const { pathname } = request.nextUrl;
  if (!pathname.startsWith("/admin")) return response;

  const isLogin = pathname === "/admin/login" || pathname.startsWith("/admin/login/");
  const isAuthCallback = pathname.startsWith("/admin/auth/");

  if (!user && !isLogin && !isAuthCallback) {
    const url = request.nextUrl.clone();
    url.pathname = "/admin/login";
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }
  if (user && isLogin) {
    const url = request.nextUrl.clone();
    url.pathname = "/admin";
    url.searchParams.delete("next");
    return NextResponse.redirect(url);
  }

  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
};
