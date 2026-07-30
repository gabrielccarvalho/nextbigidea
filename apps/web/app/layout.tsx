import type { Metadata, Viewport } from "next"
import { Geist_Mono, Figtree } from "next/font/google"

import "@workspace/ui/globals.css"
import { cn } from "@workspace/ui/lib/utils"
import { COMPANY, METADATA } from "@/lib/content"
import { SITE_URL } from "@/lib/site-url"

const figtree = Figtree({ subsets: ["latin"], variable: "--font-sans" })

const fontMono = Geist_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
})

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: METADATA.titleDefault,
    template: METADATA.titleTemplate,
  },
  description: METADATA.description,
  applicationName: COMPANY.name,
  // Every page inherits this and overrides it with its own path. Without a
  // canonical, `?page=2` and UTM-tagged shares read as separate duplicate
  // pages and split whatever ranking signal the real URL earned.
  alternates: { canonical: "/" },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      // Defaults cap Google at a thumbnail and a ~160-char snippet. This is a
      // catalog whose value is the specimen imagery and the evidence copy —
      // both are worth showing in full in the SERP.
      "max-image-preview": "large",
      "max-snippet": -1,
      "max-video-preview": -1,
    },
  },
  openGraph: {
    type: "website",
    siteName: COMPANY.name,
    locale: "en_US",
    url: "/",
    title: METADATA.socialTitle,
    description: METADATA.socialDescription,
    images: [
      {
        url: "/og.png",
        width: 1200,
        height: 630,
        alt: METADATA.ogImageAlt,
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: METADATA.socialTitle,
    description: METADATA.socialDescription,
    images: ["/og.png"],
  },
}

// The app is dark-only (`className="dark"` below is unconditional), so the
// browser chrome should match the page rather than flashing white behind it.
export const viewport: Viewport = {
  colorScheme: "dark",
  themeColor: "#121215",
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
