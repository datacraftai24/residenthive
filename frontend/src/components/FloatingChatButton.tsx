import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { MessageCircle, X } from "lucide-react";

interface FloatingChatButtonProps {
  children: React.ReactNode;
  initialMessage?: string;
}

export function FloatingChatButton({ children, initialMessage }: FloatingChatButtonProps) {
  const [open, setOpen] = useState(false);

  // Listen for custom events to open chat with pre-filled messages
  useEffect(() => {
    const handleRequestShowing = (event: CustomEvent<{ address: string }>) => {
      setOpen(true);
      // The chat widget will handle the pre-filled message via its own state
    };

    const handleOpenChat = () => {
      setOpen(true);
    };

    window.addEventListener('request-showing', handleRequestShowing as EventListener);
    window.addEventListener('open-chat', handleOpenChat);

    return () => {
      window.removeEventListener('request-showing', handleRequestShowing as EventListener);
      window.removeEventListener('open-chat', handleOpenChat);
    };
  }, []);

  return (
    <>
      {/* Floating Button */}
      <Button
        size="lg"
        className="fixed bottom-6 right-6 h-14 w-14 rounded-full shadow-lg z-50 bg-blue-600 hover:bg-blue-700"
        onClick={() => setOpen(true)}
      >
        <MessageCircle className="h-6 w-6" />
      </Button>

      {/* Chat Sheet */}
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="right" className="w-[400px] sm:w-[450px] p-0">
          <SheetHeader className="p-4 border-b">
            <SheetTitle className="flex items-center justify-between">
              <span className="flex items-center gap-2">
                <MessageCircle className="h-5 w-5 text-blue-600" />
                AI Property Assistant
              </span>
              <Button size="icon" variant="ghost" onClick={() => setOpen(false)}>
                <X className="h-4 w-4" />
              </Button>
            </SheetTitle>
          </SheetHeader>
          <div className="h-[calc(100vh-80px)] overflow-hidden">
            {children}
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
