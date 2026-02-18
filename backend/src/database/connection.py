from motor.motor_asyncio import AsyncIOMotorClient
from typing import Optional
import os
import sys
from pathlib import Path
from dotenv import load_dotenv
from urllib.parse import quote_plus, urlparse, urlunparse


# ---------------------------------------------------
# UTF-8 fix for Windows console (safe to keep)
# ---------------------------------------------------
if sys.platform == "win32":
    try:
        import codecs
        if hasattr(sys.stdout, 'detach'):
            sys.stdout = codecs.getwriter("utf-8")(sys.stdout.detach())
            
    except:
        pass


# ---------------------------------------------------
# LOAD .env ONLY IN LOCAL DEVELOPMENT
# ---------------------------------------------------
# Railway sets environment variable: RAILWAY_ENVIRONMENT
if not os.getenv("RAILWAY_ENVIRONMENT"):
    env_path = Path(__file__).parent.parent.parent / ".env"
    if env_path.exists():
        load_dotenv(dotenv_path=env_path)
        print("🔧 Loaded .env (local development)")
    else:
        print("⚠️ .env not found — using system environment")
else:
    print("🚀 Running on Railway — using Railway environment variables")


class MongoDB:
    client: Optional[AsyncIOMotorClient] = None
    database = None


# Global DB instance
db = MongoDB()


# ---------------------------------------------------
# ESCAPE CREDENTIALS IN THE MONGODB URL
# ---------------------------------------------------
def escape_mongodb_url(url: str) -> str:
    if not url or "://" not in url:
        return url

    parsed = urlparse(url)

    # No username or password present
    if not parsed.username and not parsed.password:
        return url

    username = quote_plus(parsed.username) if parsed.username else ""
    password = quote_plus(parsed.password) if parsed.password else ""

    # Host & optional port
    if username and password:
        netloc = f"{username}:{password}@{parsed.hostname}"
        if parsed.port:
            netloc += f":{parsed.port}"
    elif username:
        netloc = f"{username}@{parsed.hostname}"
        if parsed.port:
            netloc += f":{parsed.port}"
    else:
        netloc = parsed.netloc

    return urlunparse((
        parsed.scheme,
        netloc,
        parsed.path,
        parsed.params,
        parsed.query,
        parsed.fragment
    ))


# ---------------------------------------------------
# CONNECT TO MONGODB
# ---------------------------------------------------
async def connect_to_mongo():
    mongodb_url = os.getenv("MONGODB_URL")
    database_name = os.getenv("DATABASE_NAME")

    if not mongodb_url:
        raise RuntimeError("❌ MONGODB_URL is not set in environment variables.")

    if not database_name:
        raise RuntimeError("❌ DATABASE_NAME is not set in environment variables.")

    mongodb_url = escape_mongodb_url(mongodb_url)

    print("🔗 Connecting to MongoDB Atlas...")

    try:
        import certifi
        tls_ca_file = certifi.where()
        db.client = AsyncIOMotorClient(
            mongodb_url,
            tlsCAFile=tls_ca_file,
            tlsAllowInvalidCertificates=False
        )
    except Exception:
        print("⚠️ Warning: certifi not available, using insecure TLS")
        db.client = AsyncIOMotorClient(
            mongodb_url,
            tlsAllowInvalidCertificates=True
        )

    db.database = db.client[database_name]

    # Test connection
    try:
        await db.client.admin.command("ping")
        print(f"✅ Connected to MongoDB Atlas: {database_name}")
        print(f"📍 Database: {database_name}")
    except Exception as e:
        print(f"❌ Failed to connect to MongoDB: {e}")
        raise


# ---------------------------------------------------
# DISCONNECT
# ---------------------------------------------------
async def close_mongo_connection():
    if db.client:
        db.client.close()
        print("🔌 MongoDB connection closed")


# ---------------------------------------------------
# ACCESS HELPERS
# ---------------------------------------------------
def get_database():
    return db.database


def get_database_by_name(database_name: str):
    if db.client is None:
        return None
    return db.client[database_name]
