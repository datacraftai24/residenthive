import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Users, UserPlus, Mail, Phone, CheckCircle, Clock, XCircle, ArrowLeft } from "lucide-react";
import { Link } from "wouter";
import { useToast } from "@/hooks/use-toast";

interface BrokerageInfo {
  id: number;
  name: string;
  jurisdiction: string;
  verification_status: string;
  payment_status: string;
}

interface Agent {
  id: number;
  email: string;
  first_name: string;
  last_name: string;
  phone: string | null;
  designation: string | null;
  verification_status: string;
  compliance_acknowledged_at: string | null;
  created_at: string;
}

interface Invitation {
  id: number;
  email: string;
  name: string | null;
  phone: string | null;
  accepted_at: string | null;
  expires_at: string;
  created_at: string;
}

export default function DashboardAgentsPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [inviteDialogOpen, setInviteDialogOpen] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteName, setInviteName] = useState("");
  const [invitePhone, setInvitePhone] = useState("");

  // Get brokerage info
  const { data: brokerage } = useQuery<BrokerageInfo>({
    queryKey: ["/api/brokerages/me"],
  });

  const brokerageId = brokerage?.id;

  // Get agents
  const { data: agents = [], isLoading: agentsLoading } = useQuery<Agent[]>({
    queryKey: [`/api/brokerages/${brokerageId}/agents`],
    enabled: !!brokerageId,
  });

  // Get invitations
  const { data: invitations = [] } = useQuery<Invitation[]>({
    queryKey: [`/api/brokerages/${brokerageId}/invitations`],
    enabled: !!brokerageId,
  });

  const inviteMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/brokerages/${brokerageId}/invitations`, {
        email: inviteEmail,
        name: inviteName || null,
        phone: invitePhone || null,
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/brokerages/${brokerageId}/invitations`] });
      toast({ title: "Invitation sent", description: `Email sent to ${inviteEmail}` });
      setInviteDialogOpen(false);
      setInviteEmail("");
      setInviteName("");
      setInvitePhone("");
    },
    onError: (error: Error) => {
      toast({ title: "Failed to send", description: error.message, variant: "destructive" });
    },
  });

  const approveMutation = useMutation({
    mutationFn: async (agentId: number) => {
      const res = await apiRequest("POST", `/api/brokerages/${brokerageId}/agents/${agentId}/approve`);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/brokerages/${brokerageId}/agents`] });
      toast({ title: "Agent approved" });
    },
  });

  const pendingInvitations = invitations.filter((i) => !i.accepted_at && new Date(i.expires_at) > new Date());

  const getAgentStatus = (agent: Agent) => {
    if (agent.compliance_acknowledged_at) {
      return (
        <Badge className="bg-green-100 text-green-800">
          <CheckCircle className="h-3 w-3 mr-1" /> Active
        </Badge>
      );
    }
    return (
      <Badge className="bg-amber-100 text-amber-800">
        <Clock className="h-3 w-3 mr-1" /> Pending
      </Badge>
    );
  };

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-5xl mx-auto">
        <div className="flex items-center gap-3 mb-6">
          <Link href="/dashboard">
            <button className="text-gray-500 hover:text-gray-700">
              <ArrowLeft className="h-5 w-5" />
            </button>
          </Link>
          <Users className="h-6 w-6 text-blue-600" />
          <div>
            <h1 className="text-2xl font-bold">Team</h1>
            {brokerage && (
              <p className="text-sm text-gray-500">{brokerage.name}</p>
            )}
          </div>
          <div className="flex-1" />
          <Dialog open={inviteDialogOpen} onOpenChange={setInviteDialogOpen}>
            <DialogTrigger asChild>
              <Button>
                <UserPlus className="h-4 w-4 mr-2" /> Invite Agent
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Invite Agent</DialogTitle>
              </DialogHeader>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  inviteMutation.mutate();
                }}
                className="space-y-4"
              >
                <div className="space-y-2">
                  <Label>Email *</Label>
                  <Input
                    type="email"
                    value={inviteEmail}
                    onChange={(e) => setInviteEmail(e.target.value)}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label>Name</Label>
                  <Input
                    value={inviteName}
                    onChange={(e) => setInviteName(e.target.value)}
                    placeholder="Agent's full name"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Phone (optional pre-fill)</Label>
                  <Input
                    value={invitePhone}
                    onChange={(e) => setInvitePhone(e.target.value)}
                    placeholder="(617) 555-1234"
                  />
                  <p className="text-xs text-gray-500">Agent will enter and verify their own phone during onboarding.</p>
                </div>
                <Button type="submit" className="w-full" disabled={inviteMutation.isPending}>
                  {inviteMutation.isPending ? "Sending..." : "Send Invitation"}
                </Button>
              </form>
            </DialogContent>
          </Dialog>
        </div>

        <Tabs defaultValue="agents">
          <TabsList>
            <TabsTrigger value="agents">
              Agents ({agents.length})
            </TabsTrigger>
            <TabsTrigger value="invitations">
              Pending Invitations ({pendingInvitations.length})
            </TabsTrigger>
          </TabsList>

          <TabsContent value="agents">
            <Card>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Name</TableHead>
                      <TableHead>Email</TableHead>
                      <TableHead>Phone</TableHead>
                      <TableHead>Designation</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {agentsLoading ? (
                      <TableRow>
                        <TableCell colSpan={6} className="text-center py-8 text-gray-500">
                          Loading...
                        </TableCell>
                      </TableRow>
                    ) : agents.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={6} className="text-center py-8 text-gray-500">
                          No agents yet. Invite your first agent to get started.
                        </TableCell>
                      </TableRow>
                    ) : (
                      agents.map((agent) => (
                        <TableRow key={agent.id}>
                          <TableCell className="font-medium">
                            {agent.first_name} {agent.last_name}
                          </TableCell>
                          <TableCell>{agent.email}</TableCell>
                          <TableCell>
                            {agent.phone && (
                              <span className="flex items-center gap-1 text-sm">
                                <Phone className="h-3 w-3" /> {agent.phone}
                              </span>
                            )}
                          </TableCell>
                          <TableCell className="text-sm capitalize">
                            {agent.designation?.replace("_", " ") || "—"}
                          </TableCell>
                          <TableCell>{getAgentStatus(agent)}</TableCell>
                          <TableCell>
                            {agent.verification_status === "unverified" && (
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => approveMutation.mutate(agent.id)}
                              >
                                Approve
                              </Button>
                            )}
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="invitations">
            <Card>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Email</TableHead>
                      <TableHead>Name</TableHead>
                      <TableHead>Sent</TableHead>
                      <TableHead>Expires</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {pendingInvitations.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={5} className="text-center py-8 text-gray-500">
                          No pending invitations
                        </TableCell>
                      </TableRow>
                    ) : (
                      pendingInvitations.map((inv) => (
                        <TableRow key={inv.id}>
                          <TableCell>
                            <span className="flex items-center gap-1">
                              <Mail className="h-3 w-3" /> {inv.email}
                            </span>
                          </TableCell>
                          <TableCell>{inv.name || "—"}</TableCell>
                          <TableCell className="text-sm text-gray-500">
                            {new Date(inv.created_at).toLocaleDateString()}
                          </TableCell>
                          <TableCell className="text-sm text-gray-500">
                            {new Date(inv.expires_at).toLocaleDateString()}
                          </TableCell>
                          <TableCell>
                            <Badge className="bg-blue-100 text-blue-800">Invited</Badge>
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
