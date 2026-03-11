/**
 * Next.js middleware — protect the main chat route.
 * Unauthenticated users are redirected to /auth/signin.
 */
export { auth as middleware } from "@/auth";

export const config = {
  matcher: [
    /*
     * Match all routes EXCEPT:
     * - /auth/* (sign-in, verify-request, error pages)
     * - /api/auth/* (NextAuth internal routes)
     * - /_next/* (Next.js internals)
     * - /favicon.ico, /robots.txt, etc.
     */
    "/((?!auth|api/auth|_next/static|_next/image|favicon.ico|robots.txt).*)",
  ],
};
