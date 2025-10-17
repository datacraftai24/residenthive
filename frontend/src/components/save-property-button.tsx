import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Heart } from 'lucide-react';
import { apiRequest } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';

interface SavePropertyButtonProps {
  profileId: number;
  listingId: string;
  isSaved?: boolean;
  onSaveChange?: (saved: boolean) => void;
  variant?: 'heart' | 'checkbox';
}

export function SavePropertyButton({ 
  profileId, 
  listingId, 
  isSaved: initialSaved = false,
  onSaveChange,
  variant = 'heart'
}: SavePropertyButtonProps) {
  const [isSaved, setIsSaved] = useState(initialSaved);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const saveMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest('POST', `/api/buyer-profiles/${profileId}/properties`, {
        listing_id: listingId,
        interaction_type: 'saved'
      });
      return response.json();
    },
    onSuccess: () => {
      setIsSaved(true);
      onSaveChange?.(true);
      queryClient.invalidateQueries({ queryKey: [`/api/buyer-profiles/${profileId}/properties`] });
      toast({
        title: 'Property saved',
        description: 'Added to your saved properties'
      });
    },
    onError: () => {
      toast({
        title: 'Error',
        description: 'Failed to save property',
        variant: 'destructive'
      });
    }
  });

  const removeMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest('DELETE', `/api/buyer-profiles/${profileId}/properties/${listingId}`);
      return response.json();
    },
    onSuccess: () => {
      setIsSaved(false);
      onSaveChange?.(false);
      queryClient.invalidateQueries({ queryKey: [`/api/buyer-profiles/${profileId}/properties`] });
      toast({
        title: 'Property removed',
        description: 'Removed from saved properties'
      });
    },
    onError: () => {
      toast({
        title: 'Error',
        description: 'Failed to remove property',
        variant: 'destructive'
      });
    }
  });

  const handleClick = () => {
    if (isSaved) {
      removeMutation.mutate();
    } else {
      saveMutation.mutate();
    }
  };

  if (variant === 'checkbox') {
    return (
      <Checkbox
        checked={isSaved}
        onCheckedChange={handleClick}
        disabled={saveMutation.isPending || removeMutation.isPending}
      />
    );
  }

  return (
    <Button
      variant={isSaved ? 'default' : 'outline'}
      size="sm"
      onClick={handleClick}
      disabled={saveMutation.isPending || removeMutation.isPending}
    >
      <Heart className={`h-4 w-4 mr-2 ${isSaved ? 'fill-current' : ''}`} />
      {isSaved ? 'Saved' : 'Save'}
    </Button>
  );
}
