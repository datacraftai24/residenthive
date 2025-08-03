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
  propertyCount?: number;
  className?: string;
}

interface ChatValidationResponse {
  success: boolean;
  preview: string;
  chat_url?: string;
  error?: string;
  ready: boolean;
}

export default function ChatLinkGenerator({ 
  profileId, 
  profileName, 
  agentId = 28, // Default to first agent for demo
  propertyCount = 0,
  className = ""
}: ChatLinkGeneratorProps) {
  const [generatedUrl, setGeneratedUrl] = useState<string | null>(null);
  const [isLinkCopied, setIsLinkCopied] = useState(false);
  const { toast } = useToast();

  const generateLinkMutation = useMutation({
    mutationFn: async () => {
      const response = await fetch('/api/validate-context', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer rh_integration_2025_secure_key_847392'
        },
        body: JSON.stringify({
          buyer_id: profileId,
          agent_id: agentId
        })
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.preview || 'Failed to generate chat link');
      }
      
      return response.json() as Promise<ChatValidationResponse>;
    },
    onSuccess: (data) => {
      if (data.success && data.chat_url) {
        setGeneratedUrl(data.chat_url);
        toast({
          title: "Chat Link Generated",
          description: data.preview,
        });
      } else {
        toast({
          title: "Generation Failed",
          description: data.preview,
          variant: "destructive",
        });
      }
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
        `Hi ${profileName}! I found some great properties for you. Check them out here: ${generatedUrl}`
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
              disabled={generateLinkMutation.isPending}
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
                setGeneratedUrl(null);
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