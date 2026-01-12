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
  User,
  Lightbulb,
  Copy,
  CheckCheck,
  Sparkles,
} from "lucide-react";

const CHATBOT_URL = import.meta.env.VITE_CHATBOT_URL || 'http://localhost:8010';

// Research-related types
interface BuyerContext {
  name?: string;
  budget_min?: number;
  budget_max?: number;
  work_address?: string;
  lifestyle_drivers?: string[];
  must_have_features?: string[];
  dealbreakers?: string[];
}

interface ResearchData {
  analysis?: string;
  school_insights?: string;
  schools_mentioned?: string[];
  property_address?: string;
  verification_needed?: string;
  destination?: string;
  peak_time_mins?: number;
  off_peak_mins?: number;
  distance_km?: number;
  traffic_impact?: string;
  street_type?: string;
  traffic_level?: string;
  questions_to_ask?: string[];
  inspection_tips?: string[];
  buyer_question?: string;
  error?: string;
}

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
  // V9.2: Research fields
  research_data: ResearchData | null;
  research_status: "pending" | "processing" | "completed" | "failed" | null;
  research_completed_at: string | null;
  buyer_context: BuyerContext | null;
  action_steps: string[] | null;
  template_response: string | null;
  source_message: string | null;
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

// Research status badge component
function ResearchStatusBadge({ status }: { status: string | null }) {
  if (!status) return null;

  const styles: Record<string, { bg: string; text: string; icon: React.ReactNode }> = {
    pending: { bg: "bg-gray-100", text: "text-gray-600", icon: <Clock className="h-3 w-3" /> },
    processing: { bg: "bg-blue-100", text: "text-blue-700", icon: <Loader2 className="h-3 w-3 animate-spin" /> },
    completed: { bg: "bg-green-100", text: "text-green-700", icon: <Sparkles className="h-3 w-3" /> },
    failed: { bg: "bg-red-100", text: "text-red-700", icon: <AlertTriangle className="h-3 w-3" /> },
  };

  const style = styles[status] || styles.pending;

  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs ${style.bg} ${style.text}`}>
      {style.icon}
      {status === "processing" ? "Researching..." : status === "completed" ? "Research Ready" : status}
    </span>
  );
}

// Buyer context panel
function BuyerContextPanel({ context }: { context: BuyerContext }) {
  const formatBudget = (min?: number, max?: number) => {
    if (!min && !max) return "Not specified";
    const fmt = (n: number) => `$${(n / 1000).toFixed(0)}K`;
    if (min && max) return `${fmt(min)} - ${fmt(max)}`;
    if (min) return `${fmt(min)}+`;
    return `Up to ${fmt(max!)}`;
  };

  return (
    <div className="bg-purple-50 border border-purple-200 rounded-lg p-3">
      <div className="flex items-center gap-2 text-purple-800 font-medium text-sm mb-2">
        <User className="h-4 w-4" />
        Buyer Context
      </div>
      <div className="space-y-1 text-sm">
        {context.name && (
          <p><span className="text-purple-600">Name:</span> {context.name}</p>
        )}
        <p><span className="text-purple-600">Budget:</span> {formatBudget(context.budget_min, context.budget_max)}</p>
        {context.work_address && (
          <p><span className="text-purple-600">Work:</span> {context.work_address}</p>
        )}
        {context.lifestyle_drivers && context.lifestyle_drivers.length > 0 && (
          <p><span className="text-purple-600">Priorities:</span> {context.lifestyle_drivers.join(", ")}</p>
        )}
      </div>
    </div>
  );
}

// Research findings panel
function ResearchFindingsPanel({ data, taskType }: { data: ResearchData; taskType: string }) {
  // Format the main analysis text
  const getMainInsight = () => {
    if (data.school_insights) return data.school_insights;
    if (data.analysis) return data.analysis;
    return null;
  };

  const mainInsight = getMainInsight();

  return (
    <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
      <div className="flex items-center gap-2 text-blue-800 font-medium text-sm mb-2">
        <Search className="h-4 w-4" />
        Research Findings
      </div>

      {/* Main insight */}
      {mainInsight && (
        <p className="text-sm text-blue-900 whitespace-pre-wrap mb-2">{mainInsight}</p>
      )}

      {/* Commute-specific data */}
      {taskType === "verify_commute" && data.peak_time_mins && (
        <div className="grid grid-cols-2 gap-2 mt-2">
          <div className="bg-blue-100 rounded p-2 text-center">
            <div className="text-lg font-bold text-blue-800">{data.peak_time_mins} min</div>
            <div className="text-xs text-blue-600">Rush Hour</div>
          </div>
          {data.off_peak_mins && (
            <div className="bg-blue-100 rounded p-2 text-center">
              <div className="text-lg font-bold text-blue-800">{data.off_peak_mins} min</div>
              <div className="text-xs text-blue-600">Off-Peak</div>
            </div>
          )}
        </div>
      )}

      {/* Noise-specific data */}
      {taskType === "verify_noise" && data.traffic_level && (
        <div className="mt-2 flex gap-2">
          <Badge variant="outline" className="text-blue-700 border-blue-300">
            Traffic: {data.traffic_level}
          </Badge>
          {data.street_type && (
            <Badge variant="outline" className="text-blue-700 border-blue-300">
              {data.street_type}
            </Badge>
          )}
        </div>
      )}

      {/* Verification needed */}
      {data.verification_needed && (
        <div className="mt-2 p-2 bg-blue-100 rounded text-sm">
          <span className="font-medium text-blue-800">Next step:</span>{" "}
          <span className="text-blue-700">{data.verification_needed}</span>
        </div>
      )}

      {/* Questions to ask (HOA) */}
      {data.questions_to_ask && data.questions_to_ask.length > 0 && (
        <div className="mt-2">
          <p className="text-sm font-medium text-blue-800 mb-1">Questions to ask:</p>
          <ul className="text-sm text-blue-700 list-disc pl-4 space-y-0.5">
            {data.questions_to_ask.map((q, i) => (
              <li key={i}>{q}</li>
            ))}
          </ul>
        </div>
      )}

      {/* Inspection tips */}
      {data.inspection_tips && data.inspection_tips.length > 0 && (
        <div className="mt-2">
          <p className="text-sm font-medium text-blue-800 mb-1">Inspection tips:</p>
          <ul className="text-sm text-blue-700 list-disc pl-4 space-y-0.5">
            {data.inspection_tips.map((tip, i) => (
              <li key={i}>{tip}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

// Action steps panel
function ActionStepsPanel({ steps }: { steps: string[] }) {
  return (
    <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
      <div className="flex items-center gap-2 text-amber-800 font-medium text-sm mb-2">
        <Lightbulb className="h-4 w-4" />
        Suggested Validation Steps
      </div>
      <ol className="text-sm text-amber-900 list-decimal pl-4 space-y-1">
        {steps.map((step, i) => (
          <li key={i}>{step}</li>
        ))}
      </ol>
    </div>
  );
}

// Template response panel
function TemplateResponsePanel({ template, buyerName }: { template: string; buyerName?: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(template);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="bg-green-50 border border-green-200 rounded-lg p-3">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2 text-green-800 font-medium text-sm">
          <FileText className="h-4 w-4" />
          Template Response {buyerName && `for ${buyerName}`}
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={handleCopy}
          className="h-7 px-2 text-green-700 hover:text-green-900 hover:bg-green-100"
        >
          {copied ? (
            <>
              <CheckCheck className="h-3 w-3 mr-1" />
              Copied
            </>
          ) : (
            <>
              <Copy className="h-3 w-3 mr-1" />
              Copy
            </>
          )}
        </Button>
      </div>
      <p className="text-sm text-green-900 whitespace-pre-wrap bg-white rounded p-2 border border-green-200">
        {template}
      </p>
    </div>
  );
}

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
  const [expanded, setExpanded] = useState(false);

  const isResolved = task.status === "completed" || task.status === "dismissed";
  const hasResearch = task.research_status === "completed" && task.research_data;
  const isResearching = task.research_status === "processing";

  return (
    <div className={`border rounded-lg ${isResolved ? "bg-slate-50 opacity-75" : "hover:bg-gray-50"}`}>
      {/* Task header - clickable to expand */}
      <div
        className={`p-3 ${hasResearch ? "cursor-pointer" : ""}`}
        onClick={() => hasResearch && setExpanded(!expanded)}
      >
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
              {/* Research status badge */}
              {!isResolved && (
                <ResearchStatusBadge status={task.research_status} />
              )}
            </div>

            {task.description && !isResolved && !expanded && (
              <p className="text-sm text-muted-foreground mt-1 line-clamp-2">{task.description}</p>
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

            {/* Timestamp and expand indicator */}
            <div className="flex items-center justify-between mt-2">
              <p className="text-xs text-muted-foreground">
                {formatDistanceToNow(new Date(task.created_at), { addSuffix: true })}
              </p>
              {hasResearch && (
                <span className="text-xs text-blue-600 flex items-center gap-1">
                  {expanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                  {expanded ? "Hide research" : "View research"}
                </span>
              )}
            </div>

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
      </div>

      {/* Expanded research panel */}
      {expanded && hasResearch && (
        <div className="px-3 pb-3 space-y-3 border-t pt-3 bg-gray-50">
          {/* Original buyer message */}
          {task.source_message && (
            <div className="bg-white border rounded-lg p-3">
              <p className="text-xs text-muted-foreground mb-1">Original Question</p>
              <p className="text-sm italic">"{task.source_message}"</p>
            </div>
          )}

          {/* Buyer context */}
          {task.buyer_context && (
            <BuyerContextPanel context={task.buyer_context} />
          )}

          {/* Research findings */}
          {task.research_data && (
            <ResearchFindingsPanel data={task.research_data} taskType={task.task_type} />
          )}

          {/* Action steps */}
          {task.action_steps && task.action_steps.length > 0 && (
            <ActionStepsPanel steps={task.action_steps} />
          )}

          {/* Template response */}
          {task.template_response && (
            <TemplateResponsePanel
              template={task.template_response}
              buyerName={task.buyer_context?.name}
            />
          )}
        </div>
      )}

      {/* Researching indicator */}
      {isResearching && !expanded && (
        <div className="px-3 pb-3">
          <div className="flex items-center gap-2 text-sm text-blue-600 bg-blue-50 rounded p-2">
            <Loader2 className="h-4 w-4 animate-spin" />
            Generating research and action steps...
          </div>
        </div>
      )}

      {/* Actions (only for pending) */}
      {task.status === "pending" && (
        <div className="px-3 pb-3">
          {!showNotes ? (
            <div className="flex gap-2">
              <Button
                onClick={(e) => {
                  e.stopPropagation();
                  setShowNotes(true);
                }}
                size="sm"
                className="flex-1 bg-green-600 hover:bg-green-700"
                disabled={isLoading}
              >
                <CheckCircle className="h-4 w-4 mr-1" />
                Mark Complete
              </Button>
              <Button
                onClick={(e) => {
                  e.stopPropagation();
                  onDismiss(task.id);
                }}
                size="sm"
                variant="outline"
                disabled={isLoading}
              >
                <XCircle className="h-4 w-4 mr-1" />
                Dismiss
              </Button>
            </div>
          ) : (
            <div className="space-y-2" onClick={(e) => e.stopPropagation()}>
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
