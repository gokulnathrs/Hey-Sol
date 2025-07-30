"use client"

import React, { useEffect, useRef, useState } from 'react'
import MessageInput from './MessageInput'
import { AudioWaveform, icons, PencilRuler, Replace, Rocket, ScanSearch, Send } from 'lucide-react'
import Capsules from './ui/Capsules'
import HeySol from './HeySol'
import { WEBSOCKET_URL } from '@hey-sol/shared'

type Message = {
    id: string;
    text: string;
    sender: "user" | "bot";
    timestamp: Date;
};

const ChatInterface = () => {
  const [messages,setMessages] = useState<Message[]>([])
  const [LastMessage, setLastMessage] = React.useState<string>("")

  const quickActions = [
    {
      label : "Transfer SOL",
      icon: <Rocket className='size-4' />
    },
    {
      label : "List NFTs",
      icon: <AudioWaveform className='size-4' />
    },
    {
      label : "Swap Tokens",
      icon: <Replace className='size-4' />
    },
    {
      label : "View Transactions",
      icon: <ScanSearch className='size-4' />
    }
  ]

  const handleSendMessage = () => {
    if (LastMessage.trim() === "") return; 
    
    const userMessage : Message = {
      id: Date.now().toString(),
      text: LastMessage,
      sender: "user",
      timestamp: new Date(),
    }

    setMessages((prev) => [...prev, userMessage]);

    try {
      const ws = new WebSocket(`${WEBSOCKET_URL}/chat`)

      let accumulatedText = "";

      ws.onopen = () => {
        ws.send(JSON.stringify({ message: LastMessage }))
      }

      ws.onmessage = (event) => {
        const resp = JSON.parse(event.data)

        console.log(resp)

        if(resp.type === "stream"){
          const formattedText = resp.text;

          accumulatedText += formattedText

          // setMessages((prev) => [...prev,{
          //   id: "streaming-msg",
          //   text: accumulatedText,
          //   sender: 'bot',
          //   timestamp: new Date(),
          // }])

        } else if (resp.type === 'done') {
          setMessages((prev) => [...prev,{
            id: (Date.now() + 1).toString(),
            text: accumulatedText,
            sender: "bot",
            timestamp: new Date(),
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

    console.log("Sending message:", LastMessage);
    setLastMessage(""); // Clear the input after sending
  }

  const Greeting = () => {
    return (        
      <div className='flex flex-col justify-center gap-20 mt-32'>
        <HeySol  />
        <div>
            <p className='text-5xl font-darker-grotesque font-medium text-foreground/90 mb-4'>Welcome! Ready to explore?</p>
        </div>
      </div>  
    )
  }

  const Messages = ({ messages }: { messages: Message[] }) => {

    // const endRef = useRef<HTMLDivElement>(null)

    // // useEffect(() => {
    // //   if(endRef) {  
    // //     endRef.current?.scrollIntoView({behavior: "smooth", block:"end"})
    // //   }
    // // },[messages])
    let msgText = ""
   return (
   <div className="flex-1 overflow-y-auto max-h-[calc(100vh-220px)] py-4 pb-8">
      <div className="flex flex-col gap-1">
        {messages.map((m: any, i: number) => {

          return <p 
            key={i}
            style={{ textAlign: m.sender === 'user' ? "right" : "left" }} 
            
          >
            <p className={`${m.sender === 'user' ? 'bg-background rounded-lg my-3 inline-block p-4' : "" } `}>{m.text}</p>
          </p>
  })}
      </div>
      {/* <div ref={endRef} className='bg-amber-400 w-2 h-2 relative bottom-0 mb-2'/> */}
    </div>
  )};


  return (
    <div className="h-full flex flex-col">
      {/* Messages */}
        {messages.length === 0 ? <Greeting /> : <Messages messages={messages} />}
      
      <div className=''>
        {/* CHATBOX */}
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

        {/* QUICK ACTIONS */}
        {
          messages.length === 0 &&
          <div className='mt-4 flex flex-wrap gap-4'>
          { 
            quickActions.map((action, index) => (
              // TODO: Add random hover color to capsules
            <Capsules key={index} label={action.label} icon={action.icon ? action.icon : null}/>
            ))
          }
        </div>
        }
      </div>
    </div>
  )
}

export default ChatInterface