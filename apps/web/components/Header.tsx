"use client"
import { useEffect, useState } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { WalletMultiButton } from "@solana/wallet-adapter-react-ui";

const Header = () => {
  const { connected, publicKey } = useWallet();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  return (
    <nav className='flex p-3 justify-end'> 
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