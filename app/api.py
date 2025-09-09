from flask_limiter import Limiter
from flask_limiter.util import get_remote_address
from flask_limiter.errors import RateLimitExceeded
from flask import Blueprint, jsonify, request
import datetime
from bson import ObjectId, Regex
from app import db
import math

api_bp = Blueprint("api", __name__)

# Attach limiter to app (also put this in __init__.py)
limiter = Limiter(
    key_func=get_remote_address,
    default_limits=["1000 per day", "200 per hour"]  # global safe defaults
)

def haversine(lat1, lon1, lat2, lon2):
    R = 6371  # Earth radius in km
    dlat = math.radians(lat2 - lat1)
    dlon = math.radians(lon2 - lon1)
    a = math.sin(dlat/2)**2 + math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) * math.sin(dlon/2)**2
    c = 2 * math.atan2(math.sqrt(a), math.sqrt(1-a))
    return R * c  # distance in km


def parse_datetime(value):
    if not value:
        return None
    try:
        # HTML datetime-local format is "YYYY-MM-DDTHH:MM"
        return datetime.datetime.fromisoformat(value)
    except Exception:
        return None

# ------------- server: helpers/serialize --------------
def serialize_event(event, user_email=None):
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



@api_bp.route("/universities/nearest")
def get_nearest_university():
    try:
        lat = request.args.get("lat")
        lng = request.args.get("lng")

        # validate
        if lat is None or lng is None:
            return jsonify({"error": "Missing lat/lng parameters"}), 400

        lat = float(lat)
        lng = float(lng)

        universities = list(db.universities.find({}, {"name": 1, "latitude": 1, "longitude": 1, "type": 1}))
        if not universities:
            return jsonify({"error": "No universities found"}), 404

        nearest = None
        min_dist = float("inf")

        for uni in universities:
            dist = haversine(lat, lng, uni["latitude"], uni["longitude"])
            if dist < min_dist:
                min_dist = dist
                nearest = uni

        #print(nearest)

        if nearest:
            nearest["_id"] = str(nearest["_id"])
            return jsonify(nearest), 200

        return jsonify({"error": "No nearest university found"}), 404

    except ValueError:
        return jsonify({"error": "Invalid lat/lng format"}), 400
    except Exception as e:
        return jsonify({"error": str(e)}), 500
    


@api_bp.route("/universities/nearest_with_events")
def nearest_with_events():
    try:
        lat = request.args.get("lat")
        lng = request.args.get("lng")

        if lat is None or lng is None:
            return jsonify({"error": "Missing lat/lng parameters"}), 400

        lat = float(lat)
        lng = float(lng)

        limit = min(request.args.get("limit", default=3, type=int), 3)

        universities = list(
            db.universities.find({}, {"name": 1, "latitude": 1, "longitude": 1, "type": 1})
        )
        for uni in universities:
            uni["distance_km"] = haversine(lat, lng, uni["latitude"], uni["longitude"])
            uni["_id"] = str(uni["_id"])

        universities.sort(key=lambda u: u["distance_km"])
        nearest_unis = universities[:limit]

        results = []
        for uni in nearest_unis:

            # allow matching either the full university name OR its first word
            keywords = [uni["name"], uni["name"].split()[0]]
            query = {"$or": [{"location": {"$regex": k, "$options": "i"}} for k in keywords]}

            events_cursor = (db.events.find(query)
                .sort("start_time", 1)
                .limit(10)   # allow more per uni
            )
            events = [serialize_event(e) for e in events_cursor]
            results.append({"university": uni, "events": events})

        return jsonify(results), 200
    except Exception as e:
        import traceback; traceback.print_exc()
        return jsonify({"error": str(e)}), 500



