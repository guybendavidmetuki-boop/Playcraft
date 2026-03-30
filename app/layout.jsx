import "./globals.css";

export const metadata = {
  title: "Playcraft",
  description: "Build and refine games with AI"
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
