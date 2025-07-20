import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { Loader2, MessageCircle, Copy, CheckCircle, Share2 } from 'lucide-react';

interface ChatbotShareData {
  profileId: number;
  agentName?: string;
  agentEmail?: string;
  agentPhone?: string;
  customMessage?: string;
  chatbotTitle?: string;
  chatbotDescription?: string;
  expiresInDays?: number;
}

interface ShareableChatbot {
  shareId: string;
  profileId: number;
  shareUrl: string;
  agentName?: string;
  agentEmail?: string;
  agentPhone?: string;
  customMessage?: string;
  chatbotTitle: string;
  chatbotDescription: string;
  expiresAt?: string;
  isActive: boolean;
}

interface ChatbotShareButtonProps {
  profileId: number;
  profileName: string;
}

export default function ChatbotShareButton({ profileId, profileName }: ChatbotShareButtonProps) {
  const [showModal, setShowModal] = useState(false);
  const [shareData, setShareData] = useState<Partial<ChatbotShareData>>({
    agentName: "",
    agentEmail: "",
    agentPhone: "",
    customMessage: `Hi ${profileName}! I've created a personalized AI assistant just for you to help with your real estate search. This chatbot knows your preferences and can help you find the perfect home.`,
    chatbotTitle: "Your Personal Real Estate Assistant",
    chatbotDescription: "Ask me anything about properties, neighborhoods, or real estate! I'm here to help you find your perfect home.",
    expiresInDays: 30
  });
  const [generatedLink, setGeneratedLink] = useState<ShareableChatbot | null>(null);
  const [copied, setCopied] = useState(false);
  const { toast } = useToast();

  // Create shareable chatbot mutation
  const shareMutation = useMutation({
    mutationFn: async (data: ChatbotShareData): Promise<ShareableChatbot> => {
      const response = await fetch("/api/chatbot/share", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!response.ok) throw new Error("Failed to create shareable chatbot");
      return response.json();
    },
    onSuccess: (result: ShareableChatbot) => {
      setGeneratedLink(result);
      toast({
        title: "Personal AI assistant created!",
        description: "Shareable chatbot link generated successfully",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to create shareable chatbot",
        variant: "destructive",
      });
    }
  });

  const handleCreateShare = () => {
    shareMutation.mutate({
      profileId,
      ...shareData
    } as ChatbotShareData);
  };

  const copyToClipboard = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
      toast({ title: "Copied to clipboard!" });
    } catch (error) {
      toast({ 
        title: "Failed to copy", 
        description: "Please copy the link manually",
        variant: "destructive" 
      });
    }
  };

  const generateWhatsAppLink = () => {
    if (!generatedLink) return;
    
    const message = `Hi ${profileName}! 

I've created a personalized AI assistant just for you to help with your real estate search. 

${shareData.customMessage || 'This chatbot knows your preferences and can help you find the perfect home.'}

Chat with your personal AI assistant: ${generatedLink.shareUrl}

${shareData.agentName ? `Best regards,\n${shareData.agentName}` : 'Best regards'}`;

    const whatsappUrl = `https://wa.me/?text=${encodeURIComponent(message)}`;
    window.open(whatsappUrl, '_blank');
  };

  return (
    <>
      <Button
        onClick={() => setShowModal(true)}
        variant="outline"
        className="w-full"
      >
        <MessageCircle className="w-4 h-4 mr-2" />
        Create AI Assistant
      </Button>

      {showModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <Card className="w-full max-w-md">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <MessageCircle className="w-5 h-5" />
                Create AI Assistant for {profileName}
              </CardTitle>
              <CardDescription>
                Create a personalized chatbot that knows {profileName}'s preferences and can help them find their perfect home.
              </CardDescription>
            </CardHeader>

            <CardContent className="space-y-4">
              {!generatedLink ? (
                <>
                  {/* Agent Information */}
                  <div className="space-y-3">
                    <div>
                      <Label htmlFor="agentName">Agent Name</Label>
                      <Input
                        id="agentName"
                        value={shareData.agentName || ""}
                        onChange={(e) => setShareData(prev => ({ ...prev, agentName: e.target.value }))}
                        placeholder="Your name"
                      />
                    </div>
                    <div>
                      <Label htmlFor="agentEmail">Agent Email</Label>
                      <Input
                        id="agentEmail"
                        type="email"
                        value={shareData.agentEmail || ""}
                        onChange={(e) => setShareData(prev => ({ ...prev, agentEmail: e.target.value }))}
                        placeholder="your.email@example.com"
                      />
                    </div>
                    <div>
                      <Label htmlFor="agentPhone">Agent Phone</Label>
                      <Input
                        id="agentPhone"
                        value={shareData.agentPhone || ""}
                        onChange={(e) => setShareData(prev => ({ ...prev, agentPhone: e.target.value }))}
                        placeholder="(555) 123-4567"
                      />
                    </div>
                  </div>

                  {/* Chatbot Customization */}
                  <div className="space-y-3">
                    <div>
                      <Label htmlFor="chatbotTitle">AI Assistant Title</Label>
                      <Input
                        id="chatbotTitle"
                        value={shareData.chatbotTitle || ""}
                        onChange={(e) => setShareData(prev => ({ ...prev, chatbotTitle: e.target.value }))}
                        placeholder="Your Personal Real Estate Assistant"
                      />
                    </div>
                    <div>
                      <Label htmlFor="chatbotDescription">AI Assistant Description</Label>
                      <Textarea
                        id="chatbotDescription"
                        value={shareData.chatbotDescription || ""}
                        onChange={(e) => setShareData(prev => ({ ...prev, chatbotDescription: e.target.value }))}
                        placeholder="Ask me anything about properties, neighborhoods, or real estate!"
                        rows={2}
                      />
                    </div>
                  </div>

                  {/* Custom Message */}
                  <div>
                    <Label htmlFor="customMessage">Personal Message</Label>
                    <Textarea
                      id="customMessage"
                      value={shareData.customMessage || ""}
                      onChange={(e) => setShareData(prev => ({ ...prev, customMessage: e.target.value }))}
                      placeholder="Personal message to include when sharing..."
                      rows={3}
                    />
                  </div>

                  {/* Expiration */}
                  <div>
                    <Label htmlFor="expiresInDays">Link Expires In (Days)</Label>
                    <Input
                      id="expiresInDays"
                      type="number"
                      value={shareData.expiresInDays || 30}
                      onChange={(e) => setShareData(prev => ({ ...prev, expiresInDays: parseInt(e.target.value) }))}
                      min="1"
                      max="365"
                    />
                  </div>

                  {/* Action Buttons */}
                  <div className="flex gap-2 pt-4">
                    <Button
                      onClick={handleCreateShare}
                      disabled={shareMutation.isPending}
                      className="flex-1"
                    >
                      {shareMutation.isPending ? (
                        <>
                          <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                          Creating...
                        </>
                      ) : (
                        <>
                          <MessageCircle className="w-4 h-4 mr-2" />
                          Create AI Assistant
                        </>
                      )}
                    </Button>
                    <Button
                      variant="outline"
                      onClick={() => setShowModal(false)}
                    >
                      Cancel
                    </Button>
                  </div>
                </>
              ) : (
                <>
                  {/* Generated Link Display */}
                  <div className="space-y-4">
                    <div className="text-center">
                      <CheckCircle className="w-12 h-12 text-green-600 mx-auto mb-4" />
                      <h3 className="text-lg font-semibold text-green-600">AI Assistant Created!</h3>
                      <p className="text-sm text-gray-600">Share this personalized chatbot with {profileName}</p>
                    </div>

                    {/* Chatbot URL */}
                    <div>
                      <Label>AI Assistant URL</Label>
                      <div className="flex gap-2 mt-1">
                        <Input 
                          value={generatedLink.shareUrl} 
                          readOnly 
                          className="font-mono text-sm"
                        />
                        <Button 
                          size="sm" 
                          variant="outline"
                          onClick={() => copyToClipboard(generatedLink.shareUrl)}
                        >
                          {copied ? <CheckCircle className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                        </Button>
                      </div>
                    </div>

                    {/* Quick Actions */}
                    <div className="grid grid-cols-2 gap-3">
                      <Button 
                        variant="outline" 
                        onClick={generateWhatsAppLink}
                        className="w-full"
                      >
                        Share via WhatsApp
                      </Button>
                      <Button 
                        variant="outline" 
                        onClick={() => window.open(generatedLink.shareUrl, '_blank')}
                        className="w-full"
                      >
                        Preview AI Assistant
                      </Button>
                    </div>

                    {/* Agent Info Display */}
                    {generatedLink.agentName && (
                      <div className="bg-gray-50 p-3 rounded-lg">
                        <h4 className="font-medium text-sm mb-2">Agent Information</h4>
                        <p className="text-sm"><strong>{generatedLink.agentName}</strong></p>
                        {generatedLink.agentEmail && (
                          <p className="text-sm text-gray-600">{generatedLink.agentEmail}</p>
                        )}
                        {generatedLink.agentPhone && (
                          <p className="text-sm text-gray-600">{generatedLink.agentPhone}</p>
                        )}
                      </div>
                    )}

                    <Button
                      onClick={() => {
                        setShowModal(false);
                        setGeneratedLink(null);
                      }}
                      className="w-full"
                    >
                      Done
                    </Button>
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        </div>
      )}
    </>
  );
} 