import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { MessageCircle, X } from "lucide-react";
import { cn } from "@/lib/utils";

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

  // Handle Escape key to close
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && open) {
        setOpen(false);
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [open]);

  return (
    <>
      {/* Floating Button - hidden when chat is open */}
      {!open && (
        <Button
          size="lg"
          className="fixed bottom-6 right-6 h-14 w-14 rounded-full shadow-lg z-50 bg-blue-600 hover:bg-blue-700"
          onClick={() => setOpen(true)}
          aria-label="Open chat"
        >
          <MessageCircle className="h-6 w-6" />
        </Button>
      )}

      {/* Backdrop when open */}
      {open && (
        <div
          className="fixed inset-0 z-40 bg-black/50"
          onClick={() => setOpen(false)}
        />
      )}

      {/* Chat Panel - ALWAYS MOUNTED, visibility controlled by CSS transform */}
      <div
        className={cn(
          "fixed inset-y-0 right-0 z-50 w-[400px] sm:w-[420px] bg-white shadow-xl border-l",
          "transition-transform duration-300 ease-in-out",
          open ? "translate-x-0" : "translate-x-full"
        )}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b bg-gradient-to-r from-blue-600 to-blue-700 text-white">
          <span className="flex items-center gap-2 font-semibold">
            <MessageCircle className="h-5 w-5" />
            AI Property Assistant
          </span>
          <Button
            size="icon"
            variant="ghost"
            onClick={() => setOpen(false)}
            className="text-white hover:bg-blue-500/50"
          >
            <X className="h-5 w-5" />
          </Button>
        </div>

        {/* Chat content - fills remaining height */}
        <div className="h-[calc(100vh-65px)] overflow-hidden">
          {children}
        </div>
      </div>
    </>
  );
}
