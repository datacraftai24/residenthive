import { useState, useEffect, useCallback } from "react";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { StickyNote, Check, Loader2, ChevronDown, ChevronUp } from "lucide-react";
import { cn } from "@/lib/utils";

interface PropertyNotesProps {
  shareId: string;
  listingId: string;
  initialNote?: string;
}

export function PropertyNotes({ shareId, listingId, initialNote = "" }: PropertyNotesProps) {
  const [note, setNote] = useState(initialNote);
  const [savedNote, setSavedNote] = useState(initialNote);
  const [isSaving, setIsSaving] = useState(false);
  const [showSaved, setShowSaved] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  const [hasNotes, setHasNotes] = useState(!!initialNote);

  // Debounced auto-save
  useEffect(() => {
    if (note === savedNote) return;

    const timer = setTimeout(async () => {
      if (!note.trim() && !savedNote.trim()) return; // Don't save empty to empty

      setIsSaving(true);
      try {
        const response = await fetch(`/api/buyer-reports/${shareId}/property-notes/${listingId}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ note: note.trim() }),
        });

        if (response.ok) {
          setSavedNote(note);
          setHasNotes(!!note.trim());
          setShowSaved(true);
          setTimeout(() => setShowSaved(false), 2000);
        }
      } catch (error) {
        console.error("Failed to save property note:", error);
      } finally {
        setIsSaving(false);
      }
    }, 1000); // 1 second debounce

    return () => clearTimeout(timer);
  }, [note, savedNote, shareId, listingId]);

  const toggleExpanded = useCallback(() => {
    setIsExpanded(!isExpanded);
  }, [isExpanded]);

  return (
    <div className="border rounded-lg overflow-hidden bg-amber-50/50 border-amber-200">
      {/* Header - Always visible */}
      <button
        onClick={toggleExpanded}
        className="w-full flex items-center justify-between p-3 hover:bg-amber-100/50 transition-colors"
      >
        <div className="flex items-center gap-2">
          <StickyNote className={cn(
            "h-4 w-4",
            hasNotes ? "text-amber-600" : "text-amber-400"
          )} />
          <span className={cn(
            "text-sm font-medium",
            hasNotes ? "text-amber-800" : "text-amber-600"
          )}>
            {hasNotes ? "Your Notes" : "Add your thoughts about this property"}
          </span>
          {hasNotes && !isExpanded && (
            <span className="text-xs text-amber-600 ml-2 truncate max-w-[200px]">
              {note.substring(0, 50)}{note.length > 50 ? "..." : ""}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {isSaving && (
            <Loader2 className="h-3 w-3 animate-spin text-amber-600" />
          )}
          {showSaved && !isSaving && (
            <span className="text-xs text-green-600 flex items-center gap-1">
              <Check className="h-3 w-3" /> Saved
            </span>
          )}
          {isExpanded ? (
            <ChevronUp className="h-4 w-4 text-amber-600" />
          ) : (
            <ChevronDown className="h-4 w-4 text-amber-600" />
          )}
        </div>
      </button>

      {/* Expanded Content */}
      {isExpanded && (
        <div className="p-3 pt-0 space-y-2">
          <Textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="What do you like or dislike about this property? Questions to ask the agent?"
            className="min-h-[100px] resize-none bg-white border-amber-200 focus:border-amber-400 focus:ring-amber-400/20"
          />
          <p className="text-xs text-amber-600">
            Your notes are saved automatically and visible to your agent.
          </p>
        </div>
      )}
    </div>
  );
}
