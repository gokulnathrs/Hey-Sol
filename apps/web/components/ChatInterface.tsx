"use client"

import React, { useState } from 'react'
import MessageInput from './MessageInput'
import { AudioWaveform, PencilRuler, Replace, Rocket, ScanSearch, Send } from 'lucide-react'
import Capsules from './ui/Capsules'
import HeySol from './HeySol'
import { WEBSOCKET_URL } from '@hey-sol/shared'
import { useWallet } from '@solana/wallet-adapter-react'
import { Connection, VersionedTransaction } from "@solana/web3.js";
import NFTCard, { NFT } from './NFTCard';

type Message = {
    id: string;
    text: string;
    sender: "user" | "bot";
    timestamp: Date;
    signablePayload?: SignablePayload;
    context?: string;
    nfts?: NFT[]; 
};

export interface SignablePayload {
  type: "transaction";              // always transaction
  action: string;                   // e.g., "send-sol", "swap-token", "list-nft"
  txMessageBase64: string;          // unsigned transaction in base64
  metadata?: Record<string, any>;   // optional (NFT id, token symbol, price, etc.)
}

const ChatInterface = () => {
  const { sendTransaction, publicKey } = useWallet();
  const [messages,setMessages] = useState<Message[]>([])
  const [LastMessage, setLastMessage] = React.useState<string>("")
  const [preparedTx, setPreparedTx] = useState<SignablePayload>()
  const [nfts, setNfts] = useState<NFT[]>([]);

  const quickActions = [
    { label : "Send SOL", icon: <Rocket className='size-4' /> },
    { label : "List NFTs", icon: <AudioWaveform className='size-4' /> },
    { label : "Get Balance", icon: <Replace className='size-4' /> },
    { label : "View Transactions", icon: <ScanSearch className='size-4' /> }
  ]

  const handleSignAndSend = async (payload: SignablePayload) => {
  if (!payload.txMessageBase64) {
    console.log("No transaction to sign ");
    return; 
  };

  if (!publicKey) {
    alert("Please connect your wallet to sign the transaction.");
    return;
  }

  console.log("Signing and sending transaction...", payload);
  
  // Decode base64 to VersionedTransaction
  const txBytes = Buffer.from(payload.txMessageBase64, "base64");
  const transaction = VersionedTransaction.deserialize(txBytes);

  try {
    const connection = new Connection("https://devnet.helius-rpc.com/?api-key=ae52df4b-28e0-41d2-b733-e6eb16617512");
    const sig = await sendTransaction(transaction, connection);
    setMessages((prev) => [
    ...prev,
    {
      id: Date.now().toString(),
      text: `Transaction successful!\nSignature: ${sig}`,
      sender: "bot",
      timestamp: new Date(),
    },
  ]);
  } catch (err) {
    console.error("Transaction failed:", err);
  }
};


  const handleSendMessage = () => {
    if (LastMessage.trim() === "") return; 
    
    const userMessage: Message = {
      id: Date.now().toString(),
      text: LastMessage,
      sender: "user",
      timestamp: new Date(),
      context: publicKey ? `sender=${publicKey.toBase58()}` : "no-wallet"
    }

    setMessages((prev) => [...prev, userMessage]);

    try {
      const ws = new WebSocket(`${WEBSOCKET_URL}/chat`)
      let accumulatedText = "";
      let txBase64: string | null = null;

      ws.onopen = () => {
        ws.send(JSON.stringify({
          message: LastMessage,
          context: publicKey ? `sender=${publicKey.toBase58()}` : "no-wallet"
        }))
      }

      ws.onmessage = (event) => {
        const resp = JSON.parse(event.data)
        if(resp.type === "stream"){
          accumulatedText += resp.text;

        } else if (resp.type === "txn_signing") {
            // Save prepared tx for signing
            setPreparedTx(resp.transaction.txMessageBase64);

            setMessages((prev) => [
              ...prev,
              {
                id: Date.now().toString(),
                text: resp.transaction.message || `📝 Prepared ${resp.transaction.action} transaction for ${resp.transaction.metadata.amount} SOL → ${resp.transaction.metadata.recipient}`,
                sender: "bot",
                timestamp: new Date(),
                signablePayload: resp.transaction
              },
            ]);
            return;

        } else if (resp.type === "nft_list") {
          setMessages((prev) => [
            ...prev,
            {
              id: Date.now().toString(),
              text: `I found ${resp.nfts.length} NFTs in your wallet.`,
              sender: "bot",
              timestamp: new Date(),
              nfts: resp.nfts,
            },
          ]);
          return;
        } else if (resp.type === 'done' && (resp.message || accumulatedText)) {
          setMessages((prev) => [...prev,{
            id: (Date.now() + 1).toString(),
            text: accumulatedText || "Prepared transaction",
            sender: "bot",
            timestamp: new Date(),
            txMessageBase64: txBase64 || undefined, // attach tx if exists
          }])
          ws.close()
        }
      }

      ws.onerror = (error) => {
        console.error("WebSocket error:", error);
        setMessages((prev) => [...prev, {
            id: (Date.now() + 1).toString(),
            text: "Error connecting to chat service. Please try again later.",
            sender: "bot",
            timestamp: new Date(),
        }]);
      }

    } catch (error) {
      console.error("Error on chat streaming...",error)
    } 

    setLastMessage(""); // Clear the input after sending
  }

  const Greeting = () => (
    <div className='flex flex-col justify-center gap-20 mt-32'>
      <HeySol  />
      <div>
          <p className='text-5xl font-darker-grotesque font-medium text-foreground/90 mb-4'>
            Welcome! Ready to explore?
          </p>
      </div>
    </div>  
  )

  const Messages = ({ messages }: { messages: Message[] }) => (
   <div className="flex-1 overflow-y-auto max-h-[calc(100vh-220px)] py-4 pb-8">
      <div className="flex flex-col gap-1">
        {messages.map((m, i) => (
          <div key={i} className={`my-2 ${m.sender === "user" ? "text-right" : "text-left"}`}>
            <div className={`${m.sender === 'user' ? 'bg-background' : 'bg-background'} rounded-lg p-3 inline-block `}>
              <p>{m.text}</p>

              {m.signablePayload && (
                <button
                  onClick={() => handleSignAndSend(m.signablePayload!)}
                  className="mt-2 px-3 py-1 bg-purple-600 text-white rounded text-sm cursor-pointer"
                >
                  Sign & Confirm {m.signablePayload.action}
                </button>
              )}
              {/* Render NFT cards if present in this message */}
              {m.nfts && m.nfts.length > 0 && (
                <div className="mt-4 flex gap-2 overflow-x-auto max-w-[800px]">
                  {m.nfts.map((nft, idx) => (
                    <NFTCard key={nft.mint + idx} nft={nft} />
                  ))}
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );

  return (
    <div className="h-full flex flex-col">
      {messages.length === 0 ? <Greeting /> : <Messages messages={messages} />}
      
      {/* Input */}
      <div className=''>
        <div className={`bg-background/70 sol-gradient rounded-[20px] overflow-hidden `}>
          <div className='bg-background/40  p-[1px]  overflow-hidden'>
            <div className='bg-background rounded-[19px]'>
              <MessageInput setValue={setLastMessage} value={LastMessage} onEnter={handleSendMessage}/>
              <div className='flex justify-end items-center gap-1.5 pt-3 pr-2.5 pb-2.5'>
                <button className='p-2 hover:bg-foreground/3 text-foreground/60 hover:text-sol-purple/70 rounded-[8px]'>
                  <PencilRuler />
                </button>
                <button onClick={handleSendMessage} className='p-2 hover:bg-foreground/3 text-foreground/60 hover:text-sol-green/70 rounded-[8px]'>
                  <Send />
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Quick Actions */}
        {messages.length === 0 && (
          <div className='mt-4 flex flex-wrap gap-4'>
            {quickActions.map((action, index) => (
              <Capsules key={index} label={action.label} icon={action.icon}/>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

export default ChatInterface
