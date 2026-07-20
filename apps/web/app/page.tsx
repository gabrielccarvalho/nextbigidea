import Link from "next/link";
import { AuthButtons } from "@/components/auth-buttons";

export default function Home() {
  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col justify-center px-4 py-16">
      <h1 className="text-4xl font-bold tracking-tight">
        SaaS ideas people are already asking for.
      </h1>
      <p className="mt-4 text-lg text-muted-foreground">
        Every week we scan Reddit, Hacker News, and Product Hunt for people describing a
        product that doesn&apos;t exist yet — then turn the strongest posts into scored ideas,
        each linked back to the exact posts that prove someone wants it.
      </p>
      <ul className="mt-6 space-y-1 text-sm text-muted-foreground">
        <li>&bull; 5 ideas are free to browse, no account needed to look around.</li>
        <li>
          &bull; Full access is a single R$110 card payment &mdash; lifetime access to every
          idea we&apos;ve published and every idea we publish after you buy.
        </li>
        <li>&bull; New ideas are added on a weekly cadence, not continuously.</li>
        <li>&bull; Every idea shows its sources, so you can read the original demand yourself.</li>
      </ul>
      <div className="mt-8 flex flex-col gap-4">
        <Link
          href="/ideas"
          className="w-fit rounded-md bg-foreground px-6 py-3 font-medium text-background"
        >
          Browse the ideas &rarr;
        </Link>
        <AuthButtons />
      </div>
    </main>
  );
}
