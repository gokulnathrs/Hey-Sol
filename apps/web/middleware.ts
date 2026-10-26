/**
 * Next.js middleware — require sign-in for app pages and protected APIs.
 */
export { auth as middleware } from "@/auth";

export const config = {
  matcher: [
    "/((?!auth|api/auth|_next/static|_next/image|favicon.ico|robots.txt).*)",
  ],
};
