import type { Metadata } from "next";
import { Poppins, Darker_Grotesque } from "next/font/google";
import "./globals.css";
import "@solana/wallet-adapter-react-ui/styles.css";


const darketrGrotesque = Darker_Grotesque({
  weight: ["300", "400", "500", "600", "700", "800", "900"],
  subsets: ["latin"],
  variable: "--font-darker-grotesque",
})

const poppins = Poppins({
  weight: ["100", "200", "300", "400", "500", "600", "700", "800", "900"],
  subsets: ["latin"],
  variable: "--font-poppins",
})

export const metadata: Metadata = {
  title: "  HeySOL",
  description: "Your chat-based gateway to Solana actions",
};


export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`bg-background text-foreground overflow-y-hidden ${darketrGrotesque.variable} ${poppins.variable}`}
      >
        <div className="absolute inset-0 grains" >

        </div>
        <div className="fixed mx-auto top-[-150px] left-0 right-0  h-[300px] w-[600px] rounded-full opacity-75 blur-[200px]
        bg-gradient-to-r from-[#9945FF] to-[#14F195] -z-10" />
        <div className="z-10">
          {children}
        </div>
        <div className="fixed mx-auto bottom-[-150px] left-0 right-0  h-[300px] w-[600px] rounded-full opacity-75 blur-[200px]
        bg-gradient-to-r from-[#9945FF] to-[#14F195] -z-10" />
        <div className="min-h-full min-w-full bg-background/1 backdrop-blur-3xl absolute top-0 left-0 -z-1"/>
      </body>
    </html>
  );
}
