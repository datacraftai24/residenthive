import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { 
  TrendingUp, 
  Building, 
  Home, 
  DollarSign, 
  FileText,
  Loader2,
  Send,
  CheckCircle,
  AlertCircle,
  Target,
  Calculator
} from "lucide-react";
import { type BuyerProfile } from "@shared/schema";

interface InvestmentStrategyProps {
  profile: BuyerProfile;
}

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
}

interface InvestmentContext {
  investorType?: string;
  investmentCapital?: number;
  location?: string;
  targetMonthlyReturn?: number;
  messages: string[];
}

export default function InvestmentStrategy({ profile }: InvestmentStrategyProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [context, setContext] = useState<InvestmentContext>({ messages: [] });
  const [strategyId, setStrategyId] = useState<string | null>(null);
  const [strategyStatus, setStrategyStatus] = useState<'idle' | 'generating' | 'complete' | 'failed'>('idle');
  const [strategyDocument, setStrategyDocument] = useState<string | null>(null);

  // Pre-fill with profile data if investor
  useState(() => {
    if (profile.buyerType === 'investor' && profile.investmentCapital) {
      const initialMessage = `I have $${profile.investmentCapital.toLocaleString()} to invest in ${profile.location || 'the area'}. ${
        profile.investorType ? `I'm interested in ${profile.investorType.replace('_', ' ')} investments.` : ''
      }`;
      handleSendMessage(initialMessage);
    } else if (!messages.length) {
      // Add welcome message
      setMessages([{
        role: 'assistant',
        content: "Hi! I'm your investment strategy advisor. Tell me about your investment goals - how much capital do you have available and what type of real estate investments are you interested in?",
        timestamp: new Date()
      }]);
    }
  });

  const handleSendMessage = async (messageText?: string) => {
    const message = messageText || input.trim();
    if (!message) return;

    // Add user message
    const userMessage: ChatMessage = {
      role: 'user',
      content: message,
      timestamp: new Date()
    };
    setMessages(prev => [...prev, userMessage]);
    setInput("");
    setIsLoading(true);

    try {
      const response = await fetch('/api/investment-chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message,
          context,
          sessionId: strategyId || undefined
        })
      });

      if (!response.ok) throw new Error('Failed to process message');
      
      const data = await response.json();
      
      // Update context
      setContext(data.context || context);
      
      // Add assistant response
      const assistantMessage: ChatMessage = {
        role: 'assistant',
        content: data.message,
        timestamp: new Date()
      };
      setMessages(prev => [...prev, assistantMessage]);

      // Check if strategy generation started
      if (data.type === 'ready_to_analyze' && data.strategyId) {
        setStrategyId(data.strategyId);
        setStrategyStatus('generating');
        pollStrategyStatus(data.strategyId);
      }

    } catch (error) {
      console.error('Chat error:', error);
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: "I apologize, but I encountered an error processing your message. Please try again.",
        timestamp: new Date()
      }]);
    } finally {
      setIsLoading(false);
    }
  };

  const pollStrategyStatus = async (sessionId: string) => {
    const checkStatus = async () => {
      try {
        const response = await fetch(`/api/investment-strategy/${sessionId}`);
        if (!response.ok) throw new Error('Failed to check status');
        
        const data = await response.json();
        
        if (data.status === 'complete') {
          setStrategyStatus('complete');
          setStrategyDocument(data.document);
          setMessages(prev => [...prev, {
            role: 'assistant',
            content: "✅ Your investment strategy is ready! You can view the comprehensive analysis below.",
            timestamp: new Date()
          }]);
        } else if (data.status === 'failed') {
          setStrategyStatus('failed');
          setMessages(prev => [...prev, {
            role: 'assistant',
            content: "❌ Strategy generation failed. Please try again or contact support.",
            timestamp: new Date()
          }]);
        } else {
          // Continue polling
          setTimeout(checkStatus, 5000);
        }
      } catch (error) {
        console.error('Status check error:', error);
        setStrategyStatus('failed');
      }
    };

    // Start polling after 5 seconds
    setTimeout(checkStatus, 5000);
  };

  const investorTypeIcons = {
    rental_income: <Home className="h-4 w-4" />,
    multi_unit: <Building className="h-4 w-4" />,
    flip: <TrendingUp className="h-4 w-4" />,
    house_hack: <Home className="h-4 w-4" />
  };

  return (
    <div className="space-y-6">
      {/* Investment Overview Card */}
      {profile.buyerType === 'investor' && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <DollarSign className="h-5 w-5" />
              Investment Profile
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {profile.investorType && (
                <div className="flex items-center gap-2">
                  {investorTypeIcons[profile.investorType as keyof typeof investorTypeIcons]}
                  <div>
                    <p className="text-sm text-gray-600">Investor Type</p>
                    <p className="font-medium">{profile.investorType.replace('_', ' ').toUpperCase()}</p>
                  </div>
                </div>
              )}
              
              {profile.investmentCapital && (
                <div className="flex items-center gap-2">
                  <DollarSign className="h-4 w-4 text-gray-500" />
                  <div>
                    <p className="text-sm text-gray-600">Available Capital</p>
                    <p className="font-medium">${profile.investmentCapital.toLocaleString()}</p>
                  </div>
                </div>
              )}

              {profile.targetMonthlyReturn && (
                <div className="flex items-center gap-2">
                  <Target className="h-4 w-4 text-gray-500" />
                  <div>
                    <p className="text-sm text-gray-600">Target Monthly Return</p>
                    <p className="font-medium">${profile.targetMonthlyReturn.toLocaleString()}</p>
                  </div>
                </div>
              )}

              {profile.targetCapRate && (
                <div className="flex items-center gap-2">
                  <Calculator className="h-4 w-4 text-gray-500" />
                  <div>
                    <p className="text-sm text-gray-600">Target Cap Rate</p>
                    <p className="font-medium">{profile.targetCapRate}%</p>
                  </div>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Chat Interface */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <span className="flex items-center gap-2">
              <FileText className="h-5 w-5" />
              Investment Strategy Assistant
            </span>
            {strategyStatus === 'generating' && (
              <Badge variant="secondary" className="flex items-center gap-1">
                <Loader2 className="h-3 w-3 animate-spin" />
                Generating Strategy...
              </Badge>
            )}
            {strategyStatus === 'complete' && (
              <Badge variant="default" className="flex items-center gap-1">
                <CheckCircle className="h-3 w-3" />
                Strategy Ready
              </Badge>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {/* Chat Messages */}
          <div className="h-96 overflow-y-auto mb-4 space-y-4 p-4 bg-gray-50 rounded-lg">
            {messages.map((msg, idx) => (
              <div
                key={idx}
                className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                <div
                  className={`max-w-[80%] rounded-lg p-3 ${
                    msg.role === 'user'
                      ? 'bg-blue-500 text-white'
                      : 'bg-white border border-gray-200'
                  }`}
                >
                  <p className="text-sm whitespace-pre-wrap">{msg.content}</p>
                  <p className={`text-xs mt-1 ${
                    msg.role === 'user' ? 'text-blue-100' : 'text-gray-400'
                  }`}>
                    {msg.timestamp.toLocaleTimeString()}
                  </p>
                </div>
              </div>
            ))}
            {isLoading && (
              <div className="flex justify-start">
                <div className="bg-white border border-gray-200 rounded-lg p-3">
                  <Loader2 className="h-4 w-4 animate-spin" />
                </div>
              </div>
            )}
          </div>

          {/* Input Area */}
          <div className="flex gap-2">
            <Textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyPress={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleSendMessage();
                }
              }}
              placeholder="Tell me about your investment goals..."
              className="flex-1"
              rows={2}
              disabled={isLoading || strategyStatus === 'generating'}
            />
            <Button
              onClick={() => handleSendMessage()}
              disabled={isLoading || !input.trim() || strategyStatus === 'generating'}
            >
              <Send className="h-4 w-4" />
            </Button>
          </div>

          {/* Quick Actions */}
          {messages.length === 1 && !profile.investorType && (
            <div className="mt-4">
              <p className="text-sm text-gray-600 mb-2">Quick Start:</p>
              <div className="flex flex-wrap gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleSendMessage("I want to invest in rental properties for passive income")}
                >
                  Rental Income
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleSendMessage("I'm looking for multi-unit properties to maximize cash flow")}
                >
                  Multi-Unit
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleSendMessage("I want to flip houses for quick profits")}
                >
                  House Flipping
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleSendMessage("I'm a first-time buyer interested in house hacking")}
                >
                  House Hacking
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Strategy Document */}
      {strategyDocument && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              <span className="flex items-center gap-2">
                <FileText className="h-5 w-5" />
                Your Investment Strategy
              </span>
              <Button size="sm" variant="outline">
                Download PDF
              </Button>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="prose prose-sm max-w-none">
              <div className="bg-white p-6 rounded-lg border whitespace-pre-wrap font-mono text-sm">
                {strategyDocument}
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Info Alert */}
      {!profile.investorType && profile.buyerType !== 'investor' && (
        <Alert>
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            This profile is not marked as an investor. The investment strategy assistant can still help create an investment plan based on the profile's budget and preferences.
          </AlertDescription>
        </Alert>
      )}
    </div>
  );
}