export const metadata = {
  title: "Pogo Stickman",
  description: "A simple Happy Wheels-like level with Pogo Stickman",
};

import "./globals.css";

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        {children}
      </body>
    </html>
  );
}
