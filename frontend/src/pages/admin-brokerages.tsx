import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Building2, Plus, RefreshCw, Shield, Users, ArrowLeft } from "lucide-react";
import { Link } from "wouter";
import { useToast } from "@/hooks/use-toast";

interface Brokerage {
  id: number;
  name: string;
  broker_of_record_name: string;
  phone: string | null;
  license_number: string | null;
  jurisdiction: string;
  verification_status: string;
  payment_status: string;
  mls_pin_brokerage_id: string | null;
  clerk_user_id: string | null;
  agent_count: number;
  created_at: string;
}

export default function AdminBrokeragesPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);

  // Form state
  const [name, setName] = useState("");
  const [brokerOfRecord, setBrokerOfRecord] = useState("");
  const [jurisdiction, setJurisdiction] = useState("MA");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [licenseNumber, setLicenseNumber] = useState("");

  const { data: brokerages = [], isLoading } = useQuery<Brokerage[]>({
    queryKey: ["/api/admin/brokerages"],
  });

  const createMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/admin/brokerages", {
        name,
        broker_of_record_name: brokerOfRecord,
        email,
        jurisdiction,
        phone: phone || null,
        license_number: licenseNumber || null,
      });
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/brokerages"] });
      toast({
        title: "Brokerage created",
        description: `${name} — ${data.verification_status === "verified" ? "MLS Verified" : "Not verified"}`,
      });
      setDialogOpen(false);
      // Reset form
      setName("");
      setBrokerOfRecord("");
      setEmail("");
      setPhone("");
      setLicenseNumber("");
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const verifyMutation = useMutation({
    mutationFn: async (brokerageId: number) => {
      const res = await apiRequest("POST", `/api/admin/brokerages/${brokerageId}/verify`);
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/brokerages"] });
      toast({
        title: data.mls_match ? "MLS Verified" : "No MLS Match",
        description: data.mls_match
          ? `Matched: ${data.mls_match.name}`
          : "Brokerage not found in MLS directory",
      });
    },
  });

  const statusBadge = (status: string) => {
    const colors: Record<string, string> = {
      verified: "bg-green-100 text-green-800",
      unverified: "bg-gray-100 text-gray-800",
      invite_code: "bg-blue-100 text-blue-800",
      active: "bg-green-100 text-green-800",
      pending: "bg-amber-100 text-amber-800",
      suspended: "bg-red-100 text-red-800",
    };
    return <Badge className={colors[status] || "bg-gray-100"}>{status}</Badge>;
  };

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-6xl mx-auto">
        <div className="flex items-center gap-3 mb-6">
          <Link href="/dashboard">
            <button className="text-gray-500 hover:text-gray-700">
              <ArrowLeft className="h-5 w-5" />
            </button>
          </Link>
          <Building2 className="h-6 w-6 text-blue-600" />
          <h1 className="text-2xl font-bold">Brokerages</h1>
          <div className="flex-1" />
          <Link href="/admin/invite-codes">
            <Button variant="outline" size="sm">Invite Codes</Button>
          </Link>
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button size="sm">
                <Plus className="h-4 w-4 mr-1" /> Create Brokerage
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Create Brokerage</DialogTitle>
              </DialogHeader>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  createMutation.mutate();
                }}
                className="space-y-4"
              >
                <div className="space-y-2">
                  <Label>Brokerage Name *</Label>
                  <Input value={name} onChange={(e) => setName(e.target.value)} required />
                </div>
                <div className="space-y-2">
                  <Label>Broker of Record *</Label>
                  <Input value={brokerOfRecord} onChange={(e) => setBrokerOfRecord(e.target.value)} required />
                </div>
                <div className="space-y-2">
                  <Label>Broker Email *</Label>
                  <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="broker@example.com" required />
                  <p className="text-xs text-gray-500">Welcome email will be sent. Auto-links when they sign up.</p>
                </div>
                <div className="space-y-2">
                  <Label>Jurisdiction *</Label>
                  <Select value={jurisdiction} onValueChange={setJurisdiction}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="MA">Massachusetts</SelectItem>
                      <SelectItem value="ON">Ontario</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Phone</Label>
                  <Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="(617) 555-1234" />
                </div>
                <div className="space-y-2">
                  <Label>License Number</Label>
                  <Input value={licenseNumber} onChange={(e) => setLicenseNumber(e.target.value)} />
                </div>
                <Button type="submit" className="w-full" disabled={createMutation.isPending}>
                  {createMutation.isPending ? "Creating..." : "Create & Verify"}
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
                  <TableHead>Name</TableHead>
                  <TableHead>Broker of Record</TableHead>
                  <TableHead>Jurisdiction</TableHead>
                  <TableHead>MLS Status</TableHead>
                  <TableHead>Payment</TableHead>
                  <TableHead>Agents</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center py-8 text-gray-500">Loading...</TableCell>
                  </TableRow>
                ) : brokerages.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center py-8 text-gray-500">No brokerages yet</TableCell>
                  </TableRow>
                ) : (
                  brokerages.map((b) => (
                    <TableRow key={b.id}>
                      <TableCell className="font-medium">{b.name}</TableCell>
                      <TableCell>{b.broker_of_record_name}</TableCell>
                      <TableCell>{b.jurisdiction}</TableCell>
                      <TableCell>{statusBadge(b.verification_status)}</TableCell>
                      <TableCell>{statusBadge(b.payment_status)}</TableCell>
                      <TableCell>
                        <span className="flex items-center gap-1">
                          <Users className="h-3 w-3" /> {b.agent_count}
                        </span>
                      </TableCell>
                      <TableCell>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => verifyMutation.mutate(b.id)}
                          disabled={verifyMutation.isPending}
                          title="Re-run MLS verification"
                        >
                          <RefreshCw className="h-4 w-4" />
                        </Button>
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
