import requests
import logging
from app.config import settings

logger = logging.getLogger(__name__)

class SarvamClient:
    def __init__(self):
        self.api_key = settings.SARVAM_API_KEY
        self.base_url = settings.SARVAM_BASE_URL
        
        # Check if running in Demo Mode
        self.is_demo = not bool(self.api_key)
        if self.is_demo:
            logger.warning("Sarvam API Key is missing. Running in DEMO MODE.")
            
    def _get_headers(self):
        return {
            "api-subscription-key": self.api_key,
            "Content-Type": "application/json"
        }
        
    def chat_complete(self, messages, model="sarvam-30b", temperature=0.7, max_tokens=1000):
        """
        Calls the Sarvam AI Chat Completions API.
        Compatible with OpenAI chat payloads.
        """
        if self.is_demo:
            return self._get_demo_chat_response(messages)
            
        url = f"{self.base_url}/v1/chat/completions"
        payload = {
            "model": model,
            "messages": messages,
            "temperature": temperature,
            "max_tokens": max_tokens
        }
        
        try:
            response = requests.post(url, json=payload, headers=self._get_headers())
            if response.status_code == 200:
                return response.json()
            else:
                logger.error(f"Sarvam API error: Status {response.status_code} - {response.text}")
                return {
                    "error": True,
                    "message": f"Sarvam API responded with status {response.status_code}: {response.text}"
                }
        except Exception as e:
            logger.error(f"Exception during Sarvam Chat Completion: {e}")
            return {
                "error": True,
                "message": f"Exception connecting to Sarvam AI: {str(e)}"
            }
            
    def speech_to_text(self, audio_bytes, filename="audio.wav", mode="transcribe", language_code="hi-IN"):
        """
        Calls Sarvam Saaras v3 Spech-to-Text API.
        Supports transcribing / translating Indian language speech.
        """
        if self.is_demo:
            return {
                "transcript": "Hello, this is a placeholder transcription since Sarvam AI is in demo mode.",
                "language_code": language_code,
                "confidence": 0.95
            }
            
        url = f"{self.base_url}/speech-to-text"
        headers = {
            "api-subscription-key": self.api_key
            # Do NOT specify Content-Type here, requests will set multipart boundary
        }
        
        files = {
            "file": (filename, audio_bytes, "audio/wav")
        }
        data = {
            "model": "saaras:v3",
            "mode": mode,
            "language_code": language_code
        }
        
        try:
            response = requests.post(url, headers=headers, files=files, data=data)
            if response.status_code == 200:
                return response.json()
            else:
                logger.error(f"Sarvam STT API error: Status {response.status_code} - {response.text}")
                return {
                    "error": True,
                    "message": f"STT failed with status {response.status_code}"
                }
        except Exception as e:
            logger.error(f"Exception during Sarvam STT: {e}")
            return {
                "error": True,
                "message": f"Exception connecting to Sarvam STT: {str(e)}"
            }
            
    def text_to_speech(self, text, language_code="hi-IN", speaker="ritu", pace=1.0):
        """
        Calls Sarvam Bulbul v3 Text-to-Speech API.
        Returns base64 encoded audio or raw bytes depending on design.
        We'll fetch raw audio bytes to stream or encode as base64 for frontend.
        """
        if self.is_demo:
            # We don't have synthesized voice in demo, we return mock status
            return {
                "is_demo": True,
                "audio_url": None,
                "message": "TTS requires a valid Sarvam API Key."
            }
            
        url = f"{self.base_url}/text-to-speech"
        payload = {
            "inputs": [text] if hasattr(text, "strip") else text, # Support list of inputs or string
            "model": "bulbul:v3",
            "target_language_code": language_code,
            "speaker": speaker,
            "pace": pace,
            "temperature": 0.6
        }
        
        try:
            response = requests.post(url, json=payload, headers=self._get_headers())
            if response.status_code == 200:
                # The response contains base64 audios or a link.
                # Let's inspect typical structure or return the JSON response directly.
                return response.json()
            else:
                logger.error(f"Sarvam TTS API error: Status {response.status_code} - {response.text}")
                return {
                    "error": True,
                    "message": f"TTS failed with status {response.status_code}"
                }
        except Exception as e:
            logger.error(f"Exception during Sarvam TTS: {e}")
            return {
                "error": True,
                "message": f"Exception connecting to Sarvam TTS: {str(e)}"
            }
            
    def _get_demo_chat_response(self, messages):
        """
        Returns a beautifully formatted mock response to allow frontend test runs without a key.
        """
        last_user_message = next((m["content"] for m in reversed(messages) if m["role"] == "user"), "")
        
        # Simple rule-based mock engine to feel interactive
        lowered = last_user_message.lower()
        
        greeting_response = (
            "नमस्ते! Hello there! 🌟\n\n"
            "Welcome to the **Sarvam AI Corporate Assistant** demo!\n\n"
            "Currently, the system is running in **Demo Mode** because the `SARVAM_API_KEY` was not detected in the environment settings.\n\n"
            "Once configured with your Sarvam API Key, this chatbot will connect directly to the high-performance **`sarvam-30b`** or **`sarvam-105b`** LLMs, enabling high-quality multi-lingual reasoning, translation, and localized Indian context."
        )
        
        rag_response = (
            "🔍 **Document Knowledge Base Query (Demo Mode)**\n\n"
            "I noticed you are asking questions. In full deployment, this chatbot utilizes a **Retrieval-Augmented Generation (RAG)** pipeline to index company documentation (PDFs, Handbooks) locally.\n\n"
            "When you ask a question, the backend will fetch relevant text passages, inject them into the LLM context, and answer grounded strictly in your upload files."
        )
        
        voice_response = (
            "🎙️ **Speech Integration (Demo Mode)**\n\n"
            "This chatbot is built to support the revolutionary **Saaras v3 (STT)** and **Bulbul v3 (TTS)** models. "
            "In production, you can speak in 22 Indian languages, have it auto-translated, and hear the chatbot speak back in highly expressive voices (like Ritu, Aditya, Shubh) across multiple languages."
        )
        
        if "hello" in lowered or "hi" in lowered or "hey" in lowered or "greeting" in lowered or "नमस्ते" in lowered:
            text = greeting_response
        elif "document" in lowered or "file" in lowered or "upload" in lowered or "pdf" in lowered or "rag" in lowered:
            text = rag_response
        elif "voice" in lowered or "speech" in lowered or "audio" in lowered or "speak" in lowered or "stt" in lowered or "tts" in lowered:
            text = voice_response
        else:
            text = (
                f"🤖 **[DEMO MODE ACTIVE]**\n\n"
                f"You asked: *\"{last_user_message}\"*\n\n"
                f"To unlock real AI responses using Sarvam AI models, please edit the backend `.env` file and set a valid `SARVAM_API_KEY`.\n\n"
                f"Meanwhile, feel free to explore the interactive visual elements, change chat themes, upload documents to index, and experiment with the UI layout."
            )
            
        return {
            "choices": [
                {
                    "message": {
                        "role": "assistant",
                        "content": text
                    },
                    "finish_reason": "stop"
                }
            ],
            "demo": True
        }

sarvam_client = SarvamClient()
