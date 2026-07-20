import Link from "next/link";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { safeNext } from "@/lib/safe-next";
import { Logo } from "@/components/logo";
import { LoginButton } from "@/components/login-button";
import { LOGIN } from "@/lib/content";

// Dedicated sign-in surface. `next` is where the user came from (an idea page, /account);
// safeNext() reduces it to a trusted same-origin path before it becomes the OAuth callback.
export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { next } = await searchParams;
  const callbackURL = safeNext(next);

  // Already signed in → skip the page entirely and go where they were headed.
  const session = await auth.api.getSession({ headers: await headers() });
  if (session?.user) redirect(callbackURL);

  return (
    <main className="grid min-h-screen grid-cols-1 md:grid-cols-2">
      {/* Left — the sell */}
      <section className="relative flex flex-col border-b border-border/60 bg-gradient-to-b from-muted/20 to-background px-8 py-12 md:border-b-0 md:border-r md:px-12 md:py-16">
        <Link href="/" className="w-fit text-[15px]">
          <Logo />
        </Link>

        <h1 className="mt-11 max-w-[15ch] text-3xl font-semibold leading-[1.12] tracking-tight text-balance md:text-[34px]">
          {LOGIN.headline}
        </h1>

        <ul className="mt-8 grid gap-4">
          {LOGIN.bullets.map((b) => (
            <li key={b.title} className="grid grid-cols-[22px_1fr] items-start gap-3">
              <span
                aria-hidden="true"
                className="mt-[3px] grid h-[18px] w-[18px] place-items-center rounded-full bg-primary/15 text-[11px] font-bold text-primary"
              >
                ✓
              </span>
              <span className="text-[14.5px]">
                <span className="font-medium text-foreground">{b.title}</span>
                <span className="block text-muted-foreground">{b.body}</span>
              </span>
            </li>
          ))}
        </ul>

        <div className="mt-auto pt-9">
          <span className="inline-flex items-center gap-2 rounded-full border border-border bg-white/[0.02] px-4 py-2 text-[13px] text-muted-foreground">
            {LOGIN.offer}
          </span>
        </div>
      </section>

      {/* Right — the act */}
      <section className="flex flex-col justify-center bg-background px-8 py-12 md:px-12 md:py-16">
        <div className="mx-auto w-full max-w-[340px]">
          <h2 className="text-[21px] font-semibold tracking-tight">{LOGIN.welcomeHeading}</h2>
          <p className="mb-7 mt-2 text-[14.5px] text-muted-foreground">{LOGIN.welcomeLede}</p>

          <LoginButton callbackURL={callbackURL} />

          <p className="mt-[18px] px-0.5 text-[12.5px] leading-snug text-muted-foreground/80">
            {LOGIN.reassurance}
          </p>

          <p className="mt-7 text-xs text-muted-foreground/80">
            By continuing, you agree to the{" "}
            <Link href="/terms" className="text-muted-foreground underline underline-offset-2">
              Terms
            </Link>{" "}
            and{" "}
            <Link href="/privacy" className="text-muted-foreground underline underline-offset-2">
              Privacy Policy
            </Link>
            .
          </p>
        </div>
      </section>
    </main>
  );
}
