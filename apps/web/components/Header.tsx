"use client"
import { useEffect, useState } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { WalletMultiButton } from "@solana/wallet-adapter-react-ui";
import { UserMenu } from "./UserMenu";
import { useWalletMode } from "@/lib/wallet-mode";

const Header = () => {
  const { connected } = useWallet();
  const [mounted, setMounted] = useState(false);
  const { mode } = useWalletMode();

  useEffect(() => {
    setMounted(true);
  }, []);

  return (
    <nav className="rounded-2xl border border-white/20 bg-[#0b1727]/80 p-2 shadow-[0_14px_40px_rgba(0,0,0,0.35)] backdrop-blur-xl">
      <div className="flex items-center justify-end gap-2">
        {mounted && <UserMenu />}
        <div className="min-w-[170px] p-1">
          {mounted && mode === "adapter" && (
            <WalletMultiButton
              className="!h-10 !w-full !rounded-xl !border !border-cyan-200/45 !bg-[linear-gradient(120deg,#19efac,#2fc9ff)] !px-3 !text-sm !font-semibold !text-[#062438] !transition !duration-200 hover:!brightness-105 active:!scale-[0.985]"
              style={{
                boxShadow: connected
                  ? "0 0 0 2px rgba(47,201,255,0.35), 0 12px 28px rgba(31,191,255,0.28)"
                  : "0 8px 22px rgba(31,191,255,0.18)",
              }}
            />
          )}
        </div>
      </div>
    </nav>
  );
}

export default Header