import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { db } from "@/app/lib/db";
import * as schema from "@/app/lib/db/schema";

// Better Auth over the same Drizzle DB as the dashboards table — so
// dashboards.ownerId → user.id is a real FK. Google is the ONLY sign-in method:
// email/password is off, and sign-in only gates writes (option B — browsing,
// preview, and tinker stay open). Google turns on once its client id/secret env
// vars are present.
export const auth = betterAuth({
  database: drizzleAdapter(db, { provider: "pg", schema }),
  emailAndPassword: { enabled: false },
  socialProviders: {
    ...(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET
      ? {
          google: {
            clientId: process.env.GOOGLE_CLIENT_ID,
            clientSecret: process.env.GOOGLE_CLIENT_SECRET,
          },
        }
      : {}),
  },
});
