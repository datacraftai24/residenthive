import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import { 
  Mic, 
  MicOff, 
  Send, 
  Eye, 
  Check, 
  X, 
  Loader2,
  MessageSquare,
  History
} from "lucide-react";
import { type BuyerProfile } from "@shared/schema";
import { apiRequest } from "@/lib/queryClient";
import VoiceInput from "./voice-input";
import ConfidenceDisplay from "./confidence-display";

interface ConversationalEditProps {
  profile: BuyerProfile;
  onClose: () => void;
  onProfileUpdated: (profile: BuyerProfile) => void;
}

interface ParsedChanges {
  field: string;
  oldValue: any;
  newValue: any;
  confidence: number;
  action: 'update' | 'add' | 'remove';
}

interface UpdateResponse {
  profile: BuyerProfile;
  changes: ParsedChanges[];
  confidence: number;
}

export default function ConversationalEdit({ 
  profile, 
  onClose, 
  onProfileUpdated 
}: ConversationalEditProps) {
  const [input, setInput] = useState("");
  const [isRecording, setIsRecording] = useState(false);
  const [parsedChanges, setParsedChanges] = useState<ParsedChanges[]>([]);
  const [showPreview, setShowPreview] = useState(false);
  const [editHistory, setEditHistory] = useState<string[]>([]);
  
  const queryClient = useQueryClient();

  // Parse changes from natural language
  const parseChangesMutation = useMutation({
    mutationFn: async (text: string) => {
      const response = await fetch(`/api/buyer-profiles/${profile.id}/parse-changes`, {
        method: 'POST',
        body: JSON.stringify({ 
          text, 
          currentProfile: profile 
        }),
        headers: { 'Content-Type': 'application/json' }
      });
      
      if (!response.ok) {
        throw new Error('Failed to parse changes');
      }
      
      return response.json();
    },
    onSuccess: (data: { changes: ParsedChanges[], confidence: number }) => {
      setParsedChanges(data.changes);
      setShowPreview(true);
    }
  });

  // Apply parsed changes
  const applyChangesMutation = useMutation({
    mutationFn: async () => {
      const response = await fetch(`/api/buyer-profiles/${profile.id}/apply-changes`, {
        method: 'PATCH',
        body: JSON.stringify({ changes: parsedChanges }),
        headers: { 'Content-Type': 'application/json' }
      });
      
      if (!response.ok) {
        throw new Error('Failed to apply changes');
      }
      
      return response.json();
    },
    onSuccess: (updatedProfile: BuyerProfile) => {
      setEditHistory(prev => [...prev, input]);
      onProfileUpdated(updatedProfile);
      queryClient.invalidateQueries({ queryKey: [`/api/buyer-profiles/${profile.id}`] });
      
      // Reset state
      setInput("");
      setParsedChanges([]);
      setShowPreview(false);
    }
  });

  const handleVoiceTranscription = (text: string) => {
    setInput(text);
  };

  const handleParseChanges = () => {
    if (!input.trim()) return;
    parseChangesMutation.mutate(input);
  };

  const handleApplyChanges = () => {
    applyChangesMutation.mutate();
  };

  const handleQuickEdit = (quickText: string) => {
    setInput(quickText);
    parseChangesMutation.mutate(quickText);
  };

  const getChangeIcon = (action: string) => {
    switch (action) {
      case 'add': return <span className="text-green-600">+</span>;
      case 'remove': return <span className="text-red-600">-</span>;
      case 'update': return <span className="text-blue-600">→</span>;
      default: return null;
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <MessageSquare className="h-5 w-5" />
              Edit Profile: {profile.name}
            </CardTitle>
            <p className="text-sm text-gray-600 mt-1">
              Describe changes naturally - "Change budget to $500K" or "Add swimming pool requirement"
            </p>
          </div>
          <Button variant="outline" onClick={onClose}>
            <X className="h-4 w-4 mr-2" />
            Close
          </Button>
        </CardHeader>

        <CardContent className="space-y-6">
          {/* Voice/Text Input */}
          <div className="space-y-4">
            <div className="flex gap-2">
              <div className="flex-1">
                <Textarea
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  placeholder="Describe the changes you want to make..."
                  rows={3}
                  className="resize-none"
                />
              </div>
              <div className="flex flex-col gap-2">
                <VoiceInput
                  onTranscription={handleVoiceTranscription}
                  isRecording={isRecording}
                  setIsRecording={setIsRecording}
                />
                <Button 
                  onClick={handleParseChanges}
                  disabled={!input.trim() || parseChangesMutation.isPending}
                  size="sm"
                >
                  {parseChangesMutation.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Eye className="h-4 w-4" />
                  )}
                </Button>
              </div>
            </div>

            {/* Quick Edit Shortcuts */}
            <div className="flex flex-wrap gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleQuickEdit("Increase budget by $50K")}
              >
                Budget +$50K
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleQuickEdit("Add swimming pool to must-haves")}
              >
                Add Pool
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleQuickEdit("Remove garage requirement")}
              >
                Remove Garage
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleQuickEdit("Add 1 more bedroom")}
              >
                +1 Bedroom
              </Button>
            </div>
          </div>

          {/* Changes Preview */}
          {showPreview && parsedChanges.length > 0 && (
            <Card className="border-blue-200 bg-blue-50">
              <CardHeader className="pb-3">
                <CardTitle className="text-lg flex items-center gap-2">
                  <Eye className="h-4 w-4" />
                  Detected Changes
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {parsedChanges.map((change, index) => (
                  <div key={index} className="flex items-center justify-between p-3 bg-white rounded-lg border">
                    <div className="flex items-center gap-3">
                      {getChangeIcon(change.action)}
                      <div>
                        <p className="font-medium">{change.field}</p>
                        <p className="text-sm text-gray-600">
                          {change.action === 'update' && (
                            <>
                              <span className="line-through text-red-500">{String(change.oldValue)}</span>
                              {" → "}
                              <span className="text-green-600">{String(change.newValue)}</span>
                            </>
                          )}
                          {change.action === 'add' && (
                            <span className="text-green-600">Add: {String(change.newValue)}</span>
                          )}
                          {change.action === 'remove' && (
                            <span className="text-red-500">Remove: {String(change.oldValue)}</span>
                          )}
                        </p>
                      </div>
                    </div>
                    <ConfidenceDisplay 
                      confidence={change.confidence}
                      inputMethod="text"
                      fieldName={change.field}
                    />
                  </div>
                ))}

                <Separator />

                <div className="flex justify-between items-center">
                  <div className="flex gap-2">
                    <Button 
                      onClick={handleApplyChanges}
                      disabled={applyChangesMutation.isPending}
                      className="bg-green-600 hover:bg-green-700"
                    >
                      {applyChangesMutation.isPending ? (
                        <Loader2 className="h-4 w-4 animate-spin mr-2" />
                      ) : (
                        <Check className="h-4 w-4 mr-2" />
                      )}
                      Apply Changes
                    </Button>
                    <Button 
                      variant="outline"
                      onClick={() => {
                        setParsedChanges([]);
                        setShowPreview(false);
                      }}
                    >
                      <X className="h-4 w-4 mr-2" />
                      Cancel
                    </Button>
                  </div>
                  <Badge variant="outline">
                    {parsedChanges.length} change{parsedChanges.length !== 1 ? 's' : ''} detected
                  </Badge>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Edit History */}
          {editHistory.length > 0 && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm flex items-center gap-2">
                  <History className="h-4 w-4" />
                  Recent Edits
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {editHistory.slice(-3).map((edit, index) => (
                    <div key={index} className="text-sm text-gray-600 p-2 bg-gray-50 rounded">
                      "{edit}"
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </CardContent>
      </Card>
    </div>
  );
}