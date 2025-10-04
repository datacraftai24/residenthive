import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { X, ThumbsDown, MessageSquare, Lock, Unlock } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { BuyerProfile } from "@shared/schema";

interface AgentFeedbackProps {
  profile: BuyerProfile;
  tags?: Array<{ tag: string; category: string; confidence: number; source: string }>;
  persona?: {
    emotionalTone?: string;
    communicationStyle?: string;
    decisionMakingStyle?: string;
    urgencyLevel: number;
    priceOrientation?: string;
    personalityTraits: string[];
    confidenceScore: number;
  };
}

export default function AgentFeedback({ profile, tags = [], persona }: AgentFeedbackProps) {
  const [note, setNote] = useState('');
  const [isLocked, setIsLocked] = useState(false);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Log disagreement with a tag
  const disagreeTagMutation = useMutation({
    mutationFn: async (tagName: string) => {
      return apiRequest("POST", "/api/insights/disagree", {
        profileId: profile.id,
        tagName
      });
    },
    onSuccess: () => {
      toast({
        title: "Feedback recorded",
        description: "Your disagreement with this tag has been logged.",
      });
      queryClient.invalidateQueries({ queryKey: ['/api/buyer-profiles', profile.id, 'enhanced'] });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to record feedback. Please try again.",
        variant: "destructive",
      });
    }
  });

  // Log disagreement with persona field
  const disagreePersonaMutation = useMutation({
    mutationFn: async (personaField: string) => {
      return apiRequest("POST", "/api/insights/disagree", {
        profileId: profile.id,
        personaField
      });
    },
    onSuccess: () => {
      toast({
        title: "Feedback recorded",
        description: "Your disagreement with this insight has been logged.",
      });
    }
  });

  // Save agent note
  const saveNoteMutation = useMutation({
    mutationFn: async (noteText: string) => {
      return apiRequest("POST", "/api/agent-notes", {
        profileId: profile.id,
        note: noteText
      });
    },
    onSuccess: () => {
      setNote('');
      toast({
        title: "Note saved",
        description: "Your note has been recorded for this profile.",
      });
    }
  });

  // Toggle insights lock
  const toggleLockMutation = useMutation({
    mutationFn: async (locked: boolean) => {
      return apiRequest("POST", "/api/insights/lock", {
        profileId: profile.id,
        isLocked: locked
      });
    },
    onSuccess: (_, locked) => {
      setIsLocked(locked);
      toast({
        title: locked ? "Insights locked" : "Insights unlocked",
        description: locked 
          ? "AI insights are now locked and won't update automatically."
          : "AI insights can now update automatically.",
      });
    }
  });

  const handleDisagreeTag = (tagName: string) => {
    disagreeTagMutation.mutate(tagName);
  };

  const handleDisagreePersona = (field: string) => {
    disagreePersonaMutation.mutate(field);
  };

  const handleSaveNote = () => {
    if (note.trim()) {
      saveNoteMutation.mutate(note.trim());
    }
  };

  const handleToggleLock = () => {
    toggleLockMutation.mutate(!isLocked);
  };

  return (
    <Card className="border-orange-200 bg-orange-50 dark:border-orange-800 dark:bg-orange-950/30">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-medium flex items-center gap-2">
          <MessageSquare className="h-4 w-4" />
          Agent Feedback
        </CardTitle>
      </CardHeader>
      
      <CardContent className="space-y-4">
        {/* Tags Feedback Section */}
        {tags.length > 0 && (
          <div>
            <Label className="text-xs font-medium text-gray-600 dark:text-gray-400">
              Behavioral Tags
            </Label>
            <div className="flex flex-wrap gap-2 mt-1">
              {tags.map((tag, index) => (
                <div key={index} className="flex items-center gap-1">
                  <Badge 
                    variant="secondary" 
                    className="text-xs bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300"
                  >
                    {tag.tag}
                  </Badge>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-5 w-5 p-0 text-gray-400 hover:text-red-500"
                    onClick={() => handleDisagreeTag(tag.tag)}
                    disabled={disagreeTagMutation.isPending}
                  >
                    <ThumbsDown className="h-3 w-3" />
                  </Button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Persona Feedback Section */}
        {persona && (
          <div>
            <Label className="text-xs font-medium text-gray-600 dark:text-gray-400">
              Persona Insights
            </Label>
            <div className="space-y-1 mt-1">
              {persona.communicationStyle && (
                <div className="flex items-center justify-between text-xs">
                  <span>Communication: {persona.communicationStyle}</span>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-5 w-5 p-0 text-gray-400 hover:text-red-500"
                    onClick={() => handleDisagreePersona('communicationStyle')}
                    disabled={disagreePersonaMutation.isPending}
                  >
                    <ThumbsDown className="h-3 w-3" />
                  </Button>
                </div>
              )}
              {persona.decisionMakingStyle && (
                <div className="flex items-center justify-between text-xs">
                  <span>Decision Style: {persona.decisionMakingStyle}</span>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-5 w-5 p-0 text-gray-400 hover:text-red-500"
                    onClick={() => handleDisagreePersona('decisionMakingStyle')}
                    disabled={disagreePersonaMutation.isPending}
                  >
                    <ThumbsDown className="h-3 w-3" />
                  </Button>
                </div>
              )}
              <div className="flex items-center justify-between text-xs">
                <span>Urgency Level: {persona.urgencyLevel}%</span>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-5 w-5 p-0 text-gray-400 hover:text-red-500"
                  onClick={() => handleDisagreePersona('urgencyLevel')}
                  disabled={disagreePersonaMutation.isPending}
                >
                  <ThumbsDown className="h-3 w-3" />
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* Notes Section */}
        <div>
          <Label className="text-xs font-medium text-gray-600 dark:text-gray-400">
            Agent Notes
          </Label>
          <div className="space-y-2 mt-1">
            <Textarea
              placeholder="Add notes about this buyer (corrections, observations, etc.)"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              className="text-xs min-h-[60px]"
            />
            <Button
              size="sm"
              onClick={handleSaveNote}
              disabled={!note.trim() || saveNoteMutation.isPending}
              className="text-xs"
            >
              Save Note
            </Button>
          </div>
        </div>

        {/* Insights Lock Section */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            {isLocked ? <Lock className="h-4 w-4" /> : <Unlock className="h-4 w-4" />}
            <Label className="text-xs font-medium">
              Lock AI Insights
            </Label>
          </div>
          <Switch
            checked={isLocked}
            onCheckedChange={handleToggleLock}
            disabled={toggleLockMutation.isPending}
          />
        </div>
        <p className="text-xs text-gray-500 dark:text-gray-400">
          When locked, AI insights won't update automatically from new conversations.
        </p>
      </CardContent>
    </Card>
  );
}