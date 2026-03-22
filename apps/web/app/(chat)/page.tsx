"use client";

import React from "react";
import {
  ConnectionProvider,
  WalletProvider,
} from "@solana/wallet-adapter-react";
import { WalletModalProvider } from "@solana/wallet-adapter-react-ui";
import {
  PhantomWalletAdapter,
} from "@solana/wallet-adapter-wallets";
import Chat from "@/components/Chat";
import Footer from "@/components/Footer";
import Header from "@/components/Header";
import { WalletAdapterNetwork } from "@solana/wallet-adapter-base";


export default function Home() {

  const network = WalletAdapterNetwork.Devnet;
  const wallets = [new PhantomWalletAdapter()];
  const rpc_endpoint = process.env.NEXT_PUBLIC_SOLANA_RPC_URL || "https://api.devnet.solana.com";

  return (
    <ConnectionProvider endpoint={rpc_endpoint}>
      <WalletProvider wallets={wallets} autoConnect={false}>
        <WalletModalProvider>
          <div className="flex flex-col h-screen z-10 relative">
              {/* Header */}
              <div className="absolute top-0 right-0 z-50">
                <Header />
              </div>
              {/* Chat takes full space */}
              <div className="flex-1 overflow-hidden">
                <Chat />
              </div>
              {/* <Footer /> */}
          </div>
          </WalletModalProvider>
        </WalletProvider>
      </ConnectionProvider>
  );
}
