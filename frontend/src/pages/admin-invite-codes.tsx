import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { KeyRound, Plus, Trash2, ArrowLeft } from "lucide-react";
import { Link } from "wouter";
import { useToast } from "@/hooks/use-toast";

interface InviteCode {
  id: number;
  code: string;
  brokerage_name: string | null;
  jurisdiction: string | null;
  is_used: boolean;
  expires_at: string | null;
  revoked_at: string | null;
  created_at: string;
}

export default function AdminInviteCodesPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);

  const [brokerageName, setBrokerageName] = useState("");
  const [jurisdiction, setJurisdiction] = useState("");
  const [expiresInDays, setExpiresInDays] = useState("");

  const { data: codes = [], isLoading } = useQuery<InviteCode[]>({
    queryKey: ["/api/admin/invite-codes"],
  });

  const generateMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/admin/invite-codes", {
        brokerage_name: brokerageName || null,
        jurisdiction: jurisdiction || null,
        expires_in_days: expiresInDays ? parseInt(expiresInDays) : null,
      });
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/invite-codes"] });
      toast({
        title: "Code generated",
        description: `Code: ${data.code}`,
      });
      setDialogOpen(false);
      setBrokerageName("");
      setJurisdiction("");
      setExpiresInDays("");
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const revokeMutation = useMutation({
    mutationFn: async (codeId: number) => {
      await apiRequest("DELETE", `/api/admin/invite-codes/${codeId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/invite-codes"] });
      toast({ title: "Code revoked" });
    },
  });

  const getCodeStatus = (code: InviteCode) => {
    if (code.revoked_at) return <Badge className="bg-red-100 text-red-800">Revoked</Badge>;
    if (code.is_used) return <Badge className="bg-green-100 text-green-800">Used</Badge>;
    if (code.expires_at && new Date(code.expires_at) < new Date())
      return <Badge className="bg-gray-100 text-gray-800">Expired</Badge>;
    return <Badge className="bg-blue-100 text-blue-800">Active</Badge>;
  };

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-5xl mx-auto">
        <div className="flex items-center gap-3 mb-6">
          <Link href="/admin/brokerages">
            <button className="text-gray-500 hover:text-gray-700">
              <ArrowLeft className="h-5 w-5" />
            </button>
          </Link>
          <KeyRound className="h-6 w-6 text-blue-600" />
          <h1 className="text-2xl font-bold">Invite Codes</h1>
          <div className="flex-1" />
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button size="sm">
                <Plus className="h-4 w-4 mr-1" /> Generate Code
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Generate Invite Code</DialogTitle>
              </DialogHeader>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  generateMutation.mutate();
                }}
                className="space-y-4"
              >
                <div className="space-y-2">
                  <Label>Brokerage Name (optional)</Label>
                  <Input
                    value={brokerageName}
                    onChange={(e) => setBrokerageName(e.target.value)}
                    placeholder="Pre-fill for specific brokerage"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Jurisdiction (optional)</Label>
                  <Select value={jurisdiction} onValueChange={setJurisdiction}>
                    <SelectTrigger><SelectValue placeholder="Any" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="MA">Massachusetts</SelectItem>
                      <SelectItem value="ON">Ontario</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Expires in (days, optional)</Label>
                  <Input
                    type="number"
                    value={expiresInDays}
                    onChange={(e) => setExpiresInDays(e.target.value)}
                    placeholder="No expiry"
                  />
                </div>
                <Button type="submit" className="w-full" disabled={generateMutation.isPending}>
                  {generateMutation.isPending ? "Generating..." : "Generate Code"}
                </Button>
              </form>
            </DialogContent>
          </Dialog>
        </div>

        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Code</TableHead>
                  <TableHead>Brokerage</TableHead>
                  <TableHead>Jurisdiction</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center py-8 text-gray-500">Loading...</TableCell>
                  </TableRow>
                ) : codes.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center py-8 text-gray-500">No invite codes yet</TableCell>
                  </TableRow>
                ) : (
                  codes.map((c) => (
                    <TableRow key={c.id}>
                      <TableCell className="font-mono font-medium">{c.code}</TableCell>
                      <TableCell>{c.brokerage_name || "—"}</TableCell>
                      <TableCell>{c.jurisdiction || "Any"}</TableCell>
                      <TableCell>{getCodeStatus(c)}</TableCell>
                      <TableCell className="text-sm text-gray-500">
                        {new Date(c.created_at).toLocaleDateString()}
                      </TableCell>
                      <TableCell>
                        {!c.is_used && !c.revoked_at && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => revokeMutation.mutate(c.id)}
                            title="Revoke code"
                          >
                            <Trash2 className="h-4 w-4 text-red-500" />
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
      </div>
    </div>
  );
}
