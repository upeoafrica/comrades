import math
import datetime
from bson import ObjectId
from flask import Blueprint, jsonify, request, session
from flask_limiter import Limiter
from flask_limiter.util import get_remote_address
from flask_limiter.errors import RateLimitExceeded
from app import db

api_bp = Blueprint("api", __name__)

# --- Rate Limiter ---
limiter = Limiter(key_func=get_remote_address, default_limits=["1000 per day", "200 per hour"])

# -----------------------------
# Helpers
# -----------------------------
def haversine(lat1, lon1, lat2, lon2):
    """Calculate distance between two lat/lng points in km."""
    R = 6371
    dlat = math.radians(lat2 - lat1)
    dlon = math.radians(lon2 - lon1)
    a = math.sin(dlat/2)**2 + math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) * math.sin(dlon/2)**2
    return R * (2 * math.atan2(math.sqrt(a), math.sqrt(1 - a)))


def parse_datetime(value):
    if not value:
        return None
    try:
        return datetime.datetime.fromisoformat(value)
    except Exception:
        return None


def serialize_event(event, user_email=None):
    """Serialize events consistently for API responses."""
    def to_iso(val):
        if val is None:
            return None
        if isinstance(val, str):
            return val
        if hasattr(val, "isoformat"):
            return val.isoformat()
        return str(val)

    reserved = False
    if user_email:
        user = db.user_optins.find_one({"email": user_email})
        if user and ObjectId(event["_id"]) in user.get("events", []):
            reserved = True

    return {
        "_id": str(event["_id"]),
        "title": event.get("title"),
        "description": event.get("description"),
        "location": event.get("location"),
        "open_to": event.get("open_to"),
        "start_time": to_iso(event.get("start_time")),
        "end_time": to_iso(event.get("end_time")),
        "ticket_price": event.get("ticket_price"),
        "is_free": event.get("is_free"),
        "image_url": event.get("image_url"),
        "created_by": event.get("created_by"),
        "created_at": to_iso(event.get("created_at")),
        "tickets_sold": int(event.get("tickets_sold", 0)),
        "is_custom_location": bool(event.get("is_custom_location", False)),
        "service_fee": float(event.get("service_fee", 0.0)),
        "reserved": reserved,
   }



# -----------------------------
# Nearest Universities
# -----------------------------
@api_bp.route("/universities/nearest")
def get_nearest_university():
    try:
        lat = request.args.get("lat")
        lng = request.args.get("lng")

        # If GPS missing, fallback to logged-in user's university
        if (not lat or not lng) and "user" in session:
            uni = db.universities.find_one({"name": session["user"]["university"]})
            if uni:
                return jsonify({
                    "_id": str(uni["_id"]),
                    "name": uni["name"],
                    "latitude": uni["latitude"],
                    "longitude": uni["longitude"],
                    "type": uni["type"],
                    "fallback": True
                }), 200
            return jsonify({"error": "University not found"}), 404

        # If still missing, reject request
        if not lat or not lng:
            return jsonify({"error": "lat and lng parameters are required"}), 400

        # Convert safely
        lat = float(lat)
        lng = float(lng)

        universities = list(db.universities.find({}, {"name": 1, "latitude": 1, "longitude": 1, "type": 1}))
        if not universities:
            return jsonify({"error": "No universities found"}), 404

        nearest = min(universities, key=lambda u: haversine(lat, lng, u["latitude"], u["longitude"]))
        nearest["_id"] = str(nearest["_id"])
        return jsonify(nearest), 200

    except ValueError:
        return jsonify({"error": "Invalid lat/lng format"}), 400
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@api_bp.route("/universities/nearest_with_events")
def nearest_with_events():
    try:
        lat = request.args.get("lat")
        lng = request.args.get("lng")

        # If no GPS → fallback to logged-in user's university
        if (not lat or not lng) and "user" in session:
            uni = db.universities.find_one({"name": session["user"]["university"]})
            if uni:
                lat = float(uni.get("latitude"))
                lng = float(uni.get("longitude"))
            else:
                return jsonify({"error": "University not found for current user"}), 404

        # If still missing
        if not lat or not lng:
            return jsonify({"error": "lat and lng parameters are required"}), 400

        lat = float(lat)
        lng = float(lng)
        limit = min(request.args.get("limit", default=3, type=int), 3)

        # Get nearest universities
        universities = list(
            db.universities.find({}, {"name": 1, "latitude": 1, "longitude": 1, "type": 1})
        )
        for uni in universities:
            uni["distance_km"] = haversine(lat, lng, uni["latitude"], uni["longitude"])
            uni["_id"] = str(uni["_id"])

        universities.sort(key=lambda u: u["distance_km"])
        nearest_unis = universities[:limit]

        # Attach events to each university
        results = []
        user_email = session["user"]["email"] if "user" in session else None

        for uni in nearest_unis:
            query = {"location": {"$regex": uni["name"], "$options": "i"}}


            events_cursor = db.events.find(query).sort("start_time", 1).limit(10)
            events = [serialize_event(e, user_email) for e in events_cursor]
            results.append({"university": uni, "events": events})

        return jsonify(results), 200

    except Exception as e:
        return jsonify({"error": str(e)}), 500


# -----------------------------
# Events
# -----------------------------
@api_bp.route("/events")
@limiter.limit("60 per minute")
def get_events():
    search = request.args.get("search", "").strip()
    campus = request.args.get("campus", "").strip()
    limit = request.args.get("limit", type=int)
    sort_param = request.args.get("sort", "upcoming").lower()
    is_custom_param = request.args.get("is_custom") or request.args.get("is_custom_location")

    user_email = session["user"]["email"] if "user" in session else None
    query = {}

    if search:
        query["title"] = {"$regex": search, "$options": "i"}

    if campus:
        uni = db.universities.find_one({"name": {"$regex": f"^{campus}$", "$options": "i"}})
        if uni:
            query["location"] = uni["name"]

    if is_custom_param is not None:
        p = str(is_custom_param).lower()
        query["is_custom_location"] = p in ("1", "true", "yes", "on")

    sort_field = ("created_at", -1) if sort_param == "latest" else ("start_time", 1)
    events_cursor = db.events.find(query).sort([sort_field])

    if limit:
        events_cursor = events_cursor.limit(limit)

    events = [serialize_event(e, user_email) for e in events_cursor]
    return jsonify(events)
