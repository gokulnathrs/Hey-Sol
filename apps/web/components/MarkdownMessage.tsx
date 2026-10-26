"use client";

import React, { useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Copy, Check } from "lucide-react";

type MarkdownMessageProps = {
  content: string;
  isBot?: boolean;
};

const MarkdownMessage: React.FC<MarkdownMessageProps> = ({ content, isBot }) => {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="relative group">
      {/* Copy button for bot messages */}
      {/* {isBot && (
        <button
          onClick={handleCopy}
          className="absolute -top-2 right-0 p-1.5 rounded-lg bg-foreground/5 border border-foreground/10
                     opacity-0 group-hover:opacity-100 transition-opacity duration-200
                     hover:bg-foreground/10 text-foreground/50 hover:text-foreground/80"
          title="Copy to clipboard"
        >
          {copied ? (
            <Check className="size-3.5 text-sol-green" />
          ) : (
            <Copy className="size-3.5" />
          )}
        </button>
      )} */}

      <div className="prose prose-sm dark:prose-invert max-w-none
                      prose-p:my-1.5 prose-p:leading-relaxed
                      prose-headings:my-2 prose-headings:font-semibold
                      prose-ul:my-1.5 prose-ol:my-1.5
                      prose-li:my-0.5
                      prose-code:bg-foreground/10 prose-code:px-1.5 prose-code:py-0.5 prose-code:rounded-md prose-code:text-sm prose-code:font-mono
                      prose-pre:bg-foreground/5 prose-pre:border prose-pre:border-foreground/10 prose-pre:rounded-xl prose-pre:p-4
                      prose-a:text-sol-green prose-a:no-underline hover:prose-a:underline
                      prose-blockquote:border-sol-purple/50 prose-blockquote:bg-sol-purple/5 prose-blockquote:rounded-r-lg prose-blockquote:py-1
                      prose-table:border-collapse prose-th:border prose-th:border-foreground/20 prose-th:p-2 prose-td:border prose-td:border-foreground/10 prose-td:p-2
                      prose-strong:text-foreground
                      text-foreground/90"
      >
        <ReactMarkdown remarkPlugins={[remarkGfm]}>
          {content}
        </ReactMarkdown>
      </div>
    </div>
  );
};

export default MarkdownMessage;
