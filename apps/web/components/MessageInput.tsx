"use client"

import React, { useRef, useCallback } from 'react'

type MessageInputProps = {
    value: string;
    setValue: (value: string) => void;
    onEnter?: () => void;
    disabled?: boolean;
}

const MessageInput: React.FC<MessageInputProps> = ({ value, setValue, onEnter, disabled }: MessageInputProps) => {
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const resizeTextarea = useCallback(() => {
    const el = textareaRef.current;
    if (!el) return;
    // Reset to single row to measure scrollHeight accurately
    el.style.height = '48px';
    const newHeight = Math.min(el.scrollHeight, 200);
    el.style.height = `${newHeight}px`;
  }, []);

  return (
    <div className='rounded-[20px] flex items-center justify-center'>
        <textarea
            ref={textareaRef}
            placeholder={disabled ? 'Waiting for response...' : 'Start chatting to transfer SOL, list NFTs, swap tokens, and more...'} 
            value={value} 
            disabled={disabled}
            onChange={(e) => {
                setValue(e.target.value);
                resizeTextarea();
            }}
            onKeyDown={e => {
                if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    if (onEnter && !disabled) onEnter();
                  }
            }}
            rows={1}
            className='bg-background w-full lg:w-[850px] p-4 px-6 rounded-[20px] active:border-none focus:outline-none 
                      text-foreground/95 font-poppins text-base placeholder:text-foreground/40 resize-none min-h-[48px] max-h-[200px] overflow-auto
                      disabled:opacity-50 disabled:cursor-not-allowed transition-opacity'
            style={{
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-word',
                scrollbarGutter: 'stable',
                scrollbarWidth: 'thin',
                scrollbarColor: 'rgba(255, 255, 255, 0.2) rgba(0, 0, 0, 0.1)',
                overflowY: 'auto',
            }}
        />
    </div>
  )
}

export default MessageInput