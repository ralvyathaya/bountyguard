import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "BountyGuard — Work verified. Rewards released.",
  description:
    "An agentic bounty command center. Verify deliverables against acceptance criteria and release PayPal Sandbox rewards with a complete audit trail.",
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
            BountyGuard uses JavaScript for its interactive ledger. Enable
            JavaScript to run judge scenarios. Connected payments require
            maintainer access.
          </p>
        </noscript>
      </body>
    </html>
  );
}
