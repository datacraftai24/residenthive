import React, { useState, useRef, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { MessageSquare, Send, X, ChevronLeft, ChevronRight, Mail, Phone, Loader2 } from 'lucide-react';

interface Message {
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
}

interface Listing {
  mlsNumber: string;
  address: string;
  city: string;
  state: string;
  zip?: string;
  listPrice: number;
  bedrooms: number;
  bathrooms: number;
  sqft?: number;
  propertyType?: string;
  description?: string;
  features?: string;
  images?: string[];
  aiAnalysis?: {
    headline?: string;
    summary_for_buyer?: string;
    fit_score?: number;
    whats_matching?: Array<{ requirement: string; evidence: string; source: string }>;
    whats_missing?: Array<{ concern: string; severity: string; workaround?: string }>;
    red_flags?: Array<{ concern: string; quote?: string; risk_level: string; follow_up?: string }>;
    photo_headline?: string;
    photo_summary?: string;
    agent_take_ai?: string;
  };
}

interface ChatWidgetProps {
  shareId: string;
  listings: Listing[];
  buyerName: string;
  agentName: string;
  agentEmail?: string;
  agentPhone?: string;
  profileId?: number;
  agentId?: number;
}

const CHATBOT_URL = import.meta.env.VITE_CHATBOT_URL || 'http://localhost:8010';

const QUICK_ACTIONS = [
  { label: 'Tell me about the #1 pick', message: 'Tell me more about the top ranked property and why it\'s the best match for me.' },
  { label: 'Compare top 3 properties', message: 'Can you compare the top 3 properties and help me understand the key differences?' },
  { label: 'What red flags to watch?', message: 'What are the main red flags or concerns I should know about across these properties?' },
  { label: 'Best outdoor space?', message: 'Which property has the best outdoor space and yard?' },
];

export function ChatWidget({
  shareId,
  listings,
  buyerName,
  agentName,
  agentEmail,
  agentPhone,
  profileId,
  agentId,
}: ChatWidgetProps) {
  const [isOpen, setIsOpen] = useState(true);
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [messages, setMessages] = useState<Message[]>([
    {
      role: 'assistant',
      content: `Hi ${buyerName}! I'm your AI assistant. I can answer questions about the ${listings.length} properties in your report.\n\nTry asking:\n- "Why is the first property ranked highest?"\n- "Compare the top 3 properties"\n- "What concerns should I know about?"`,
      timestamp: new Date(),
    },
  ]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [sessionId, setSessionId] = useState<string>('');
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const sendMessage = async (messageText?: string) => {
    const text = messageText || input;
    if (!text.trim()) return;

    const userMessage: Message = {
      role: 'user',
      content: text,
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setInput('');
    setIsLoading(true);

    try {
      // Build context from listings for the chatbot
      const listingsContext = listings.map((l, idx) => ({
        rank: idx + 1,
        mlsNumber: l.mlsNumber,
        address: l.address,
        city: l.city,
        state: l.state,
        price: l.listPrice,
        bedrooms: l.bedrooms,
        bathrooms: l.bathrooms,
        sqft: l.sqft,
        headline: l.aiAnalysis?.headline,
        summary: l.aiAnalysis?.summary_for_buyer,
        fit_score: l.aiAnalysis?.fit_score,
        whats_matching: l.aiAnalysis?.whats_matching,
        whats_missing: l.aiAnalysis?.whats_missing,
        red_flags: l.aiAnalysis?.red_flags,
        photo_summary: l.aiAnalysis?.photo_summary,
        agent_take: l.aiAnalysis?.agent_take_ai,
      }));

      const response = await fetch(`${CHATBOT_URL}/chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          message: text,
          session_id: sessionId || undefined,
          share_id: shareId,
          client_id: profileId ? String(profileId) : undefined,
          agent_id: agentId ? String(agentId) : undefined,
          // Pass listings context as part of the message for the AI
          context: {
            buyer_name: buyerName,
            agent_name: agentName,
            listings: listingsContext,
          },
        }),
      });

      const data = await response.json();

      if (!sessionId && data.session_id) {
        setSessionId(data.session_id);
      }

      const assistantMessage: Message = {
        role: 'assistant',
        content: data.response || 'I apologize, I couldn\'t process that request. Please try again.',
        timestamp: new Date(),
      };

      setMessages((prev) => [...prev, assistantMessage]);
    } catch (error) {
      console.error('Error sending message:', error);
      const errorMessage: Message = {
        role: 'assistant',
        content: 'Sorry, I encountered an error connecting to the chat service. Please try again.',
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  // Mobile: Floating button that opens full-screen chat
  // Desktop: Fixed sidebar
  const isMobile = typeof window !== 'undefined' && window.innerWidth < 768;

  if (isMobile) {
    return (
      <>
        {/* Floating chat button */}
        {!isOpen && (
          <button
            onClick={() => setIsOpen(true)}
            className="fixed bottom-4 right-4 z-50 bg-blue-600 text-white p-4 rounded-full shadow-lg hover:bg-blue-700 transition-colors"
          >
            <MessageSquare className="h-6 w-6" />
          </button>
        )}

        {/* Full-screen chat overlay */}
        {isOpen && (
          <div className="fixed inset-0 z-50 bg-white flex flex-col">
            {/* Header */}
            <div className="flex items-center justify-between p-4 border-b bg-blue-600 text-white">
              <div className="flex items-center gap-2">
                <MessageSquare className="h-5 w-5" />
                <span className="font-semibold">AI Property Assistant</span>
              </div>
              <button onClick={() => setIsOpen(false)}>
                <X className="h-6 w-6" />
              </button>
            </div>

            {/* Messages */}
            <ScrollArea className="flex-1 p-4">
              <div className="space-y-4">
                {messages.map((msg, idx) => (
                  <div
                    key={idx}
                    className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                  >
                    <div
                      className={`max-w-[85%] rounded-lg px-4 py-2 ${
                        msg.role === 'user'
                          ? 'bg-blue-600 text-white'
                          : 'bg-gray-100 text-gray-900'
                      }`}
                    >
                      <p className="text-sm whitespace-pre-wrap">{msg.content}</p>
                    </div>
                  </div>
                ))}
                {isLoading && (
                  <div className="flex justify-start">
                    <div className="bg-gray-100 rounded-lg px-4 py-2">
                      <Loader2 className="h-5 w-5 animate-spin text-gray-500" />
                    </div>
                  </div>
                )}
                <div ref={messagesEndRef} />
              </div>
            </ScrollArea>

            {/* Quick actions */}
            {messages.length <= 1 && (
              <div className="px-4 pb-2">
                <div className="flex flex-wrap gap-2">
                  {QUICK_ACTIONS.slice(0, 2).map((action, idx) => (
                    <Button
                      key={idx}
                      variant="outline"
                      size="sm"
                      className="text-xs"
                      onClick={() => sendMessage(action.message)}
                    >
                      {action.label}
                    </Button>
                  ))}
                </div>
              </div>
            )}

            {/* Input */}
            <div className="p-4 border-t">
              <div className="flex gap-2">
                <Input
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyPress={handleKeyPress}
                  placeholder="Ask about these properties..."
                  disabled={isLoading}
                  className="flex-1"
                />
                <Button onClick={() => sendMessage()} disabled={isLoading || !input.trim()}>
                  <Send className="h-4 w-4" />
                </Button>
              </div>
            </div>

            {/* Contact agent */}
            <div className="p-4 pt-0 flex gap-2">
              {agentEmail && (
                <Button
                  variant="outline"
                  size="sm"
                  className="flex-1"
                  onClick={() => window.open(`mailto:${agentEmail}`, '_blank')}
                >
                  <Mail className="h-4 w-4 mr-2" />
                  Email Agent
                </Button>
              )}
              {agentPhone && (
                <Button
                  variant="outline"
                  size="sm"
                  className="flex-1"
                  onClick={() => window.open(`tel:${agentPhone}`, '_blank')}
                >
                  <Phone className="h-4 w-4 mr-2" />
                  Call Agent
                </Button>
              )}
            </div>
          </div>
        )}
      </>
    );
  }

  // Desktop: Fixed sidebar
  return (
    <div
      className={`hidden md:flex flex-col h-screen sticky top-0 border-l bg-white transition-all duration-300 ${
        isCollapsed ? 'w-12' : 'w-[420px]'
      }`}
    >
      {/* Collapse toggle */}
      <button
        onClick={() => setIsCollapsed(!isCollapsed)}
        className="absolute -left-3 top-1/2 transform -translate-y-1/2 bg-white border rounded-full p-1 shadow-md hover:bg-gray-50 z-10"
      >
        {isCollapsed ? (
          <ChevronLeft className="h-4 w-4" />
        ) : (
          <ChevronRight className="h-4 w-4" />
        )}
      </button>

      {isCollapsed ? (
        <div className="flex flex-col items-center pt-4">
          <MessageSquare className="h-6 w-6 text-blue-600" />
        </div>
      ) : (
        <>
          {/* Header */}
          <div className="p-4 border-b bg-gradient-to-r from-blue-600 to-blue-700 text-white">
            <div className="flex items-center gap-2">
              <MessageSquare className="h-5 w-5" />
              <span className="font-semibold">AI Property Assistant</span>
            </div>
            <p className="text-xs text-blue-100 mt-1">
              Ask questions about your {listings.length} recommended properties
            </p>
          </div>

          {/* Messages */}
          <ScrollArea className="flex-1 p-4">
            <div className="space-y-4">
              {messages.map((msg, idx) => (
                <div
                  key={idx}
                  className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                >
                  <div
                    className={`max-w-[95%] rounded-lg px-3 py-2 ${
                      msg.role === 'user'
                        ? 'bg-blue-600 text-white'
                        : 'bg-gray-100 text-gray-900'
                    }`}
                  >
                    {msg.role === 'user' ? (
                      <p className="text-sm whitespace-pre-wrap">{msg.content}</p>
                    ) : (
                      <div className="text-sm prose prose-sm max-w-none prose-p:my-1 prose-headings:my-2 prose-ul:my-1 prose-ol:my-1 prose-li:my-0 overflow-x-auto">
                        <ReactMarkdown
                          remarkPlugins={[remarkGfm]}
                          components={{
                            table: ({ children }) => (
                              <div className="overflow-x-auto my-2">
                                <table className="min-w-full border-collapse text-xs">{children}</table>
                              </div>
                            ),
                            th: ({ children }) => (
                              <th className="border border-gray-300 px-2 py-1 bg-gray-200 text-left font-semibold">{children}</th>
                            ),
                            td: ({ children }) => (
                              <td className="border border-gray-300 px-2 py-1">{children}</td>
                            ),
                            p: ({ children }) => (
                              <p className="my-1">{children}</p>
                            ),
                            ul: ({ children }) => (
                              <ul className="list-disc list-inside my-1 pl-2">{children}</ul>
                            ),
                            ol: ({ children }) => (
                              <ol className="list-decimal list-inside my-1 pl-2">{children}</ol>
                            ),
                            h1: ({ children }) => (
                              <h1 className="text-lg font-bold my-2">{children}</h1>
                            ),
                            h2: ({ children }) => (
                              <h2 className="text-base font-bold my-2">{children}</h2>
                            ),
                            h3: ({ children }) => (
                              <h3 className="text-sm font-semibold my-1">{children}</h3>
                            ),
                            strong: ({ children }) => (
                              <strong className="font-semibold">{children}</strong>
                            ),
                            code: ({ children }) => (
                              <code className="bg-gray-200 px-1 rounded text-xs">{children}</code>
                            ),
                          }}
                        >
                          {msg.content}
                        </ReactMarkdown>
                      </div>
                    )}
                  </div>
                </div>
              ))}
              {isLoading && (
                <div className="flex justify-start">
                  <div className="bg-gray-100 rounded-lg px-3 py-2">
                    <Loader2 className="h-5 w-5 animate-spin text-gray-500" />
                  </div>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>
          </ScrollArea>

          {/* Quick actions - show only initially */}
          {messages.length <= 1 && (
            <div className="px-4 pb-2 border-t pt-2">
              <p className="text-xs text-gray-500 mb-2">Quick questions:</p>
              <div className="flex flex-col gap-1">
                {QUICK_ACTIONS.map((action, idx) => (
                  <Button
                    key={idx}
                    variant="ghost"
                    size="sm"
                    className="justify-start text-xs h-auto py-1.5 text-left"
                    onClick={() => sendMessage(action.message)}
                  >
                    {action.label}
                  </Button>
                ))}
              </div>
            </div>
          )}

          {/* Input */}
          <div className="p-3 border-t">
            <div className="flex gap-2">
              <Input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyPress={handleKeyPress}
                placeholder="Ask about properties..."
                disabled={isLoading}
                className="flex-1 text-sm"
              />
              <Button
                onClick={() => sendMessage()}
                disabled={isLoading || !input.trim()}
                size="sm"
              >
                <Send className="h-4 w-4" />
              </Button>
            </div>
          </div>

          {/* Contact agent */}
          <div className="p-3 pt-0 border-t bg-gray-50">
            <p className="text-xs text-gray-500 mb-2">Questions? Contact {agentName}</p>
            <div className="flex gap-2">
              {agentEmail && (
                <Button
                  variant="outline"
                  size="sm"
                  className="flex-1 text-xs"
                  onClick={() => window.open(`mailto:${agentEmail}`, '_blank')}
                >
                  <Mail className="h-3 w-3 mr-1" />
                  Email
                </Button>
              )}
              {agentPhone && (
                <Button
                  variant="outline"
                  size="sm"
                  className="flex-1 text-xs"
                  onClick={() => window.open(`tel:${agentPhone}`, '_blank')}
                >
                  <Phone className="h-3 w-3 mr-1" />
                  Call
                </Button>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
