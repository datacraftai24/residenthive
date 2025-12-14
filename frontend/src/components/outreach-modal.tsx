import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Mail, Copy, Check, Loader2 } from "lucide-react";

interface OutreachModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  shareId: string;
  shareUrl: string;
  buyerEmail?: string;
}

export function OutreachModal({
  open,
  onOpenChange,
  shareId,
  shareUrl,
  buyerEmail,
}: OutreachModalProps) {
  const { toast } = useToast();

  const [toEmail, setToEmail] = useState(buyerEmail || "");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [copied, setCopied] = useState(false);

  // Fetch default email content from backend when modal opens
  useEffect(() => {
    if (open && shareId && !body) {
      setIsLoading(true);
      fetch(`/api/buyer-reports/${shareId}`)
        .then((res) => res.json())
        .then((data) => {
          if (data.defaultEmailBody) {
            setBody(data.defaultEmailBody);
          }
          if (data.defaultEmailSubject) {
            setSubject(data.defaultEmailSubject);
          }
        })
        .catch((err) => {
          console.error("Failed to fetch report defaults:", err);
          // Fallback subject
          setSubject("Homes I'd recommend for you");
          setBody("Please view the report at the link below.");
        })
        .finally(() => setIsLoading(false));
    }
  }, [open, shareId, body]);

  const handleSendEmail = async () => {
    if (!toEmail) return;
    setIsSending(true);
    try {
      const res = await fetch(`/api/buyer-reports/${shareId}/send-email`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ to_email: toEmail, subject, body }),
      });
      if (res.status === 401) {
        toast({
          title: "Session expired",
          description: "Please sign in again",
          variant: "destructive",
        });
        return;
      }
      if (!res.ok) {
        toast({
          title: "Email failed",
          description: "Copy the message and send manually",
          variant: "destructive",
        });
        return;
      }
      toast({
        title: "Email sent",
        description: `Report sent to ${toEmail}`,
      });
      onOpenChange(false);
    } catch (e) {
      toast({
        title: "Network error",
        description: "Check your connection and try again",
        variant: "destructive",
      });
    } finally {
      setIsSending(false);
    }
  };

  const handleCopyBody = () => {
    navigator.clipboard.writeText(body);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
    toast({ title: "Copied to clipboard" });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Send Report to Buyer</DialogTitle>
          <DialogDescription>
            Edit the message if needed, then send directly or copy to paste
            elsewhere.
          </DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="to-email">Buyer email</Label>
                <Input
                  id="to-email"
                  type="email"
                  value={toEmail}
                  onChange={(e) => setToEmail(e.target.value)}
                  placeholder="buyer@example.com"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="subject">Subject</Label>
                <Input
                  id="subject"
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="body">Message</Label>
                <Textarea
                  id="body"
                  rows={10}
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                  className="font-mono text-sm"
                />
              </div>
            </div>

            <DialogFooter className="flex gap-2">
              <Button variant="outline" onClick={handleCopyBody}>
                {copied ? (
                  <Check className="h-4 w-4 mr-2" />
                ) : (
                  <Copy className="h-4 w-4 mr-2" />
                )}
                {copied ? "Copied" : "Copy"}
              </Button>
              <Button onClick={handleSendEmail} disabled={isSending || !toEmail}>
                <Mail className="h-4 w-4 mr-2" />
                {isSending ? "Sending..." : "Send Email"}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
