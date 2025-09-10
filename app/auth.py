import os
from flask import Blueprint, session, redirect, url_for, jsonify
from app import oauth, db
import datetime
from urllib.parse import urlencode, quote_plus

auth_bp = Blueprint("auth", __name__)


@auth_bp.route("/session")
def get_session():
    if "user" not in session:
        return jsonify({"user": None}), 200

    user = session["user"]
    email = user["email"]
    domain = email.split("@")[-1].lower()

    # Fetch user's university based on domain
    university = None
    if domain:
        uni_doc = db.universities.find_one({"domain": domain}, {"name": 1})
        if uni_doc:
            university = uni_doc["name"]
            latitude = uni_doc["latitude"]
            longitude = uni_doc["longitude"]

    return jsonify({
        "email": email,
        "name": user.get("name"),
        "latitude": float(user.get("latitude")),
        "longitude": float(user.get("longitude")),
        "university": university
    }), 200

# -------------------------------
# LOGIN
# -------------------------------
@auth_bp.route("/login")
def login():
    auth0 = oauth.auth0  # ✅ Use registered client directly
    if not auth0:
        return jsonify({"error": "Auth0 client not configured"}), 500
    return auth0.authorize_redirect(
        redirect_uri=url_for("auth.callback", _external=True)
    )

# -------------------------------
# AUTH0 CALLBACK
# -------------------------------
@auth_bp.route("/callback")
def callback():
    auth0 = oauth.auth0
    if not auth0:
        return jsonify({"error": "Auth0 client not configured"}), 500
    token = auth0.authorize_access_token()
    user_info = token.get("userinfo")

    if not user_info:
        return jsonify({"error": "Failed to retrieve user info"}), 400

    email = user_info.get("email")
    if not email:
        return jsonify({"error": "Email is required"}), 400

    # ✅ Extract email domain
    domain = email.split("@")[-1].lower()

    # ✅ Check if domain exists in universities collection
    university = db.universities.find_one({"domain": domain})
    if not university:
        # 🚫 Deny access for non-university emails
        return redirect(url_for("views.home", error="Invalid university email"))

    # ✅ Check if user already exists
    existing_user = db.users.find_one({"email": email})

    if not existing_user:
        try:
            db.users.insert_one({
                "email": email,
                "name": user_info.get("name", ""),
                "university_id": str(university["_id"]),
                "university_name": university["name"],
                "created_at": datetime.datetime.utcnow()
            })
        except Exception as e:
            return jsonify({"error": f"User creation failed: {str(e)}"}), 500

    # ✅ Save session data
    session["user"] = {
        "email": email,
        "name": user_info.get("name", ""),
        "university": university["name"],
    }

    return redirect(url_for("views.home"))

# -------------------------------
# LOGOUT
# -------------------------------
@auth_bp.route("/logout")
def logout():
    session.clear()
    params = {
        "returnTo": url_for("views.home", _external=True),
        "client_id": os.getenv("AUTH0_CLIENT_ID")
    }
    return redirect(f"https://{os.getenv('AUTH0_DOMAIN')}/v2/logout?" + urlencode(params))