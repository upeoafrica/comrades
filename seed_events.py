from pymongo.mongo_client import MongoClient
from pymongo.server_api import ServerApi
from urllib.parse import quote_plus
from dotenv import load_dotenv
import os
import datetime
from datetime import timedelta
from bson import ObjectId
from app import db
# Load environment variables
load_dotenv()

# Get env variables
mongo_user = os.getenv("MONGO_USER")
mongo_password = os.getenv("MONGO_PASSWORD")
mongo_cluster = os.getenv("MONGO_CLUSTER")
mongo_db = os.getenv("MONGO_DB")

    # Build full MongoDB URI
uri = f"mongodb+srv://{mongo_user}:{mongo_password}@somocluster.lldxjbq.mongodb.net/?retryWrites=true&w=majority&appName=SomoCluster"
# Create a new client and connect to the server
client = MongoClient(uri, server_api=ServerApi('1'))

db = client.get_database(mongo_db)

# Clear old dummy events first
# db.events.delete_many({})

# Sample dummy events
events = [
    {
        "_id": ObjectId(),
        "title": "Campus Bash 2025 🎉",
        "description": "The biggest student party of the year! Live DJs, free drinks, and good vibes. Don’t miss out.",
        "image_url": "https://picsum.photos/400/250?random=1",
        "organizer_id": ObjectId(),
        "campus": "UoN",
        "location": {"type": "Point", "coordinates": [36.8219, -1.2921]},
        "start_time": datetime.datetime.now(datetime.UTC) + timedelta(days=3, hours=18),
        "end_time": datetime.datetime.now(datetime.UTC) + timedelta(days=4, hours=2),
        "ticket_price": 500,
        "is_free": False,
        "tickets_sold": 24,
        "created_at": datetime.datetime.now(datetime.UTC)
    },
    {
        "_id": ObjectId(),
        "title": "Hackathon Nairobi 🖥️",
        "description": "24-hour coding challenge for students with exciting prizes and job offers.",
        "image_url": "https://picsum.photos/400/250?random=2",
        "organizer_id": ObjectId(),
        "campus": "Strathmore",
        "location": {"type": "Point", "coordinates": [36.8167, -1.2833]},
        "start_time": datetime.datetime.now(datetime.UTC) + timedelta(days=5, hours=9),
        "end_time": datetime.datetime.now(datetime.UTC) + timedelta(days=5, hours=21),
        "ticket_price": 0,
        "is_free": True,
        "tickets_sold": 15,
        "created_at": datetime.datetime.now(datetime.UTC)
    },
    {
        "_id": ObjectId(),
        "title": "Movie Night Under the Stars 🍿",
        "description": "Grab your blankets and come enjoy a movie under the open sky. Popcorn on us!",
        "image_url": "https://picsum.photos/400/250?random=3",
        "organizer_id": ObjectId(),
        "campus": "Kenyatta University",
        "location": {"type": "Point", "coordinates": [36.9300, -1.1833]},
        "start_time": datetime.datetime.now(datetime.UTC) + timedelta(days=7, hours=19),
        "end_time": datetime.datetime.now(datetime.UTC) + timedelta(days=7, hours=22),
        "ticket_price": 200,
        "is_free": False,
        "tickets_sold": 7,
        "created_at": datetime.datetime.now(datetime.UTC)
    },
    {
        "_id": ObjectId(),
        "title": "Cultural Day Festival 🌍",
        "description": "Celebrate diversity with dance, food, and music from all over Africa!",
        "image_url": "https://picsum.photos/400/250?random=4",
        "organizer_id": ObjectId(),
        "campus": "JKUAT",
        "location": {"type": "Point", "coordinates": [37.0043, -1.0903]},
        "start_time": datetime.datetime.now(datetime.UTC) + timedelta(days=10, hours=11),
        "end_time": datetime.datetime.now(datetime.UTC) + timedelta(days=10, hours=18),
        "ticket_price": 300,
        "is_free": False,
        "tickets_sold": 50,
        "created_at": datetime.datetime.now(datetime.UTC)
    }
]

# Insert dummy events
db.events.insert_many(events)

print(f"Inserted {len(events)} events into the database!")
