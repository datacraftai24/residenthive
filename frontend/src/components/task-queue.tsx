import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { formatDistanceToNow } from "date-fns";
import {
  CheckCircle,
  XCircle,
  Clock,
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  School,
  Volume2,
  Car,
  Search,
  FileText,
  Bell,
  HelpCircle,
  Calendar,
  Loader2,
} from "lucide-react";

const CHATBOT_URL = import.meta.env.VITE_CHATBOT_URL || 'http://localhost:8010';

interface Task {
  id: number;
  session_id: string | null;
  share_id: string | null;
  profile_id: number | null;
  lead_id: number | null;
  agent_id: string | null;
  task_type: string;
  topic: string | null;
  title: string;
  description: string | null;
  properties: string[];
  status: "pending" | "in_progress" | "completed" | "dismissed";
  priority: "low" | "normal" | "high";
  created_at: string;
  updated_at: string;
  completed_at: string | null;
  completed_by: string | null;
  resolution_notes: string | null;
}

interface TaskCounts {
  pending: number;
  in_progress: number;
  completed: number;
  dismissed: number;
  total: number;
}

interface TasksResponse {
  success: boolean;
  tasks: Task[];
  counts: TaskCounts;
}

interface TaskQueueProps {
  profileId?: number;
  leadId?: number;
  shareId?: string;
  agentId?: string;
}

const TASK_ICONS: Record<string, React.ReactNode> = {
  verify_schools: <School className="h-4 w-4" />,
  verify_noise: <Volume2 className="h-4 w-4" />,
  verify_commute: <Car className="h-4 w-4" />,
  verify_condition: <Search className="h-4 w-4" />,
  schedule_showing: <Calendar className="h-4 w-4" />,
  verify_hoa: <FileText className="h-4 w-4" />,
  notify_agent: <Bell className="h-4 w-4" />,
  general_question: <HelpCircle className="h-4 w-4" />,
};

const PRIORITY_STYLES: Record<string, string> = {
  high: "bg-red-100 text-red-800 border-red-200",
  normal: "bg-yellow-100 text-yellow-800 border-yellow-200",
  low: "bg-gray-100 text-gray-600 border-gray-200",
};

