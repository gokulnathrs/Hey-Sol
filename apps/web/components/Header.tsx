"use client"
import { useWallet } from "@solana/wallet-adapter-react";
import { WalletMultiButton } from "@solana/wallet-adapter-react-ui";

const Header = () => {
        const { connected, publicKey } = useWallet();

return (
    <nav className='w-full flex p-4 justify-between'>
          <div className="h-full flex flex-col">
      {/* Wallet connect */}
      <div className="p-2 flex justify-end">
        <WalletMultiButton className="!bg-sol-purple !rounded-xl" />
      </div>

      {connected && publicKey && (
        <p className="text-xs text-foreground/70 px-2">
          Connected: {publicKey.toBase58().slice(0, 6)}...
          {publicKey.toBase58().slice(-4)}
        </p>
      )}

    </div>
    </nav>
)
}

export default Header