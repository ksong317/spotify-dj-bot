"""Application configuration loaded from environment variables."""
import os

from dotenv import load_dotenv

load_dotenv()

SPOTIFY_CLIENT_ID = os.getenv("SPOTIFY_CLIENT_ID", "")
SPOTIFY_CLIENT_SECRET = os.getenv("SPOTIFY_CLIENT_SECRET", "")

DATABASE_URL = os.getenv(
    "DATABASE_URL",
    "postgresql://myuser:mysecretpassword@localhost:5432/mydatabase",
)