function TaskCard({
  task,
  onComplete,
  onDismiss,
  isLoading,
}: {
  task: Task;
  onComplete: (taskId: number, notes: string) => void;
  onDismiss: (taskId: number) => void;
  isLoading: boolean;
}) {
  const [showNotes, setShowNotes] = useState(false);
  const [notes, setNotes] = useState("");

  const isResolved = task.status === "completed" || task.status === "dismissed";

  return (
    <div className={`border rounded-lg p-3 ${isResolved ? "bg-slate-50 opacity-75" : "hover:bg-gray-50"}`}>
      {/* Task header */}
      <div className="flex items-start gap-3">
        <span className="text-muted-foreground mt-0.5">
          {TASK_ICONS[task.task_type] || <HelpCircle className="h-4 w-4" />}
        </span>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className={`font-medium text-sm ${isResolved ? "line-through text-muted-foreground" : ""}`}>
              {task.title}
            </span>
            <Badge
              variant="outline"
              className={`text-xs ${PRIORITY_STYLES[task.priority]}`}
            >
              {task.priority}
            </Badge>
          </div>

          {task.description && !isResolved && (
            <p className="text-sm text-muted-foreground mt-1">{task.description}</p>
          )}

          {/* Properties tags */}
          {task.properties?.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-2">
              {task.properties.map((prop, i) => (
                <span
                  key={i}
                  className="text-xs bg-blue-50 text-blue-700 px-2 py-0.5 rounded"
                >
                  {prop}
                </span>
              ))}
            </div>
          )}

          {/* Timestamp */}
          <p className="text-xs text-muted-foreground mt-2">
            {formatDistanceToNow(new Date(task.created_at), { addSuffix: true })}
          </p>

          {/* Completed info */}
          {task.status === "completed" && task.resolution_notes && (
            <div className="mt-2 p-2 bg-green-50 rounded text-sm">
              <span className="font-medium text-green-800">Resolution:</span>{" "}
              <span className="text-green-700">{task.resolution_notes}</span>
            </div>
          )}

          {task.status === "dismissed" && (
            <div className="mt-2 p-2 bg-gray-100 rounded text-sm">
              <span className="text-gray-600 italic">Dismissed</span>
            </div>
          )}
        </div>
      </div>

      {/* Actions (only for pending) */}
      {task.status === "pending" && (
        <div className="mt-3">
          {!showNotes ? (
            <div className="flex gap-2">
              <Button
                onClick={() => setShowNotes(true)}
                size="sm"
                className="flex-1 bg-green-600 hover:bg-green-700"
                disabled={isLoading}
              >
                <CheckCircle className="h-4 w-4 mr-1" />
                Mark Complete
              </Button>
              <Button
                onClick={() => onDismiss(task.id)}
                size="sm"
                variant="outline"
                disabled={isLoading}
              >
                <XCircle className="h-4 w-4 mr-1" />
                Dismiss
              </Button>
            </div>
          ) : (
            <div className="space-y-2">
              <Textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Add resolution notes (optional)..."
                className="text-sm"
                rows={2}
              />
              <div className="flex gap-2">
                <Button
                  onClick={() => {
                    onComplete(task.id, notes);
                    setShowNotes(false);
                    setNotes("");
                  }}
                  size="sm"
                  className="flex-1 bg-green-600 hover:bg-green-700"
                  disabled={isLoading}
                >
                  {isLoading ? (
                    <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                  ) : (
                    <CheckCircle className="h-4 w-4 mr-1" />
                  )}
                  Save & Complete
                </Button>
                <Button
                  onClick={() => {
                    setShowNotes(false);
                    setNotes("");
                  }}
                  size="sm"
                  variant="outline"
                  disabled={isLoading}
                >
                  Cancel
                </Button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function TaskQueue({
  profileId,
  leadId,
  shareId,
  agentId,
}: TaskQueueProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [filter, setFilter] = useState<"pending" | "completed">("pending");

  // Build query URL
  const buildQueryUrl = () => {
    const params = new URLSearchParams();
    if (profileId) params.append("profile_id", profileId.toString());
    if (leadId) params.append("lead_id", leadId.toString());
    if (shareId) params.append("share_id", shareId);
    if (agentId) params.append("agent_id", agentId);
    if (filter === "pending") {
      params.append("status", "pending");
    } else {
      params.append("status", "completed");
    }
    return `${CHATBOT_URL}/tasks?${params.toString()}`;
  };

  const queryKey = ["tasks", profileId, leadId, shareId, agentId, filter];

  const { data, isLoading, error, refetch } = useQuery<TasksResponse>({
    queryKey,
    queryFn: async () => {
      const response = await fetch(buildQueryUrl());
      if (!response.ok) {
        throw new Error("Failed to fetch tasks");
      }
      return response.json();
    },
    staleTime: 30 * 1000, // 30 seconds
    refetchInterval: 60 * 1000, // Refresh every minute
  });

  // Complete task mutation
  const completeMutation = useMutation({
    mutationFn: async ({ taskId, notes }: { taskId: number; notes: string }) => {
      const response = await fetch(`${CHATBOT_URL}/tasks/${taskId}/complete`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          completed_by: "Agent", // TODO: Get from auth context
          resolution_notes: notes || null,
        }),
      });
      if (!response.ok) {
        throw new Error("Failed to complete task");
      }
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tasks"] });
      toast({
        title: "Task completed",
        description: "The task has been marked as done.",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to complete task. Please try again.",
        variant: "destructive",
      });
    },
  });

  // Dismiss task mutation
  const dismissMutation = useMutation({
    mutationFn: async (taskId: number) => {
      const response = await fetch(`${CHATBOT_URL}/tasks/${taskId}/dismiss`, {
        method: "POST",
      });
      if (!response.ok) {
        throw new Error("Failed to dismiss task");
      }
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tasks"] });
      toast({
        title: "Task dismissed",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to dismiss task. Please try again.",
        variant: "destructive",
      });
    },
  });

  const handleComplete = (taskId: number, notes: string) => {
    completeMutation.mutate({ taskId, notes });
  };

  const handleDismiss = (taskId: number) => {
    dismissMutation.mutate(taskId);
  };

  const tasks = data?.tasks || [];
  const counts = data?.counts;
  const isMutating = completeMutation.isPending || dismissMutation.isPending;

  // Loading state
  if (isLoading) {
    return (
      <Card>
        <CardContent className="py-6 text-center">
          <Loader2 className="h-6 w-6 mx-auto animate-spin text-muted-foreground" />
          <p className="text-sm text-muted-foreground mt-2">Loading tasks...</p>
        </CardContent>
      </Card>
    );
  }

  // Error state
  if (error) {
    return (
      <Card className="border-red-200">
        <CardContent className="py-6 text-center">
          <AlertTriangle className="h-6 w-6 mx-auto text-red-500" />
          <p className="text-sm text-red-600 mt-2">Failed to load tasks</p>
          <Button
            variant="outline"
            size="sm"
            onClick={() => refetch()}
            className="mt-2"
          >
            Retry
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <Clock className="h-4 w-4" />
            Due Diligence Tasks
            {counts && counts.pending > 0 && (
              <Badge variant="destructive" className="text-xs">
                {counts.pending}
              </Badge>
            )}
          </CardTitle>
        </div>

        {/* Filter tabs */}
        <div className="flex gap-1 bg-gray-100 rounded-lg p-1 mt-2">
          <button
            onClick={() => setFilter("pending")}
            className={`flex-1 px-3 py-1 text-sm rounded transition-colors ${
              filter === "pending"
                ? "bg-white shadow text-gray-900"
                : "text-gray-500 hover:text-gray-700"
            }`}
          >
            Pending ({counts?.pending || 0})
          </button>
          <button
            onClick={() => setFilter("completed")}
            className={`flex-1 px-3 py-1 text-sm rounded transition-colors ${
              filter === "completed"
                ? "bg-white shadow text-gray-900"
                : "text-gray-500 hover:text-gray-700"
            }`}
          >
            Done ({counts?.completed || 0})
          </button>
        </div>
      </CardHeader>

      <CardContent className="pt-2">
        {tasks.length === 0 ? (
          <div className="text-center py-6">
            {filter === "pending" ? (
              <>
                <CheckCircle className="h-8 w-8 mx-auto text-green-500 mb-2" />
                <p className="text-sm text-muted-foreground">No pending tasks</p>
              </>
            ) : (
              <p className="text-sm text-muted-foreground">No completed tasks yet</p>
            )}
          </div>
        ) : (
          <div className="space-y-3">
            {tasks.map((task) => (
              <TaskCard
                key={task.id}
                task={task}
                onComplete={handleComplete}
                onDismiss={handleDismiss}
                isLoading={isMutating}
              />
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
