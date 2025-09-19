"use client"
import { useWallet } from "@solana/wallet-adapter-react";
import { WalletMultiButton } from "@solana/wallet-adapter-react-ui";

const Header = () => {
        const { connected, publicKey } = useWallet();

return (
    <nav className='w-full flex p-4 justify-end'> 
      {/* Wallet connect */}
      <div className="p-2 flex justify-end">
        <WalletMultiButton 
          style={{ 
            background: "linear-gradient(90deg, var(#9945ff), var(#14f195))",
            borderRadius: "12px",
          }}
        />
      </div>
    </nav>
)
}

export default Header