import os
from flask import Flask, jsonify
from flask_limiter import Limiter
from flask_limiter.util import get_remote_address
from flask_limiter.errors import RateLimitExceeded
from authlib.integrations.flask_client import OAuth
from urllib.parse import quote_plus
from dotenv import load_dotenv
from pymongo.mongo_client import MongoClient
from pymongo.server_api import ServerApi

load_dotenv()

# --- Rate Limiter ---
limiter = Limiter(key_func=get_remote_address, default_limits=["1000 per day", "200 per hour"])

# --- Global OAuth instance ---
oauth = OAuth()

def create_app():
    app = Flask(__name__)
    app.secret_key = os.getenv("APP_SECRET_KEY")

    # --- Auth0 Setup ---
    oauth.init_app(app)
    oauth.register(
        "auth0",
        client_id=os.getenv("AUTH0_CLIENT_ID"),
        client_secret=os.getenv("AUTH0_CLIENT_SECRET"),
        client_kwargs={"scope": "openid profile email"},
        server_metadata_url=f'https://{os.getenv("AUTH0_DOMAIN")}/.well-known/openid-configuration'
    )

    # --- MongoDB Setup ---
    mongo_user = os.getenv("MONGO_USER")
    mongo_password = os.getenv("MONGO_PASSWORD")
    mongo_cluster = os.getenv("MONGO_CLUSTER")
    mongo_db = os.getenv("MONGO_DB")

    if not mongo_password:
        raise ValueError("MONGO_PASSWORD is missing in .env")

    mongo_password_encoded = quote_plus(mongo_password)
    mongo_uri = (
        f"mongodb+srv://{mongo_user}:{mongo_password_encoded}@{mongo_cluster}/{mongo_db}"
        "?retryWrites=true&w=majority&appName=SomoCluster"
    )

    global client, db
    client = MongoClient(mongo_uri, server_api=ServerApi("1"))
    db = client.get_database(mongo_db)

    # --- Rate Limiter ---
    limiter.init_app(app)

    @app.errorhandler(RateLimitExceeded)
    def handle_rate_limit(e):
        return jsonify({"error": "Too many requests"}), 429

    # --- Blueprints ---
    from app.views import views_bp
    from app.api import api_bp
    from app.auth import auth_bp

    app.register_blueprint(views_bp)
    app.register_blueprint(api_bp, url_prefix="/api")
    app.register_blueprint(auth_bp, url_prefix="/auth")

    return app
