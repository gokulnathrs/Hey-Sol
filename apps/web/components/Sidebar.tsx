"use client";

import React from "react";
import { MessageSquarePlus, Trash2, MessageSquare, X, Radio } from "lucide-react";

export type ConversationMeta = {
  id: string;
  title: string;
  messageCount: number;
  created_at: string;
  updated_at: string;
};

type SidebarProps = {
  conversations: ConversationMeta[];
  activeId: string | null;
  onSelect: (id: string) => void;
  onNew: () => void;
  onDelete: (id: string) => void;
  isOpen: boolean;
  onClose: () => void;
  onOpenChannels: () => void;
};

const Sidebar: React.FC<SidebarProps> = ({
  conversations,
  activeId,
  onSelect,
  onNew,
  onDelete,
  isOpen,
  onClose,
  onOpenChannels,
}) => {
  return (
    <>
      {/* Backdrop — all screen sizes */}
      {isOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-30"
          onClick={onClose}
        />
      )}

      <aside
        className={`
          fixed z-40 top-0 left-0 h-full
          w-72 bg-background/95 backdrop-blur-xl border-r border-foreground/10
          flex flex-col transition-transform duration-300 ease-in-out
          ${isOpen ? "translate-x-0" : "-translate-x-full"}
        `}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-foreground/10">
          <h2 className="text-lg font-darker-grotesque font-semibold text-foreground/90">
            Chats
          </h2>
          <div className="flex items-center gap-1">
            <button
              onClick={onNew}
              className="p-2 rounded-lg hover:bg-foreground/5 text-foreground/60 hover:text-sol-green transition-colors"
              title="New chat"
            >
              <MessageSquarePlus className="size-5" />
            </button>
            <button
              onClick={onClose}
              className="p-2 rounded-lg hover:bg-foreground/5 text-foreground/60 transition-colors"
            >
              <X className="size-5" />
            </button>
          </div>
        </div>

        {/* Conversation list */}
        <div className="flex-1 overflow-y-auto p-2 space-y-1">
          {conversations.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-32 text-foreground/40 text-sm">
              <MessageSquare className="size-8 mb-2 opacity-50" />
              <p>No conversations yet</p>
            </div>
          ) : (
            conversations.map((conv) => (
              <div
                key={conv.id}
                onClick={() => onSelect(conv.id)}
                className={`
                  group flex items-center justify-between px-3 py-2.5 rounded-xl cursor-pointer
                  transition-all duration-200
                  ${
                    activeId === conv.id
                      ? "bg-sol-purple/15 text-foreground border border-sol-purple/30"
                      : "hover:bg-foreground/5 text-foreground/70 border border-transparent"
                  }
                `}
              >
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate font-poppins">
                    {conv.title}
                  </p>
                  <p className="text-xs text-foreground/40 mt-0.5">
                    {conv.messageCount} message{conv.messageCount !== 1 ? "s" : ""}
                  </p>
                </div>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onDelete(conv.id);
                  }}
                  className="p-1 rounded-md opacity-0 group-hover:opacity-100 hover:bg-red-500/10 hover:text-red-400 transition-all"
                  title="Delete conversation"
                >
                  <Trash2 className="size-3.5" />
                </button>
              </div>
            ))
          )}
        </div>

        {/* Footer */}
        <div className="p-3 border-t border-foreground/10 space-y-2">
          <button
            onClick={onOpenChannels}
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-foreground/60
                       hover:bg-foreground/5 hover:text-sol-green transition-colors"
          >
            <Radio className="size-4" />
            <span className="text-sm font-poppins font-medium">Channels</span>
          </button>
          <p className="text-xs text-foreground/30 text-center font-poppins">
            Built on Solana
          </p>
        </div>
      </aside>
    </>
  );
};

export default Sidebar;
