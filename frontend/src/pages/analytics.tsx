import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Activity, Clock, BarChart3, Target, TrendingUp, Users } from "lucide-react";

interface Transaction {
  id: number;
  transactionId: string;
  profileId: number;
  searchMethod: string;
  searchTrigger: string;
  rawListingsCount: number;
  scoredListingsCount: number;
  topPicksCount: number;
  otherMatchesCount: number;
  visualAnalysisCount: number;
  totalExecutionTime: number;
  apiCallsCount: number;
  averageScore: string;
  dealbreakerPropertiesCount: number;
  createdAt: string;
}

export default function Analytics() {
  const [selectedProfileId, setSelectedProfileId] = useState<number | null>(null);
  const [selectedTransactionId, setSelectedTransactionId] = useState<string | null>(null);

  // Get all buyer profiles for selection
  const { data: profiles } = useQuery<any[]>({
    queryKey: ["/api/buyer-profiles"],
  });

  // Get transactions for selected profile
  const { data: transactions, isLoading: transactionsLoading } = useQuery<Transaction[]>({
    queryKey: ["/api/profiles", selectedProfileId, "transactions"],
    enabled: !!selectedProfileId,
  });

  // Get detailed transaction data
  const { data: transactionDetail, isLoading: detailLoading } = useQuery({
    queryKey: ["/api/transactions", selectedTransactionId],
    enabled: !!selectedTransactionId,
  });

  return (
    <div className="container mx-auto p-6">
      <div className="mb-6">
        <h1 className="text-3xl font-bold">Search Analytics & Machine Learning Data</h1>
        <p className="text-gray-600 mt-2">
          Monitor search transactions and agent interactions for AI improvement
        </p>
      </div>

      {/* Profile Selection */}
      <div className="mb-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Users className="h-5 w-5" />
              Select Buyer Profile
            </CardTitle>
            <CardDescription>
              Choose a buyer profile to view their search transaction history
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {profiles?.map((profile) => (
                <Card 
                  key={profile.id} 
                  className={`cursor-pointer transition-colors ${
                    selectedProfileId === profile.id 
                      ? 'ring-2 ring-blue-500 bg-blue-50' 
                      : 'hover:bg-gray-50'
                  }`}
                  onClick={() => setSelectedProfileId(profile.id)}
                >
                  <CardContent className="p-4">
                    <div className="font-medium">{profile.name}</div>
                    <div className="text-sm text-gray-600">{profile.email}</div>
                    <div className="text-sm text-gray-500 mt-1">
                      Budget: ${profile.budgetMin?.toLocaleString()} - ${profile.budgetMax?.toLocaleString()}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Transaction History */}
      {selectedProfileId && (
        <div className="mb-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Activity className="h-5 w-5" />
                Search Transaction History
              </CardTitle>
              <CardDescription>
                Recent search transactions with performance metrics
              </CardDescription>
            </CardHeader>
            <CardContent>
              {transactionsLoading ? (
                <div className="text-center py-8">Loading transactions...</div>
              ) : transactions && transactions.length > 0 ? (
                <div className="space-y-4">
                  {transactions.map((transaction) => (
                    <Card 
                      key={transaction.transactionId}
                      className={`cursor-pointer transition-colors ${
                        selectedTransactionId === transaction.transactionId 
                          ? 'ring-2 ring-green-500 bg-green-50' 
                          : 'hover:bg-gray-50'
                      }`}
                      onClick={() => setSelectedTransactionId(transaction.transactionId)}
                    >
                      <CardContent className="p-4">
                        <div className="flex justify-between items-start mb-3">
                          <div className="flex items-center gap-2">
                            <Badge variant="outline">
                              {transaction.searchMethod}
                            </Badge>
                            <Badge variant="secondary">
                              {transaction.searchTrigger.replace('_', ' ')}
                            </Badge>
                            <span className="text-sm text-gray-500">
                              {new Date(transaction.createdAt).toLocaleString()}
                            </span>
                          </div>
                          <div className="flex items-center gap-1 text-sm text-gray-500">
                            <Clock className="h-4 w-4" />
                            {transaction.totalExecutionTime}ms
                          </div>
                        </div>
                        
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                          <div>
                            <div className="font-medium text-gray-900">
                              {transaction.rawListingsCount}
                            </div>
                            <div className="text-gray-500">Raw Listings</div>
                          </div>
                          <div>
                            <div className="font-medium text-green-600">
                              {transaction.topPicksCount}
                            </div>
                            <div className="text-gray-500">Top Picks</div>
                          </div>
                          <div>
                            <div className="font-medium text-blue-600">
                              {transaction.otherMatchesCount}
                            </div>
                            <div className="text-gray-500">Other Matches</div>
                          </div>
                          <div>
                            <div className="font-medium text-purple-600">
                              {transaction.visualAnalysisCount}
                            </div>
                            <div className="text-gray-500">Visual Analysis</div>
                          </div>
                        </div>

                        {transaction.averageScore && (
                          <div className="mt-3 pt-3 border-t">
                            <div className="flex items-center gap-2">
                              <Target className="h-4 w-4 text-gray-500" />
                              <span className="text-sm">
                                Average Score: <span className="font-medium">{parseFloat(transaction.averageScore).toFixed(1)}</span>
                              </span>
                              {transaction.dealbreakerPropertiesCount > 0 && (
                                <Badge variant="destructive" className="ml-2">
                                  {transaction.dealbreakerPropertiesCount} dealbreakers
                                </Badge>
                              )}
                            </div>
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  ))}
                </div>
              ) : (
                <div className="text-center py-8 text-gray-500">
                  No search transactions found for this profile
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {/* Transaction Detail */}
      {selectedTransactionId && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <BarChart3 className="h-5 w-5" />
              Transaction Detail & Machine Learning Data
            </CardTitle>
            <CardDescription>
              Complete transaction data captured for AI training and improvement
            </CardDescription>
          </CardHeader>
          <CardContent>
            {detailLoading ? (
              <div className="text-center py-8">Loading transaction details...</div>
            ) : transactionDetail ? (
              <div className="space-y-6">
                {/* Transaction Overview */}
                <div>
                  <h3 className="font-semibold text-lg mb-3">Transaction Overview</h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    <Card className="p-4">
                      <div className="text-2xl font-bold text-blue-600">
                        {transactionDetail.transaction?.searchMethod}
                      </div>
                      <div className="text-sm text-gray-500">Search Method</div>
                    </Card>
                    <Card className="p-4">
                      <div className="text-2xl font-bold text-green-600">
                        {transactionDetail.transaction?.totalExecutionTime}ms
                      </div>
                      <div className="text-sm text-gray-500">Execution Time</div>
                    </Card>
                    <Card className="p-4">
                      <div className="text-2xl font-bold text-purple-600">
                        {transactionDetail.transaction?.apiCallsCount}
                      </div>
                      <div className="text-sm text-gray-500">API Calls</div>
                    </Card>
                  </div>
                </div>

                <Separator />

                {/* Search Results Summary */}
                {transactionDetail.results && (
                  <div>
                    <h3 className="font-semibold text-lg mb-3">Search Results Data</h3>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                      <Card className="p-4 text-center">
                        <div className="text-xl font-bold">{transactionDetail.results.topResults?.length || 0}</div>
                        <div className="text-sm text-gray-500">Top Results</div>
                      </Card>
                      <Card className="p-4 text-center">
                        <div className="text-xl font-bold">{transactionDetail.results.topPicksData?.length || 0}</div>
                        <div className="text-sm text-gray-500">Top Picks</div>
                      </Card>
                      <Card className="p-4 text-center">
                        <div className="text-xl font-bold">{transactionDetail.results.otherMatchesData?.length || 0}</div>
                        <div className="text-sm text-gray-500">Other Matches</div>
                      </Card>
                      <Card className="p-4 text-center">
                        <div className="text-xl font-bold">{transactionDetail.results.visualAnalysisData?.length || 0}</div>
                        <div className="text-sm text-gray-500">Visual Analysis</div>
                      </Card>
                    </div>
                  </div>
                )}

                <Separator />

                {/* Agent Interactions */}
                {transactionDetail.interactions && transactionDetail.interactions.length > 0 && (
                  <div>
                    <h3 className="font-semibold text-lg mb-3">Agent Interactions</h3>
                    <div className="space-y-3">
                      {transactionDetail.interactions.map((interaction: any, index: number) => (
                        <Card key={index} className="p-4">
                          <div className="flex justify-between items-start mb-2">
                            <Badge variant="outline">{interaction.interactionType}</Badge>
                            <span className="text-sm text-gray-500">
                              {new Date(interaction.createdAt).toLocaleString()}
                            </span>
                          </div>
                          {interaction.listingId && (
                            <div className="text-sm text-gray-600 mb-2">
                              Listing: {interaction.listingId}
                            </div>
                          )}
                          <div className="text-sm">
                            <pre className="whitespace-pre-wrap text-xs bg-gray-50 p-2 rounded">
                              {JSON.stringify(interaction.interactionData, null, 2)}
                            </pre>
                          </div>
                        </Card>
                      ))}
                    </div>
                  </div>
                )}

                <Separator />

                {/* Search Outcomes */}
                {transactionDetail.outcomes && (
                  <div>
                    <h3 className="font-semibold text-lg mb-3">Search Outcomes</h3>
                    <Card className="p-4">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {transactionDetail.outcomes.agentSatisfactionRating && (
                          <div>
                            <div className="text-lg font-semibold">
                              {transactionDetail.outcomes.agentSatisfactionRating}/10
                            </div>
                            <div className="text-sm text-gray-500">Agent Satisfaction</div>
                          </div>
                        )}
                        {transactionDetail.outcomes.searchQualityRating && (
                          <div>
                            <div className="text-lg font-semibold">
                              {transactionDetail.outcomes.searchQualityRating}/10
                            </div>
                            <div className="text-sm text-gray-500">Search Quality</div>
                          </div>
                        )}
                        {transactionDetail.outcomes.propertiesClicked && (
                          <div>
                            <div className="text-lg font-semibold">
                              {transactionDetail.outcomes.propertiesClicked.length}
                            </div>
                            <div className="text-sm text-gray-500">Properties Clicked</div>
                          </div>
                        )}
                        {transactionDetail.outcomes.totalSessionTime && (
                          <div>
                            <div className="text-lg font-semibold">
                              {Math.round(transactionDetail.outcomes.totalSessionTime / 1000)}s
                            </div>
                            <div className="text-sm text-gray-500">Session Time</div>
                          </div>
                        )}
                      </div>
                      {transactionDetail.outcomes.agentNotes && (
                        <div className="mt-4 pt-4 border-t">
                          <div className="font-medium mb-2">Agent Notes:</div>
                          <div className="text-sm text-gray-600">
                            {transactionDetail.outcomes.agentNotes}
                          </div>
                        </div>
                      )}
                    </Card>
                  </div>
                )}
              </div>
            ) : (
              <div className="text-center py-8 text-gray-500">
                No transaction details available
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}