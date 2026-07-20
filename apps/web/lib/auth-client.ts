import { createAuthClient } from "better-auth/react";

// Google-only: no client plugins. `signIn.social({ provider: "google" })` is all we call.
export const authClient = createAuthClient({
  baseURL: process.env.NEXT_PUBLIC_APP_URL,
});

export const { signIn, signOut, useSession } = authClient;
