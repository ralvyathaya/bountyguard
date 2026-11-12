import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Garda — Work verified. Rewards released.",
  description:
    "An agentic bounty command center. Verify deliverables against acceptance criteria and release PayPal Sandbox rewards with a complete audit trail.",
  icons: {
    icon: [
      { url: "/icon.svg", type: "image/svg+xml" },
      { url: "/favicon.ico", sizes: "32x32" },
    ],
  },
};
export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>
        <a className="skip-link" href="#main">
          Skip to command center
        </a>
        {children}
        <noscript>
          <p className="noscript">
            Garda uses JavaScript for its interactive ledger. Enable
            JavaScript to run judge scenarios. Connected payments require
            maintainer access.
          </p>
        </noscript>
      </body>
    </html>
  );
}
