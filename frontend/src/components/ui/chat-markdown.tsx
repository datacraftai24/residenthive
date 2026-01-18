import React from 'react';
import ReactMarkdown, { Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { cn } from '@/lib/utils';

interface ChatMarkdownProps {
  content: string;
  className?: string;
}

const chatComponents: Components = {
  // Tables - scrollable for mobile
  table: ({ children }) => (
    <div className="overflow-x-auto my-2 -mx-1">
      <table className="min-w-full border-collapse text-xs">{children}</table>
    </div>
  ),
  th: ({ children }) => (
    <th className="border border-gray-300 px-2 py-1 bg-gray-200 text-left font-semibold text-xs">{children}</th>
  ),
  td: ({ children }) => (
    <td className="border border-gray-300 px-2 py-1 text-xs">{children}</td>
  ),

  // Text with tight spacing for chat
  p: ({ children }) => <p className="my-1 leading-relaxed">{children}</p>,

  // Lists
  ul: ({ children }) => (
    <ul className="list-disc list-inside my-1 pl-2 space-y-0.5">{children}</ul>
  ),
  ol: ({ children }) => (
    <ol className="list-decimal list-inside my-1 pl-2 space-y-0.5">{children}</ol>
  ),
  li: ({ children }) => <li className="leading-snug">{children}</li>,

  // Headings scaled for chat
  h1: ({ children }) => <h1 className="text-base font-bold my-2 first:mt-0">{children}</h1>,
  h2: ({ children }) => <h2 className="text-sm font-bold my-1.5 first:mt-0">{children}</h2>,
  h3: ({ children }) => <h3 className="text-sm font-semibold my-1 first:mt-0">{children}</h3>,

  // Emphasis
  strong: ({ children }) => <strong className="font-semibold">{children}</strong>,
  em: ({ children }) => <em className="italic">{children}</em>,

  // Code
  code: ({ className, children, ...props }) => {
    const isBlock = className?.includes('language-');
    if (isBlock) {
      return (
        <code className="block bg-gray-100 p-2 rounded text-xs overflow-x-auto my-2" {...props}>
          {children}
        </code>
      );
    }
    return (
      <code className="bg-gray-200 px-1 py-0.5 rounded text-xs" {...props}>
        {children}
      </code>
    );
  },
  pre: ({ children }) => (
    <pre className="bg-gray-100 rounded overflow-x-auto my-2">{children}</pre>
  ),

  // Links - open in new tab
  a: ({ href, children }) => (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="text-blue-600 hover:text-blue-800 underline"
    >
      {children}
    </a>
  ),

  // Blockquotes
  blockquote: ({ children }) => (
    <blockquote className="border-l-2 border-blue-300 pl-3 my-2 italic text-gray-700">
      {children}
    </blockquote>
  ),

  hr: () => <hr className="my-3 border-gray-200" />,
};

export function ChatMarkdown({ content, className }: ChatMarkdownProps) {
  return (
    <div className={cn(
      'text-sm max-w-none prose prose-sm',
      'prose-p:my-1 prose-headings:my-2 prose-ul:my-1 prose-ol:my-1 prose-li:my-0',
      'overflow-x-auto',
      '[&>*:first-child]:mt-0 [&>*:last-child]:mb-0',
      className
    )}>
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={chatComponents}>
        {content}
      </ReactMarkdown>
    </div>
  );
}
