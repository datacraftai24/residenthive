import { useState, useRef, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Mic, MicOff, Square } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface VoiceInputProps {
  onTranscription: (text: string) => void;
  isRecording: boolean;
  setIsRecording: (recording: boolean) => void;
}

export default function VoiceInput({ onTranscription, isRecording, setIsRecording }: VoiceInputProps) {
  const [isSupported, setIsSupported] = useState(true);
  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const { toast } = useToast();

  const initializeRecognition = useCallback(() => {
    if (!('webkitSpeechRecognition' in window) && !('SpeechRecognition' in window)) {
      setIsSupported(false);
      return null;
    }

    const SpeechRecognition = window.webkitSpeechRecognition || window.SpeechRecognition;
    const recognition = new SpeechRecognition();
    
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = 'en-US';

    recognition.onresult = (event) => {
      let finalTranscript = '';
      let interimTranscript = '';

      for (let i = event.resultIndex; i < event.results.length; i++) {
        const transcript = event.results[i][0].transcript;
        if (event.results[i].isFinal) {
          finalTranscript += transcript;
        } else {
          interimTranscript += transcript;
        }
      }

      if (finalTranscript) {
        onTranscription(finalTranscript);
      }
    };

    recognition.onerror = (event) => {
      console.error('Speech recognition error:', event.error);
      setIsRecording(false);
      
      let errorMessage = 'Speech recognition error occurred';
      switch (event.error) {
        case 'no-speech':
          errorMessage = 'No speech detected. Please try again.';
          break;
        case 'audio-capture':
          errorMessage = 'Audio capture failed. Please check your microphone.';
          break;
        case 'not-allowed':
          errorMessage = 'Microphone access denied. Please allow microphone access.';
          break;
        case 'network':
          errorMessage = 'Network error occurred during speech recognition.';
          break;
      }
      
      toast({
        title: "Voice Recognition Error",
        description: errorMessage,
        variant: "destructive",
      });
    };

    recognition.onend = () => {
      setIsRecording(false);
    };

    return recognition;
  }, [onTranscription, setIsRecording, toast]);

  const startRecording = () => {
    if (!isSupported) {
      toast({
        title: "Voice Input Not Supported",
        description: "Your browser doesn't support voice input. Please use the text area instead.",
        variant: "destructive",
      });
      return;
    }

    try {
      const recognition = initializeRecognition();
      if (recognition) {
        recognitionRef.current = recognition;
        recognition.start();
        setIsRecording(true);
        
        toast({
          title: "Voice Recording Started",
          description: "Speak now. Click stop when finished.",
        });
      }
    } catch (error) {
      console.error('Error starting speech recognition:', error);
      toast({
        title: "Error Starting Voice Input",
        description: "Could not start voice recognition. Please try again.",
        variant: "destructive",
      });
    }
  };

  const stopRecording = () => {
    if (recognitionRef.current) {
      recognitionRef.current.stop();
      recognitionRef.current = null;
    }
    setIsRecording(false);
    
    toast({
      title: "Voice Recording Stopped",
      description: "Voice input has been processed.",
    });
  };

  if (!isSupported) {
    return (
      <div className="flex items-center space-x-3">
        <Button disabled variant="outline">
          <MicOff className="h-4 w-4 mr-2" />
          Voice Not Supported
        </Button>
        <div className="text-sm text-slate-500">
          Voice input not available in this browser
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-center space-x-3">
      {!isRecording ? (
        <Button 
          onClick={startRecording}
          className="bg-red-500 hover:bg-red-600 text-white"
        >
          <Mic className="h-4 w-4 mr-2" />
          Start Recording
        </Button>
      ) : (
        <Button 
          onClick={stopRecording}
          variant="outline"
          className="border-red-500 text-red-500 hover:bg-red-50"
        >
          <Square className="h-4 w-4 mr-2" />
          Stop Recording
        </Button>
      )}
      
      <div className="text-sm text-slate-500 flex items-center space-x-2">
        <div className={`w-2 h-2 rounded-full ${isRecording ? 'bg-red-500 animate-pulse' : 'bg-slate-300'}`}></div>
        <span>{isRecording ? 'Recording...' : 'Ready to record'}</span>
      </div>
    </div>
  );
}
