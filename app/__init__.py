from flask import Flask
from pymongo.mongo_client import MongoClient
from pymongo.server_api import ServerApi
from dotenv import load_dotenv
from urllib.parse import quote_plus
import os

from flask import jsonify
from flask_limiter import Limiter
from flask_limiter.util import get_remote_address
from flask_limiter.errors import RateLimitExceeded

load_dotenv()


    # Load env vars
mongo_user = os.getenv("MONGO_USER")
mongo_password = os.getenv("MONGO_PASSWORD")
mongo_cluster = os.getenv("MONGO_CLUSTER")
mongo_db = os.getenv("MONGO_DB")

    # Validate password
if not mongo_password:
    raise ValueError("MONGO_PASSWORD is missing in your .env file!")

    # Encode special chars in password
mongo_password_encoded = quote_plus(mongo_password)

    # Build full URI
mongo_uri = (
    f"mongodb+srv://{mongo_user}:{mongo_password_encoded}@{mongo_cluster}/{mongo_db}"
    "?retryWrites=true&w=majority&appName=SomoCluster"
)

# Global DB client
global client, db
client = MongoClient(mongo_uri, server_api=ServerApi("1"))
db = client.get_database(mongo_db)

def create_app():
    app = Flask(__name__)

    # Load env vars
    mongo_user = os.getenv("MONGO_USER")
    mongo_password = os.getenv("MONGO_PASSWORD")
    mongo_cluster = os.getenv("MONGO_CLUSTER")
    mongo_db = os.getenv("MONGO_DB")

    # Validate password
    if not mongo_password:
        raise ValueError("MONGO_PASSWORD is missing in your .env file!")

    # Encode special chars in password
    mongo_password_encoded = quote_plus(mongo_password)

    # Build full URI
    mongo_uri = (
        f"mongodb+srv://{mongo_user}:{mongo_password_encoded}@{mongo_cluster}/{mongo_db}"
        "?retryWrites=true&w=majority&appName=SomoCluster"
    )

    global client, db
    client = MongoClient(mongo_uri, server_api=ServerApi("1"))
    db = client.get_database(mongo_db)

    # --- Flask-Limiter setup ✅
    limiter = Limiter(
        key_func=get_remote_address,
        default_limits=["1000 per day", "200 per hour"]  # global defaults
    )
    limiter.init_app(app)

    # --- Custom error handler for rate limits
    @app.errorhandler(RateLimitExceeded)
    def handle_rate_limit(e):
        return jsonify({
            "error": "Too many requests",
            "message": "Bro, you’re making too many requests. Please wait a moment.",
            "status": 429
        }), 429

    # Import blueprints AFTER db is ready ✅
    from app.views import views_bp
    from app.api import api_bp
    app.register_blueprint(views_bp)
    app.register_blueprint(api_bp, url_prefix="/api")
    

    return app
