import { NextResponse, type NextRequest } from 'next/server';

// Cheap gate: bounce visitors without a session cookie. Real validation happens server-side.
export function middleware(req: NextRequest) {
  if (!req.cookies.get('cf_session')) {
    const url = new URL('/login', req.url);
    url.searchParams.set('next', req.nextUrl.pathname);
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = { matcher: ['/app/:path*', '/admin/:path*'] };
