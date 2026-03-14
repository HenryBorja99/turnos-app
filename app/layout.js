import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata = {
  title: "Sistema de Turnos",
  description: "Plataforma de agendamiento de turnos para proveedores",
};

export default function RootLayout({ children }) {
  return (
    <html lang="es">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        {children}
        <footer style={{ 
          textAlign: "center", 
          padding: "1rem", 
          marginTop: "2rem",
          color: "var(--text-muted)",
          fontSize: "0.8rem",
          borderTop: "1px solid var(--border)"
        }}>
          © {new Date().getFullYear()} by Henry Borja
        </footer>
      </body>
    </html>
  );
}