@api_bp.route("/universities/nearest_many")
@limiter.limit("10 per minute")  # max 10 calls per minute per IP
def get_nearest_universities():
    try:
        lat_str = request.args.get("lat")
        lng_str = request.args.get("lng")

        if lat_str is None or lng_str is None:
            return jsonify({"error": "Missing lat/lng parameters"}), 400

        lat = float(lat_str)
        lng = float(lng_str)

        limit = request.args.get("limit", default=2, type=int)
        if limit > 3:
            limit = 3

        universities = list(
            db.universities.find({}, {"name": 1, "latitude": 1, "longitude": 1, "type": 1})
        )

        if not universities:
            return jsonify({"error": "No universities found"}), 404

        for uni in universities:
            uni["distance_km"] = haversine(lat, lng, uni["latitude"], uni["longitude"])
            uni["_id"] = str(uni["_id"])

        universities.sort(key=lambda u: u["distance_km"])
        return jsonify(universities[:limit]), 200

    except ValueError:
        return jsonify({"error": "Invalid lat/lng format"}), 400
    except Exception as e:
        import traceback
        traceback.print_exc()
        return jsonify({"error": str(e)}), 500
    

@api_bp.route("/user/optins", methods=["GET"])
def get_user_optins():
    email = request.args.get("email")
    if not email:
        return jsonify({"error": "Missing email"}), 400

    user = db.user_optins.find_one({"email": email})
    if not user:
        return jsonify({"events": []})

    return jsonify({"events": [str(eid) for eid in user.get("events", [])]})


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



# ------------- server: events list supports custom filtering --------------
@api_bp.route("/events")
@limiter.limit("60 per minute")
def get_events():
    search = request.args.get("search", "").strip()
    campus = request.args.get("campus", "").strip()
    limit = request.args.get("limit", type=int)
    sort_param = request.args.get("sort", "upcoming").lower()
    # new: support is_custom param
    is_custom_param = request.args.get("is_custom") or request.args.get("is_custom_location")

    user_email = "roy.murwa@strathmore.edu"  # placeholder until auth

    query = {}
    if search:
        query["title"] = {"$regex": search, "$options": "i"}
    if campus:
        # substring match (case-insensitive)
        # query["location"] = {"$regex": campus, "$options": "i"}
        uni = db.universities.find_one({"name": {"$regex": f"^{campus}$", "$options": "i"}})
        if uni:
            location = uni["name"]  # enforce canonical DB name

    if is_custom_param is not None:
        p = str(is_custom_param).lower()
        if p in ("1", "true", "yes", "on"):
            query["is_custom_location"] = True
        elif p in ("0", "false", "no"):
            query["is_custom_location"] = False

    # Sorting
    if sort_param == "latest":
        sort_field = ("created_at", -1)  # newest first
    else:
        sort_field = ("start_time", 1)   # upcoming soonest first (default)

    events_cursor = db.events.find(query).sort([sort_field])
    if limit:
        events_cursor = events_cursor.limit(limit)

    events = [serialize_event(e, user_email) for e in events_cursor]
    return jsonify(events)


@api_bp.route("/events/<event_id>/ticket", methods=["POST"])
def reserve_ticket(event_id):
    try:
        event = db.events.find_one({"_id": ObjectId(event_id)})
        if not event:
            return jsonify({"error": "Event not found"}), 404

        db.events.update_one(
            {"_id": ObjectId(event_id)},
            {"$inc": {"tickets_sold": 1}}
        )
        return jsonify({"message": "Ticket reserved successfully!"})
    except Exception as e:
        return jsonify({"error": str(e)}), 500
    
@api_bp.route("/universities", methods=["GET"])
def get_universities():
    try:
        search = request.args.get("search", "").strip()
        query = {}

        if search:
            query = {"name": {"$regex": search, "$options": "i"}}

        uni_cursor = db.universities.find(query).sort("name", 1)
        universities = [
            {
                "_id": str(u["_id"]),
                "name": u["name"],
                "latitude": u["latitude"],
                "longitude": u["longitude"],
                "type": u["type"]
            }
            for u in uni_cursor
        ]
        return jsonify(universities)
    except Exception as e:
        return jsonify({"error": str(e)}), 500

