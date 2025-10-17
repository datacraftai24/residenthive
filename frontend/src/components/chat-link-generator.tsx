import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { MessageSquare, Copy, Share2, ExternalLink, Loader2, CheckCircle } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { apiRequest } from '@/lib/queryClient';

interface ChatLinkGeneratorProps {
  profileId: number;
  profileName: string;
  agentId?: number;
  agentName?: string;
  agentEmail?: string;
  agentPhone?: string;
  buyerEmail?: string;
  propertyCount?: number;
  className?: string;
}

interface ChatShareResponse {
  shareId: string;
  profileId: number;
  agentId: number;
  shareUrl: string;
  clientIdentifier?: string;
  agentName?: string;
  agentEmail?: string;
  agentPhone?: string;
  buyerName?: string;
  buyerEmail?: string;
  createdAt?: string | null;
  expiresAt?: string | null;
  lastViewed?: string | null;
  viewCount?: number;
  isActive: boolean;
  wasCreated: boolean;
}

export default function ChatLinkGenerator({ 
  profileId, 
  profileName, 
  agentId,
  agentName,
  agentEmail,
  agentPhone,
  buyerEmail,
  propertyCount = 0,
  className = ""
}: ChatLinkGeneratorProps) {
  const [shareInfo, setShareInfo] = useState<ChatShareResponse | null>(null);
  const [isLinkCopied, setIsLinkCopied] = useState(false);
  const { toast } = useToast();
  const generatedUrl = shareInfo?.shareUrl ?? null;
  const canGenerate = typeof agentId === 'number' && !Number.isNaN(agentId);

  const generateLinkMutation = useMutation({
    mutationFn: async (): Promise<ChatShareResponse> => {
      if (!canGenerate) {
        throw new Error('Missing agent context to generate chat link');
      }

      const clientIdentifier = buyerEmail?.trim() || profileName?.trim() || String(profileId);

      const response = await apiRequest('POST', '/api/profiles/chat-share', {
        profileId,
        agentName,
        agentEmail,
        agentPhone,
        buyerName: profileName,
        buyerEmail,
        clientIdentifier,
      });

      const data: ChatShareResponse = await response.json();
      return data;
    },
    onSuccess: (data) => {
      setShareInfo(data);
      toast({
        title: data.wasCreated ? 'Chat link generated' : 'Chat link ready',
        description: data.wasCreated
          ? 'A fresh chatbot link was created for this buyer.'
          : 'Using the existing active chatbot link for this buyer.',
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Generation Failed", 
        description: error.message,
        variant: "destructive",
      });
    }
  });

  const handleCopyLink = async () => {
    if (generatedUrl) {
      try {
        await navigator.clipboard.writeText(generatedUrl);
        setIsLinkCopied(true);
        toast({
          title: "Link Copied",
          description: "Chat link has been copied to clipboard",
        });
        setTimeout(() => setIsLinkCopied(false), 3000);
      } catch (error) {
        toast({
          title: "Copy Failed",
          description: "Failed to copy link to clipboard",
          variant: "destructive",
        });
      }
    }
  };

  const handleWhatsAppShare = () => {
    if (generatedUrl) {
      const message = encodeURIComponent(
        `Hi ${profileName}! I found some great properties for you. Let’s chat about them here: ${generatedUrl}`
      );
      const whatsappUrl = `https://wa.me/?text=${message}`;
      window.open(whatsappUrl, '_blank');
    }
  };

  return (
    <Card className={`border-blue-200 bg-blue-50/50 ${className}`}>
      <CardHeader className="pb-4">
        <div className="flex items-center space-x-2">
          <MessageSquare className="h-5 w-5 text-blue-600" />
          <CardTitle className="text-lg">Share with Client</CardTitle>
        </div>
        <CardDescription>
          Generate a personalized chat link for {profileName}
          {propertyCount > 0 && ` (${propertyCount} properties found)`}
        </CardDescription>
      </CardHeader>
      
      <CardContent className="space-y-4">
        {!generatedUrl ? (
          <div className="space-y-3">
            <p className="text-sm text-gray-600">
              Create a secure chat portal where your client can view their property matches 
              and discuss them with AI assistance.
            </p>
            
            <Button 
              onClick={() => generateLinkMutation.mutate()}
              disabled={generateLinkMutation.isPending || !canGenerate}
              className="w-full"
            >
              {generateLinkMutation.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Generating Link...
                </>
              ) : (
                <>
                  <MessageSquare className="mr-2 h-4 w-4" />
                  Generate Chat Link
                </>
              )}
            </Button>
            {!canGenerate && (
              <p className="text-xs text-orange-600 text-center">
                Agent context is required before generating a chat link.
              </p>
            )}
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex items-center space-x-2">
              <CheckCircle className="h-5 w-5 text-green-600" />
              <Badge variant="secondary" className="text-green-700 bg-green-100">
                Link Generated
              </Badge>
            </div>
            
            <div className="p-3 bg-white rounded-md border border-gray-200">
              <p className="text-sm font-mono text-gray-800 break-all">
                {generatedUrl}
              </p>
            </div>

            <div className="grid gap-2 text-xs text-gray-600">
              <div><span className="font-semibold">Share ID:</span> {shareInfo?.shareId}</div>
              {shareInfo?.clientIdentifier && (
                <div><span className="font-semibold">Client Identifier:</span> {shareInfo.clientIdentifier}</div>
              )}
              {shareInfo?.createdAt && (
                <div>
                  <span className="font-semibold">Created:</span> {" "}
                  {new Date(shareInfo.createdAt).toLocaleString()}
                </div>
              )}
              {shareInfo?.expiresAt && (
                <div>
                  <span className="font-semibold">Expires:</span> {" "}
                  {new Date(shareInfo.expiresAt).toLocaleString()}
                </div>
              )}
            </div>
            
            <div className="flex space-x-2">
              <Button 
                variant="outline" 
                size="sm" 
                onClick={handleCopyLink}
                className="flex-1"
              >
                {isLinkCopied ? (
                  <>
                    <CheckCircle className="mr-2 h-4 w-4 text-green-600" />
                    Copied
                  </>
                ) : (
                  <>
                    <Copy className="mr-2 h-4 w-4" />
                    Copy Link
                  </>
                )}
              </Button>
              
              <Button 
                variant="outline" 
                size="sm" 
                onClick={handleWhatsAppShare}
                className="flex-1"
              >
                <Share2 className="mr-2 h-4 w-4" />
                WhatsApp
              </Button>
              
              <Button 
                variant="outline" 
                size="sm" 
                onClick={() => window.open(generatedUrl, '_blank')}
              >
                <ExternalLink className="h-4 w-4" />
              </Button>
            </div>
            
            <Separator />
            
            <Button 
              variant="ghost" 
              size="sm" 
              onClick={() => {
                setShareInfo(null);
                setIsLinkCopied(false);
              }}
              className="w-full text-gray-600"
            >
              Generate New Link
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
