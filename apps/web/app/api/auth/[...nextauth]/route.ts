/**
 * NextAuth v5 catch-all API route
 * Handles GET/POST for /api/auth/[...nextauth]
 */
import { handlers } from "@/auth";
export const { GET, POST } = handlers;
