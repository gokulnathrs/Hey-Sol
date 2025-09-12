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
import "@solana/wallet-adapter-react-ui/styles.css";


export default function Home() {

  const network = WalletAdapterNetwork.Devnet;
  const wallets = [new PhantomWalletAdapter()];
  const rpc_endpoint = "https://devnet.helius-rpc.com/?api-key=ae52df4b-28e0-41d2-b733-e6eb16617512";

  return (
    <ConnectionProvider endpoint={rpc_endpoint}>
      <WalletProvider wallets={wallets} autoConnect>
        <WalletModalProvider>
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 flex flex-col h-screen z-10 relative">
              <Header />
              <div className="flex-1">
                  <Chat />
              </div>
              <Footer />
          </div>
          </WalletModalProvider>
        </WalletProvider>
      </ConnectionProvider>
  );
}
