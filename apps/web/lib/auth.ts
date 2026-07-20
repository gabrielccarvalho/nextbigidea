import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { magicLink } from "better-auth/plugins";
import { db, schema } from "@workspace/db";
import { Resend } from "resend";

export const auth = betterAuth({
  database: drizzleAdapter(db, { provider: "pg", schema }),
  baseURL: process.env.BETTER_AUTH_URL,
  secret: process.env.BETTER_AUTH_SECRET,
  socialProviders: {
    google: {
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
    },
  },
  plugins: [
    magicLink({
      sendMagicLink: async ({ email, url }) => {
        // Constructed lazily, NOT at module scope. `new Resend()` throws
        // synchronously when RESEND_API_KEY is unset, and at module scope that
        // throw fires during `next build`'s page-data collection — failing the
        // ENTIRE app build, not just auth, on any deploy that hasn't set the
        // key yet. Inside the callback it can only fail when a mail is sent.
        const resend = new Resend(process.env.RESEND_API_KEY);
        await resend.emails.send({
          from: process.env.EMAIL_FROM ?? "login@yourdomain.com",
          to: email,
          subject: "Your sign-in link",
          text: `Click to sign in: ${url}`,
        });
      },
    }),
  ],
});
