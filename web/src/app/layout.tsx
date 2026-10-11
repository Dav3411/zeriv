import type { Metadata, Viewport } from "next";
import {
  Geist,
  Geist_Mono,
  Noto_Sans_KR,
  Space_Grotesk,
  Poppins,
  Nanum_Myeongjo,
  Black_Han_Sans,
  IBM_Plex_Sans_KR,
} from "next/font/google";
import { NextIntlClientProvider } from "next-intl";
import { getLocale, getMessages } from "next-intl/server";
import "./globals.css";
import { AuthProvider } from "@/components/AuthProvider";
import { LocaleProvider } from "@/components/LocaleProvider";
import { JobQueueProvider } from "@/components/JobQueueProvider";
import { ThemeProvider } from "@/components/ThemeProvider";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const notoSansKR = Noto_Sans_KR({
  variable: "--font-noto-sans-kr",
  subsets: ["latin"],
  weight: ["400", "500", "700"],
});

const spaceGrotesk = Space_Grotesk({
  variable: "--font-space-grotesk",
  subsets: ["latin"],
  weight: ["300", "400", "500", "700"],
});

const poppins = Poppins({
  variable: "--font-poppins",
  subsets: ["latin"],
  weight: ["300", "400", "500", "600"],
});

const nanumMyeongjo = Nanum_Myeongjo({
  variable: "--font-nanum-myeongjo",
  subsets: ["latin"],
  weight: ["400", "700", "800"],
});

const blackHanSans = Black_Han_Sans({
  variable: "--font-black-han-sans",
  subsets: ["latin"],
  weight: ["400"],
});

const ibmPlexSansKR = IBM_Plex_Sans_KR({
  variable: "--font-ibm-plex-sans-kr",
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700"],
});

export const viewport: Viewport = {
  themeColor: "#000000",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  colorScheme: "light",
};

export const metadata: Metadata = {
  metadataBase: new URL(
    process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000",
  ),
  title: "Zeriv - AI Product Image Studio",
  description:
    "Generate professional product images with AI. No studio or photographer needed.",
  alternates: {
    canonical: "/",
    languages: {
      en: "/",
      ko: "/",
    },
  },
  openGraph: {
    title: "Zeriv - AI Product Image Studio",
    description:
      "Generate professional product images with AI. No studio or photographer needed.",
    type: "website",
    url: "http://localhost:3000",
    images: [
      {
        url: "/logo.png",
        width: 630,
        height: 630,
        alt: "Zeriv",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Zeriv - AI Product Image Studio",
    description:
      "Generate professional product images with AI. No studio or photographer needed.",
    images: ["/logo.png"],
  },
  verification: {
    other: {
      "naver-site-verification": "6762c020fe582cada3eb46c3da51bbe5c9141969",
    },
  },
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const locale = await getLocale();
  const messages = await getMessages();

  return (
    // suppressHydrationWarning: next-themes 가 클라이언트에서 <html> 의 class 를
    // 동기적으로 주입하므로, SSR 마크업과 차이가 발생할 수 있다. 이를 무시.
    <html lang={locale} suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} ${notoSansKR.variable} ${spaceGrotesk.variable} ${poppins.variable} ${nanumMyeongjo.variable} ${blackHanSans.variable} ${ibmPlexSansKR.variable} antialiased`}
        suppressHydrationWarning
      >
        <ThemeProvider>
          <NextIntlClientProvider messages={messages}>
            <AuthProvider>
              <LocaleProvider>
                <JobQueueProvider>{children}</JobQueueProvider>
              </LocaleProvider>
            </AuthProvider>
          </NextIntlClientProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
