import os
import sys
import shutil
import logging

# Dynamically resolve paths to avoid ModuleNotFoundError
current_dir = os.path.dirname(os.path.abspath(__file__))
parent_dir = os.path.dirname(current_dir)

if parent_dir not in sys.path:
    sys.path.insert(0, parent_dir)
if current_dir not in sys.path:
    sys.path.insert(0, current_dir)

from fastapi import FastAPI, UploadFile, File, Form, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List, Optional


from app.config import settings
from app.services.sarvam_client import sarvam_client
from app.services.rag_engine import rag_engine

# Setup logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI(title="Sarvam AI Corporate Chatbot API", version="1.0.0")

# Enable CORS for frontend integration
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # In production, specify frontend origin e.g. http://localhost:5173
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Models
class Message(BaseModel):
    role: str
    content: str

class ChatRequest(BaseModel):
    messages: List[Message]
    model: Optional[str] = "sarvam-30b"
    use_rag: Optional[bool] = True
    temperature: Optional[float] = 0.5
    target_language: Optional[str] = "Hindi"

class TTSRequest(BaseModel):
    text: str
    language_code: Optional[str] = "hi-IN"
    speaker: Optional[str] = "ritu"
    pace: Optional[float] = 1.0

# Initialize configurations
settings.__init__()

@app.get("/api/status")
async def get_status():
    """Returns the API key presence status and current RAG indexing statistics."""
    sources = rag_engine.get_all_sources()
    return {
        "status": "healthy",
        "api_key_configured": not sarvam_client.is_demo,
        "mode": "PROD" if not sarvam_client.is_demo else "DEMO",
        "rag_stats": sources
    }

@app.post("/api/chat")
async def chat_endpoint(request: ChatRequest):
    """
    Handles user chat inquiries.
    If RAG is active, searches local database and embeds relevant text into system prompt.
    """
    messages_payload = [{"role": msg.role, "content": msg.content} for msg in request.messages]
    
    # 1. Fetch latest user query
    user_query = ""
    for msg in reversed(request.messages):
        if msg.role == "user":
            user_query = msg.content
            break
            
    context = ""
    # 2. RAG Retrieval if requested and user has a query
    if request.use_rag and user_query:
        context = rag_engine.retrieve_context(user_query, top_k=3)
        
    # 3. Create or inject System Prompt
    target_lang = request.target_language or "Hindi"
    system_prompt = (
        "You are a professional, helpful, and highly intelligent corporate virtual assistant for our company. "
        "Your responses should be polite, clear, and business-appropriate. "
        "You are powered by the state-of-the-art Sarvam AI models developed in India.\n\n"
        f"CRITICAL DIRECTIVE: You MUST formulate your entire response in the {target_lang} language. "
        f"Translate any technical terms, grounded documents, and corporate records into natural, fluent {target_lang}. "
        f"Even if the user writes their query in English, you must respond exclusively in the {target_lang} language.\n\n"
    )
    
    if context:
        system_prompt += (
            f"Grounded Company Knowledge (Translate and answer in {target_lang}):\n"
            "Use ONLY the following verified document snippets to answer the user's question. "
            "Cite the source document names when applicable. If the context does not contain enough info, "
            f"politely state in {target_lang} that you do not find details in the corporate records and answer based on general knowledge "
            f"while warning the user that this isn't verified by corporate documents.\n\n"
            f"{context}\n\n"
            "Remember: Ground your primary response on the snippets provided above."
        )
    else:
        system_prompt += (
            f"No specific document context is loaded. Answer the user queries directly in a concise corporate tone, written in {target_lang}. "
            f"Mention you can answer company-specific policies/guidelines if relevant documents are uploaded."
        )
        
    # Check if there is already a system prompt in history, replace/insert at the front
    has_system = False
    for msg in messages_payload:
        if msg["role"] == "system":
            msg["content"] = system_prompt
            has_system = True
            break
            
    if not has_system:
        messages_payload.insert(0, {"role": "system", "content": system_prompt})
        
    # 4. Generate completions from Sarvam AI client
    response = sarvam_client.chat_complete(
        messages=messages_payload,
        model=request.model,
        temperature=request.temperature
    )
    
    # Include metadata about RAG in API response
    if "choices" in response:
        response["rag_applied"] = bool(context)
        response["rag_sources"] = list(set(doc["file"] for doc in rag_engine.documents)) if context else []
        
    return response

@app.post("/api/upload")
async def upload_document(file: UploadFile = File(...)):
    """Receives and parses custom company text/PDF documents to insert into the RAG engine."""
    file_path = os.path.join(settings.UPLOAD_DIR, file.filename)
    
    try:
        with open(file_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)
            
        # Parse and index document
        index_result = rag_engine.add_document(file_path, file.filename)
        if "error" in index_result:
            # Delete file if indexing failed
            if os.path.exists(file_path):
                os.remove(file_path)
            raise HTTPException(status_code=400, detail=index_result["message"])
            
        return {
            "filename": file.filename,
            "success": True,
            "details": index_result
        }
    except Exception as e:
        logger.error(f"Error uploading file {file.filename}: {e}")
        if os.path.exists(file_path):
            os.remove(file_path)
        raise HTTPException(status_code=500, detail=f"Internal Server Error: {str(e)}")

@app.get("/api/sources")
async def get_sources():
    """Fetches details on all files indexed in RAG."""
    return rag_engine.get_all_sources()

@app.post("/api/clear-docs")
async def clear_documents():
    """Deletes all indexed RAG documents."""
    rag_engine.clear_index()
    return {"success": True, "message": "Knowledge base index cleared."}

@app.post("/api/stt")
async def speech_to_text_endpoint(
    file: UploadFile = File(...),
    mode: str = Form("transcribe"),
    language_code: str = Form("hi-IN")
):
    """
    Transcribes audio voice clips utilizing the Sarvam Saaras v3 STT.
    Accepts audio file binary (e.g. wav, mp3, webm).
    """
    try:
        audio_bytes = await file.read()
        transcription_result = sarvam_client.speech_to_text(
            audio_bytes=audio_bytes,
            filename=file.filename,
            mode=mode,
            language_code=language_code
        )
        return transcription_result
    except Exception as e:
        logger.error(f"Error in speech-to-text API: {e}")
        raise HTTPException(status_code=500, detail=f"STT Service Error: {str(e)}")

@app.post("/api/tts")
async def text_to_speech_endpoint(request: TTSRequest):
    """
    Synthesizes speech audio from text using Bulbul v3 TTS.
    Returns the audio URL or base64 structure from Sarvam.
    """
    try:
        tts_result = sarvam_client.text_to_speech(
            text=request.text,
            language_code=request.language_code,
            speaker=request.speaker,
            pace=request.pace
        )
        return tts_result
    except Exception as e:
        logger.error(f"Error in text-to-speech API: {e}")
        raise HTTPException(status_code=500, detail=f"TTS Service Error: {str(e)}")

@app.post("/api/ocr")
async def ocr_endpoint(
    file: UploadFile = File(...),
    language_code: str = Form("en-IN")
):
    """
    Receives an image or scanned document PDF, and runs it through the
    Sarvam Vision Document Digitization / OCR pipeline to extract structured text.
    """
    try:
        file_bytes = await file.read()
        ocr_result = sarvam_client.digitize_document(
            file_bytes=file_bytes,
            file_name=file.filename,
            language_code=language_code
        )
        return ocr_result
    except Exception as e:
        logger.error(f"Error in OCR API endpoint: {e}")
        raise HTTPException(status_code=500, detail=f"OCR Service Error: {str(e)}")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="127.0.0.1", port=8000, reload=True)
