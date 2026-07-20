"use client";

import { useState } from "react";
import { signIn, signOut, useSession } from "@/lib/auth-client";

export function AuthButtons() {
  const { data: session } = useSession();
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);

  if (session?.user) {
    return (
      <div className="flex items-center gap-3 text-sm">
        <span className="text-muted-foreground">{session.user.email}</span>
        <button onClick={() => signOut()} className="underline">
          Sign out
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
      <button
        onClick={() => signIn.social({ provider: "google", callbackURL: "/ideas" })}
        className="rounded-md border px-4 py-2 text-sm"
      >
        Continue with Google
      </button>
      {sent ? (
        <p className="text-sm text-muted-foreground">Check your email for a sign-in link.</p>
      ) : (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            signIn.magicLink({ email, callbackURL: "/ideas" });
            setSent(true);
          }}
          className="flex gap-2"
        >
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@email.com"
            className="rounded-md border px-3 py-2 text-sm"
          />
          <button className="rounded-md bg-foreground px-4 py-2 text-sm text-background">
            Email me a link
          </button>
        </form>
      )}
    </div>
  );
}
