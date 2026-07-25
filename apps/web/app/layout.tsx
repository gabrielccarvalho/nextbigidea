import type { Metadata } from "next"
import { Geist_Mono, Figtree } from "next/font/google"

import "@workspace/ui/globals.css"
import { cn } from "@workspace/ui/lib/utils"
import { COMPANY, METADATA } from "@/lib/content"

const figtree = Figtree({ subsets: ["latin"], variable: "--font-sans" })

const fontMono = Geist_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
})

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"),
  title: {
    default: METADATA.titleDefault,
    template: METADATA.titleTemplate,
  },
  description: METADATA.description,
  openGraph: {
    type: "website",
    siteName: COMPANY.name,
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
