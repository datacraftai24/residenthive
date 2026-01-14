import { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { StickyNote, Save, Loader2, CheckCircle2 } from 'lucide-react';
import { useMutation, useQueryClient } from '@tanstack/react-query';

interface BuyerNotesProps {
  shareId: string;
  initialNotes?: string;
  lastUpdated?: string;
}

export function BuyerNotes({ shareId, initialNotes, lastUpdated }: BuyerNotesProps) {
  const [notes, setNotes] = useState(initialNotes || '');
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved'>('idle');
  const queryClient = useQueryClient();

  // Update local state when initialNotes changes (e.g., after refetch)
  useEffect(() => {
    if (initialNotes !== undefined) {
      setNotes(initialNotes);
    }
  }, [initialNotes]);

  const mutation = useMutation({
    mutationFn: async (newNotes: string) => {
      const response = await fetch(`/api/buyer-reports/${shareId}/notes`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ notes: newNotes }),
      });
      if (!response.ok) {
        throw new Error('Failed to save notes');
      }
      return response.json();
    },
    onSuccess: () => {
      setSaveStatus('saved');
      // Invalidate to refresh any cached report data
      queryClient.invalidateQueries({ queryKey: ['buyer-report', shareId] });
      // Reset status after a delay
      setTimeout(() => setSaveStatus('idle'), 2000);
    },
    onError: () => {
      setSaveStatus('idle');
    },
  });

  // Debounced save - saves 1 second after user stops typing
  const debouncedSave = useCallback(
    debounce((value: string) => {
      setSaveStatus('saving');
      mutation.mutate(value);
    }, 1000),
    [shareId]
  );

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const value = e.target.value;
    setNotes(value);
    debouncedSave(value);
  };

  return (
    <Card className="border-2 border-purple-200 bg-gradient-to-br from-purple-50/50 to-white">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-base">
          <StickyNote className="h-5 w-5 text-purple-600" />
          <span>Your Notes</span>
          {saveStatus === 'saving' && (
            <span className="flex items-center gap-1 text-xs text-gray-500 font-normal ml-auto">
              <Loader2 className="h-3 w-3 animate-spin" />
              Saving...
            </span>
          )}
          {saveStatus === 'saved' && (
            <span className="flex items-center gap-1 text-xs text-green-600 font-normal ml-auto">
              <CheckCircle2 className="h-3 w-3" />
              Saved
            </span>
          )}
        </CardTitle>
        <p className="text-xs text-gray-500">
          Share your thoughts with your agent. These notes sync automatically.
        </p>
      </CardHeader>
      <CardContent>
        <Textarea
          value={notes}
          onChange={handleChange}
          placeholder="Add your notes here... (e.g., 'I really like the yard in #1', 'Need to check if #2 has a basement', 'Budget concern with #3')"
          className="min-h-[100px] resize-y bg-white border-purple-100 focus:border-purple-300"
        />
        {lastUpdated && (
          <p className="text-xs text-gray-400 mt-2">
            Last updated: {new Date(lastUpdated).toLocaleString()}
          </p>
        )}
      </CardContent>
    </Card>
  );
}

// Simple debounce utility
function debounce<T extends (...args: unknown[]) => void>(
  fn: T,
  delay: number
): T {
  let timeoutId: ReturnType<typeof setTimeout>;
  return ((...args: unknown[]) => {
    clearTimeout(timeoutId);
    timeoutId = setTimeout(() => fn(...args), delay);
  }) as T;
}
