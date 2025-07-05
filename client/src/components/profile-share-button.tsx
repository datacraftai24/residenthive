import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { Loader2, Share2, Copy, CheckCircle } from 'lucide-react';

interface ProfileShareData {
  profileId: number;
  agentName?: string;
  agentEmail?: string;
  agentPhone?: string;
  customMessage?: string;
  showVisualAnalysis?: boolean;
  expiresInDays?: number;
}

interface ShareableProfile {
  shareId: string;
  profileId: number;
  shareUrl: string;
  agentName?: string;
  agentEmail?: string;
  agentPhone?: string;
  customMessage?: string;
  showVisualAnalysis?: boolean;
  expiresAt?: string;
  isActive: boolean;
}

interface ProfileShareButtonProps {
  profileId: number;
  profileName: string;
}

export default function ProfileShareButton({ profileId, profileName }: ProfileShareButtonProps) {
  const [showModal, setShowModal] = useState(false);
  const [shareData, setShareData] = useState<Partial<ProfileShareData>>({
    agentName: "",
    agentEmail: "",
    agentPhone: "",
    customMessage: `Hi ${profileName}! I've found some amazing properties that match your criteria perfectly. These listings have been carefully selected based on your preferences and requirements.`,
    showVisualAnalysis: true,
    expiresInDays: 30
  });
  const [generatedLink, setGeneratedLink] = useState<ShareableProfile | null>(null);
  const [copied, setCopied] = useState(false);
  const { toast } = useToast();

  // Create shareable profile mutation
  const shareMutation = useMutation({
    mutationFn: async (data: ProfileShareData): Promise<ShareableProfile> => {
      const response = await fetch("/api/profiles/share", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!response.ok) throw new Error("Failed to create shareable profile");
      return response.json();
    },
    onSuccess: (result: ShareableProfile) => {
      setGeneratedLink(result);
      toast({
        title: "Client dashboard created!",
        description: "Shareable link generated successfully",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to create shareable client dashboard",
        variant: "destructive",
      });
    }
  });

  const handleCreateShare = () => {
    shareMutation.mutate({
      profileId,
      ...shareData
    } as ProfileShareData);
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

I've found some properties that match your criteria perfectly. 

${shareData.customMessage || 'Take a look at these curated listings I selected specifically for you.'}

View your personalized property matches: ${generatedLink.shareUrl}

${shareData.agentName ? `Best regards,\n${shareData.agentName}` : 'Best regards'}`;

    const whatsappUrl = `https://wa.me/?text=${encodeURIComponent(message)}`;
    window.open(whatsappUrl, '_blank');
  };

  return (
    <>
      <Button 
        onClick={() => setShowModal(true)}
        variant="outline" 
        size="sm"
        className="flex items-center gap-2"
      >
        <Share2 className="w-4 h-4" />
        Create Client Dashboard
      </Button>

      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <Card className="w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <CardHeader>
              <CardTitle>Create Client Dashboard</CardTitle>
              <CardDescription>
                Generate a Zillow-like client dashboard for {profileName} with all their property matches
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {!generatedLink ? (
                <>
                  {/* Agent Information */}
                  <div className="space-y-4">
                    <h4 className="font-medium">Agent Information</h4>
                    <div className="grid grid-cols-2 gap-4">
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
                          placeholder="your.email@agency.com"
                        />
                      </div>
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

                  {/* Custom Message */}
                  <div>
                    <Label htmlFor="customMessage">Personal Message</Label>
                    <Textarea
                      id="customMessage"
                      value={shareData.customMessage || ""}
                      onChange={(e) => setShareData(prev => ({ ...prev, customMessage: e.target.value }))}
                      placeholder="Write a personal message for your client..."
                      rows={4}
                    />
                  </div>

                  {/* Options */}
                  <div className="space-y-3">
                    <h4 className="font-medium">Dashboard Options</h4>
                    <div className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        id="showVisualAnalysis"
                        checked={shareData.showVisualAnalysis}
                        onChange={(e) => setShareData(prev => ({ ...prev, showVisualAnalysis: e.target.checked }))}
                      />
                      <Label htmlFor="showVisualAnalysis">Include AI Visual Analysis</Label>
                      <Badge variant="secondary">Recommended</Badge>
                    </div>
                  </div>

                  {/* Action Buttons */}
                  <div className="flex gap-2 pt-4">
                    <Button 
                      onClick={handleCreateShare}
                      disabled={shareMutation.isPending}
                      className="flex-1"
                    >
                      {shareMutation.isPending ? (
                        <Loader2 className="w-4 h-4 animate-spin mr-2" />
                      ) : (
                        <Share2 className="w-4 h-4 mr-2" />
                      )}
                      Create Client Dashboard
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
                      <h3 className="text-lg font-semibold text-green-600">Client Dashboard Created!</h3>
                      <p className="text-sm text-gray-600">Share this personalized dashboard with {profileName}</p>
                    </div>

                    {/* Share URL */}
                    <div>
                      <Label>Client Dashboard URL</Label>
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
                        Preview Dashboard
                      </Button>
                    </div>

                    {/* Dashboard Features */}
                    <div className="bg-gray-50 p-4 rounded-lg">
                      <h4 className="font-medium mb-2">Dashboard Features</h4>
                      <ul className="text-sm text-gray-600 space-y-1">
                        <li>✅ All property matches for {profileName}</li>
                        <li>✅ AI-powered scoring and explanations</li>
                        <li>✅ {shareData.showVisualAnalysis ? 'Visual intelligence analysis' : 'Standard property analysis'}</li>
                        <li>✅ Agent contact information</li>
                        <li>✅ Mobile-friendly design</li>
                        <li>✅ {shareData.expiresInDays} day access</li>
                      </ul>
                    </div>

                    <div className="flex gap-2">
                      <Button 
                        onClick={() => {
                          setGeneratedLink(null);
                          setShowModal(false);
                        }}
                        className="flex-1"
                      >
                        Done
                      </Button>
                    </div>
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