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
  title: "NextBigThing",
  description:
    "SaaS ideas sourced from people who are already asking for them, scored and linked back to the posts that prove demand.",
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
