import type { Metadata } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import { ToastProvider } from "@/context/ToastContext";
import { AuthProvider } from "@/context/AuthContext";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  display: "swap",
  weight: ["300", "400", "500", "600", "700", "800"],
});

const mono = JetBrains_Mono({
  variable: "--font-mono",
  subsets: ["latin"],
  display: "swap",
  weight: ["400", "500", "600"],
});

export const metadata: Metadata = {
  title: { default: "YourBuilder — Low-Code Application Platform", template: "%s · YourBuilder" },
  description: "Build forms, lookups, subforms, formulas, workflows, reports and dashboards. Firestore backed, role-based sharing.",
  applicationName: "YourBuilder",
  // favicon.ico / icon.png / apple-icon.png in src/app are picked up automatically by Next
  openGraph: { title: "YourBuilder — Low-Code Application Platform", description: "Forms, reports, workflows, dashboards and roles — designed in the browser.", siteName: "YourBuilder", type: "website" },
  themeColor: "#2563eb",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${inter.variable} ${mono.variable} h-full antialiased`} suppressHydrationWarning>
      <body className="min-h-full flex flex-col font-sans bg-slate-50 text-slate-900 selection:bg-blue-100 selection:text-blue-900">
        <ToastProvider>
          <AuthProvider>{children}</AuthProvider>
        </ToastProvider>
      </body>
    </html>
  );
}
