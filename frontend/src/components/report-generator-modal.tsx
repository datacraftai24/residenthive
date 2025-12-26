import { useState, useEffect, useRef } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Card, CardContent } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import {
  FileText,
  Loader2,
  CheckCircle,
  Circle,
  Copy,
  ExternalLink,
  X
} from 'lucide-react';

type GenerationStep =
  | 'idle'
  | 'searching'
  | 'analyzing'
  | 'generating'
  | 'preview'
  | 'error';

interface ReportGeneratorModalProps {
  profileId: number;
  profileName: string;
  isOpen: boolean;
  onClose: () => void;
}

interface ReportResult {
  shareId: string;
  shareUrl: string;
  synthesis?: {
    intro_paragraph?: string;
    ranked_picks?: Array<{
      mlsNumber: string;
      label: string;
      why: string;
    }>;
  };
  includedCount: number;
}

export default function ReportGeneratorModal({
  profileId,
  profileName,
  isOpen,
  onClose
}: ReportGeneratorModalProps) {
  const [step, setStep] = useState<GenerationStep>('idle');
  const [searchId, setSearchId] = useState<string | null>(null);
  const [reportResult, setReportResult] = useState<ReportResult | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const abortControllerRef = useRef<AbortController | null>(null);
  const { toast } = useToast();

  // Internal tracking (not exposed to UI)
  const [visionComplete, setVisionComplete] = useState(false);
  const [locationComplete, setLocationComplete] = useState(false);

  // Reset state when modal opens
  useEffect(() => {
    if (isOpen) {
      setStep('idle');
      setSearchId(null);
      setReportResult(null);
      setErrorMessage(null);
      setVisionComplete(false);
      setLocationComplete(false);
    }
  }, [isOpen]);

  // Start generation when modal opens
  useEffect(() => {
    if (isOpen && step === 'idle') {
      generateReport();
    }
  }, [isOpen, step]);

  const pollWithTimeout = async (
    url: string,
    searchId: string,
    timeout: number,
    signal: AbortSignal
  ): Promise<any> => {
    const startTime = Date.now();
    const pollInterval = 5000; // 5 seconds

    while (Date.now() - startTime < timeout) {
      if (signal.aborted) {
        throw new Error('cancelled');
      }

      try {
        const response = await fetch(`${url}?searchId=${searchId}`, { signal });
        const data = await response.json();

        // Check if analysis is complete
        if (url.includes('photos') && data.photo_analysis && Object.keys(data.photo_analysis).length > 0) {
          return data;
        }
        if (url.includes('location') && data.location_analysis && Object.keys(data.location_analysis).length > 0) {
          return data;
        }
      } catch (err: any) {
        if (err.name === 'AbortError' || err.message === 'cancelled') {
          throw new Error('cancelled');
        }
        // Continue polling on network errors
      }

      // Wait before next poll
      await new Promise(resolve => setTimeout(resolve, pollInterval));
    }

    // Timeout reached - return null to indicate incomplete
    return null;
  };

  const generateReport = async () => {
    abortControllerRef.current = new AbortController();
    const signal = abortControllerRef.current.signal;

    try {
      // Step 1: Search
      setStep('searching');

      const searchRes = await fetch('/api/agent-search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          profileId,
          useReactive: true,
          forceEnhanced: false
        }),
        signal
      });

      if (!searchRes.ok) {
        throw new Error('search-failed');
      }

      const searchData = await searchRes.json();
      const newSearchId = searchData.searchId;
      setSearchId(newSearchId);

      // Check if we have listings
      if (!searchData.initialSearch?.view2?.listings?.length) {
        throw new Error('no-listings');
      }

      // Step 2: Analyze (poll for both in parallel)
      setStep('analyzing');

      const [photoResult, locationResult] = await Promise.allSettled([
        pollWithTimeout('/api/agent-search/photos', newSearchId, 240000, signal),
        pollWithTimeout('/api/agent-search/location', newSearchId, 240000, signal)
      ]);

      // Track completion internally
      const photosComplete = photoResult.status === 'fulfilled' && photoResult.value !== null;
      const locationsComplete = locationResult.status === 'fulfilled' && locationResult.value !== null;

      setVisionComplete(photosComplete);
      setLocationComplete(locationsComplete);

      // Step 3: Generate report
      setStep('generating');

      const reportRes = await fetch('/api/buyer-reports', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          searchId: newSearchId,
          profileId,
          allowPartial: !photosComplete // Tell backend to be conservative if photos incomplete
        }),
        signal
      });

      if (!reportRes.ok) {
        const errorData = await reportRes.json().catch(() => ({}));
        throw new Error(errorData.detail || 'report-failed');
      }

      const reportData = await reportRes.json();

      setReportResult({
        shareId: reportData.shareId,
        shareUrl: reportData.shareUrl || `/buyer-report/${reportData.shareId}`,
        synthesis: reportData.synthesis,
        includedCount: reportData.includedCount || 5
      });

      setStep('preview');

    } catch (err: any) {
      if (err.message === 'cancelled') {
        // User cancelled - just close
        return;
      }

      setStep('error');

      // Set user-friendly error message
      if (err.message === 'no-listings') {
        setErrorMessage('No matching properties found for this buyer');
      } else if (err.message === 'search-failed') {
        setErrorMessage('Something went wrong. Try again?');
      } else if (err.message === 'report-failed') {
        setErrorMessage('Something went wrong. Try again?');
      } else {
        setErrorMessage('Something went wrong. Try again?');
      }
    }
  };

  const handleCancel = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    onClose();
    toast({
      title: 'You can generate the report again anytime.',
    });
  };

  const copyToClipboard = async () => {
    if (!reportResult) return;

    const fullUrl = `${window.location.origin}${reportResult.shareUrl}`;
    try {
      await navigator.clipboard.writeText(fullUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
      toast({ title: 'Link copied!' });
    } catch {
      toast({
        title: 'Unable to copy',
        description: 'Please copy the link manually',
        variant: 'destructive'
      });
    }
  };

  const handleViewReport = () => {
    if (reportResult) {
      window.open(reportResult.shareUrl, '_blank');
    }
  };

  const handleRetry = () => {
    setStep('idle');
    setErrorMessage(null);
    generateReport();
  };

  // Step display helper
  const getStepStatus = (stepName: GenerationStep) => {
    const stepOrder: GenerationStep[] = ['searching', 'analyzing', 'generating'];
    const currentIndex = stepOrder.indexOf(step);
    const stepIndex = stepOrder.indexOf(stepName);

    if (step === 'preview' || step === 'error') {
      // All steps complete or errored
      return step === 'preview' ? 'complete' : (currentIndex >= stepIndex ? 'complete' : 'pending');
    }

    if (stepIndex < currentIndex) return 'complete';
    if (stepIndex === currentIndex) return 'current';
    return 'pending';
  };

  const StepIndicator = ({ stepName, label }: { stepName: GenerationStep; label: string }) => {
    const status = getStepStatus(stepName);

    return (
      <div className="flex items-center gap-3">
        {status === 'complete' && (
          <CheckCircle className="h-5 w-5 text-green-600" />
        )}
        {status === 'current' && (
          <Loader2 className="h-5 w-5 text-blue-600 animate-spin" />
        )}
        {status === 'pending' && (
          <Circle className="h-5 w-5 text-gray-300" />
        )}
        <span className={`text-sm ${
          status === 'complete' ? 'text-green-600' :
          status === 'current' ? 'text-blue-600 font-medium' :
          'text-gray-400'
        }`}>
          {label}
          {status === 'current' && '...'}
        </span>
      </div>
    );
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && handleCancel()}>
      <DialogContent className="sm:max-w-md">
        {step !== 'preview' && step !== 'error' && (
          <>
            <DialogHeader>
              <DialogTitle>Preparing Your Buyer Report</DialogTitle>
              <DialogDescription>
                {profileName}'s personalized property report
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-4">
              <StepIndicator stepName="searching" label="Finding matching properties" />
              <StepIndicator stepName="analyzing" label="Reviewing details" />
              <StepIndicator stepName="generating" label="Building your report" />
            </div>

            <p className="text-sm text-gray-500 text-center">
              You can continue working while this prepares.
            </p>

            <div className="flex justify-center pt-2">
              <Button variant="outline" onClick={handleCancel}>
                Cancel
              </Button>
            </div>
          </>
        )}

        {step === 'preview' && reportResult && (
          <>
            <DialogHeader>
              <DialogTitle className="text-green-600 flex items-center gap-2">
                <CheckCircle className="h-5 w-5" />
                Your Report is Ready
              </DialogTitle>
            </DialogHeader>

            <Card className="mt-4">
              <CardContent className="pt-4">
                <div className="space-y-2">
                  <div className="flex items-center gap-2 text-sm">
                    <FileText className="h-4 w-4 text-gray-500" />
                    <span className="font-medium">{reportResult.includedCount} properties for {profileName}</span>
                  </div>
                  <p className="text-xs text-gray-500">
                    Created {new Date().toLocaleDateString()}
                  </p>
                </div>
              </CardContent>
            </Card>

            <p className="text-sm text-gray-500 text-center mt-4">
              You can review before sharing.
            </p>

            <div className="flex gap-2 mt-4">
              <Button onClick={handleViewReport} className="flex-1">
                <ExternalLink className="h-4 w-4 mr-2" />
                View Full Report
              </Button>
              <Button
                variant="outline"
                onClick={copyToClipboard}
                className="flex-1"
              >
                {copied ? (
                  <CheckCircle className="h-4 w-4 mr-2" />
                ) : (
                  <Copy className="h-4 w-4 mr-2" />
                )}
                {copied ? 'Copied!' : 'Copy Link'}
              </Button>
            </div>

            <div className="flex justify-center pt-2">
              <Button variant="ghost" onClick={onClose}>
                Close
              </Button>
            </div>
          </>
        )}

        {step === 'error' && (
          <>
            <DialogHeader>
              <DialogTitle>{errorMessage}</DialogTitle>
            </DialogHeader>

            <div className="flex gap-2 mt-4">
              <Button onClick={handleRetry} className="flex-1">
                Try Again
              </Button>
              <Button variant="outline" onClick={onClose} className="flex-1">
                Close
              </Button>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
