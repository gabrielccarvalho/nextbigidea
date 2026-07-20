import type { Metadata } from "next"
import { Geist_Mono, Figtree } from "next/font/google"

import "@workspace/ui/globals.css"
import { cn } from "@workspace/ui/lib/utils"

const figtree = Figtree({ subsets: ["latin"], variable: "--font-sans" })

const fontMono = Geist_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
})

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"),
  title: {
    default: "NextBigThing — SaaS ideas people are already asking for",
    template: "%s · NextBigThing",
  },
  description:
    "Every week we read public posts across Reddit, Hacker News, and Product Hunt for people describing products that don't exist yet — then score them and link back to the posts that prove demand.",
  openGraph: {
    type: "website",
    siteName: "NextBigThing",
    title: "SaaS ideas people are already asking for",
    description:
      "Scored, sourced demand signals from Reddit, Hacker News, and Product Hunt. Every idea links back to the posts behind it.",
    images: [
      {
        url: "/og.png",
        width: 1200,
        height: 630,
        alt: "NextBigThing — scored SaaS ideas with links to the posts that prove demand",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "SaaS ideas people are already asking for",
    description:
      "Scored, sourced demand signals from Reddit, Hacker News, and Product Hunt.",
    images: ["/og.png"],
  },
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html
      lang="en"
      className={cn("dark antialiased", fontMono.variable, "font-sans", figtree.variable)}
    >
      <body>{children}</body>
    </html>
  )
}
