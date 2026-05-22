import os
from dotenv import load_dotenv

# Load environment variables explicitly from backend/.env file
BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
env_path = os.path.join(BASE_DIR, ".env")
load_dotenv(dotenv_path=env_path)



class Settings:
    # Base path
    BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    
    # Sarvam AI API Configurations
    SARVAM_API_KEY = os.getenv("SARVAM_API_KEY", "")
    SARVAM_BASE_URL = "https://api.sarvam.ai"
    
    # Server configs
    PORT = int(os.getenv("PORT", 8000))
    HOST = os.getenv("HOST", "127.0.0.1")
    
    # Storage settings for document uploads & database
    UPLOAD_DIR = os.path.join(BASE_DIR, "uploads")
    DB_DIR = os.path.join(BASE_DIR, "db")
    
    # Initialize necessary folders
    def __init__(self):
        os.makedirs(self.UPLOAD_DIR, exist_ok=True)
        os.makedirs(self.DB_DIR, exist_ok=True)

settings = Settings()
