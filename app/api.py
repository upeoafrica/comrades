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


@api_bp.route("/universities/validate-domain", methods=["GET"])
def validate_university_domain():
    try:
        domain = request.args.get("domain", "").lower().strip()

        if not domain:
            return jsonify({
                "allowed": False,
                "message": "Missing email domain."
            }), 400

        # ✅ Check if domain exists in MongoDB
        university = db.universities.find_one({"domain": domain})

        if not university:
            return jsonify({
                "allowed": False,
                "message": "This email domain is not linked to any recognized university."
            }), 200

        # ✅ Domain is valid
        return jsonify({
            "allowed": True,
            "university": university["name"]
        }), 200

    except Exception as e:
        return jsonify({
            "allowed": False,
            "message": f"Error checking domain: {str(e)}"
        }), 500


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

@api_bp.route("/events/<event_id>/reserve", methods=["POST"])
def reserve_seat(event_id):
    try:
        data = request.json or {}
        email = data.get("email")
        if not email:
            return jsonify({"error": "Email required"}), 400

        event = db.events.find_one({"_id": ObjectId(event_id)})
        if not event:
            return jsonify({"error": "Event not found"}), 404

        # Check if user already opted in
        user = db.user_optins.find_one({"email": email})
        if user and ObjectId(event_id) in user.get("events", []):
            return jsonify({"message": "Already reserved this event."}), 200

        # Add to user_optins (create if not exists)
        db.user_optins.update_one(
            {"email": email},
            {"$addToSet": {"events": ObjectId(event_id)}},
            upsert=True
        )

        # Increment tickets_sold only once
        db.events.update_one(
            {"_id": ObjectId(event_id)},
            {"$inc": {"tickets_sold": 1}}
        )

        return jsonify({"message": "Reservation successful!"}), 200

    except Exception as e:
        return jsonify({"error": str(e)}), 500


# ------------- server: create event --------------
@api_bp.route("/events/create", methods=["POST"])
def create_event():
    try:
        data = request.json or {}

        # Extract fields
        title = (data.get("title") or "").strip()
        description = (data.get("description") or "").strip()
        campus = data.get("campus")
        location = data.get("location")
        image_url = data.get("image_url")
        open_to = (data.get("open_to") or "everyone").lower()
        start_time = parse_datetime(data.get("start_time"))
        end_time = parse_datetime(data.get("end_time"))
        is_free_raw = data.get("is_free")
        is_free = str(is_free_raw).lower() in ["true", "1", "yes", "on"]

        # Normalize ticket price
        if is_free:
            ticket_price = 0.0
        else:
            try:
                ticket_price = float(data.get("ticket_price", 0) or 0)
            except (TypeError, ValueError):
                ticket_price = 0.0

        # Parse custom flag (expected true/"true"/"1" etc. from front-end)
        is_custom = str(data.get("is_custom_location", False)).lower() in ["true", "1", "yes", "on"]

        # Service fee logic (for custom locations) — adjust percentages/min as you like
        SERVICE_FEE_PERCENT = 0.10
        MIN_SERVICE_FEE = 50.0
        service_fee = 0.0
        if is_custom:
            service_fee = max(MIN_SERVICE_FEE, round(ticket_price * SERVICE_FEE_PERCENT, 2))

        event = {
            "title": title,
            "description": description,
            "image_url": image_url,
            "location": (location if location else campus),
            "open_to": open_to,
            "start_time": start_time,
            "end_time": end_time,
            "ticket_price": ticket_price,
            "is_free": is_free,
            "tickets_sold": 0,
            "is_custom_location": is_custom,
            "service_fee": service_fee,
            "created_at": datetime.datetime.utcnow(),
            "created_by": "roy.murwa@strathmore.edu",  # placeholder
        }

        result = db.events.insert_one(event)
        event["_id"] = str(result.inserted_id)
        return jsonify({"message": "Event created successfully", "event": serialize_event(event)}), 201

    except Exception as e:
        return jsonify({"error": str(e)}), 400



@api_bp.route("/user/optins", methods=["GET"])
def get_user_optins():
    email = session["user"]["email"]
    if not email:
        return jsonify({"error": "Missing email"}), 400

    user = db.user_optins.find_one({"email": email})
    if not user:
        return jsonify({"events": []})

    return jsonify({"events": [str(eid) for eid in user.get("events", [])]})
