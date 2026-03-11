"use client"
import { useEffect, useState } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { WalletMultiButton } from "@solana/wallet-adapter-react-ui";
import { UserMenu } from "./UserMenu";

const Header = () => {
  const { connected, publicKey } = useWallet();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  return (
    <nav className='flex p-3 justify-end items-center gap-3'> 
      {/* Auth / user session */}
      {mounted && <UserMenu />}
      {/* Optional: keep Phantom wallet button for power users who want self-custody */}
      <div className="p-1">
        {mounted && (
          <WalletMultiButton 
            style={{ 
              background: "linear-gradient(90deg, #9945ff, #14f195)",
              borderRadius: "12px",
              fontSize: "14px",
              height: "40px",
            }}
          />
        )}
      </div>
    </nav>
  );
}

export default Header