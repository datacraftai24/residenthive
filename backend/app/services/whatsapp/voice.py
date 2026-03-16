"""
Voice Note Transcription for WhatsApp

Handles voice note messages by:
1. Downloading audio from WhatsApp media API
2. Transcribing with OpenAI Whisper
3. Processing transcribed text as a regular message

Supports OGG/Opus format (WhatsApp default).
"""

import os
import logging
import tempfile
from typing import Optional, Dict, Any
import httpx
from openai import OpenAI

logger = logging.getLogger(__name__)

# Configuration
WHATSAPP_ACCESS_TOKEN = os.getenv("WHATSAPP_ACCESS_TOKEN")
WHATSAPP_API_VERSION = os.getenv("WHATSAPP_API_VERSION", "v18.0")
WHATSAPP_API_BASE = f"https://graph.facebook.com/{WHATSAPP_API_VERSION}"
OPENAI_API_KEY = os.getenv("OPENAI_API_KEY")


class VoiceTranscriber:
    """
    Transcribe WhatsApp voice notes using OpenAI Whisper.
    """
    
    def __init__(self):
        if not OPENAI_API_KEY:
            raise ValueError("OPENAI_API_KEY not set")
        self.openai_client = OpenAI(api_key=OPENAI_API_KEY)
    
    async def transcribe_voice_note(
        self,
        audio_id: str,
        mime_type: str = "audio/ogg"
    ) -> Optional[str]:
        """
        Transcribe a WhatsApp voice note.
        
        Args:
            audio_id: WhatsApp media ID
            mime_type: Audio MIME type (usually audio/ogg; codecs=opus)
            
        Returns:
            Transcribed text or None if failed
        """
        try:
            # Step 1: Get media URL from WhatsApp
            media_url = await self._get_media_url(audio_id)
            if not media_url:
                logger.error(f"Failed to get media URL for {audio_id}")
                return None
            
            # Step 2: Download the audio file
            audio_data = await self._download_media(media_url)
            if not audio_data:
                logger.error(f"Failed to download media for {audio_id}")
                return None
            
            # Step 3: Transcribe with Whisper
            transcript = await self._transcribe_audio(audio_data, mime_type)
            
            if transcript:
                logger.info(f"Transcribed voice note: {transcript[:50]}...")
            
            return transcript
            
        except Exception as e:
            logger.error(f"Voice transcription failed: {e}", exc_info=True)
            return None
    
    async def _get_media_url(self, media_id: str) -> Optional[str]:
        """Get the download URL for a WhatsApp media file."""
        if not WHATSAPP_ACCESS_TOKEN:
            logger.error("WHATSAPP_ACCESS_TOKEN not set")
            return None
        
        url = f"{WHATSAPP_API_BASE}/{media_id}"
        headers = {"Authorization": f"Bearer {WHATSAPP_ACCESS_TOKEN}"}
        
        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.get(url, headers=headers)
            
            if response.status_code != 200:
                logger.error(f"Failed to get media info: {response.status_code} {response.text}")
                return None
            
            data = response.json()
            return data.get("url")
    
    async def _download_media(self, media_url: str) -> Optional[bytes]:
        """Download media file from WhatsApp."""
        if not WHATSAPP_ACCESS_TOKEN:
            return None
        
        headers = {"Authorization": f"Bearer {WHATSAPP_ACCESS_TOKEN}"}
        
        async with httpx.AsyncClient(timeout=60.0) as client:
            response = await client.get(media_url, headers=headers)
            
            if response.status_code != 200:
                logger.error(f"Failed to download media: {response.status_code}")
                return None
            
            return response.content
    
    async def _transcribe_audio(
        self,
        audio_data: bytes,
        mime_type: str
    ) -> Optional[str]:
        """Transcribe audio using OpenAI Whisper."""
        
        # Determine file extension based on MIME type
        ext_map = {
            "audio/ogg": ".ogg",
            "audio/ogg; codecs=opus": ".ogg",
            "audio/mpeg": ".mp3",
            "audio/mp4": ".m4a",
            "audio/wav": ".wav",
            "audio/webm": ".webm",
        }
        
        ext = ext_map.get(mime_type, ".ogg")
        
        # Write to temp file (Whisper API needs a file)
        with tempfile.NamedTemporaryFile(suffix=ext, delete=False) as tmp:
            tmp.write(audio_data)
            tmp_path = tmp.name
        
        try:
            # Transcribe with Whisper
            with open(tmp_path, "rb") as audio_file:
                transcript = self.openai_client.audio.transcriptions.create(
                    model="whisper-1",
                    file=audio_file,
                    response_format="text"
                )
            
            return transcript.strip() if transcript else None
            
        finally:
            # Clean up temp file
            try:
                os.unlink(tmp_path)
            except Exception:
                pass


async def handle_voice_message(
    audio_id: str,
    mime_type: str,
    agent_id: int,
    phone: str
) -> Dict[str, Any]:
    """
    Handle a voice note message.
    
    Args:
        audio_id: WhatsApp media ID
        mime_type: Audio MIME type
        agent_id: Agent's database ID
        phone: Sender's phone number
        
    Returns:
        Response dict with transcribed text or error
    """
    try:
        transcriber = VoiceTranscriber()
        transcript = await transcriber.transcribe_voice_note(audio_id, mime_type)
        
        if not transcript:
            return {
                "type": "text",
                "body": "🎤 Sorry, I couldn't transcribe your voice note. Please try again or type your message."
            }
        
        # Return the transcript to be processed as regular text
        return {
            "type": "transcribed",
            "transcript": transcript,
            "original_type": "voice"
        }
        
    except Exception as e:
        logger.error(f"Voice handling failed: {e}", exc_info=True)
        return {
            "type": "text",
            "body": "🎤 Voice transcription failed. Please type your message instead."
        }


def get_voice_transcription_response(transcript: str) -> str:
    """
    Build acknowledgment message for voice transcription.
    
    Args:
        transcript: Transcribed text
        
    Returns:
        Acknowledgment message
    """
    return f"🎤 I heard: \"{transcript[:100]}{'...' if len(transcript) > 100 else ''}\""
