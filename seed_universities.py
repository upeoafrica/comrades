from pymongo.mongo_client import MongoClient
from pymongo.server_api import ServerApi
from urllib.parse import quote_plus
from dotenv import load_dotenv
import os
from datetime import datetime, timedelta
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
# db = client["comrades"]  # database name
universities = db["universities"]  # collection name

# --- University Data (10 Public + 10 Private in Nairobi) ---
university_data = [
    # Public Universities
    {"name": "University of Nairobi (Main Campus)", "latitude": -1.280971, "longitude": 36.8135383, "type": "Public"},
    {"name": "Kenyatta University (Main Campus)", "latitude": -1.1820777, "longitude": 36.9341004, "type": "Public"},
    {"name": "Technical University of Kenya (TUK)", "latitude": -1.2912589, "longitude": 36.8227188, "type": "Public"},
    {"name": "JKUAT Juja (Main Campus)", "latitude": -1.0913809, "longitude": 36.9936649, "type": "Public"},
    {"name": "Multimedia University of Kenya", "latitude": -1.3819407, "longitude": 36.7656496, "type": "Public"},
    {"name": "Co-operative University of Kenya (Karen)", "latitude": -1.3665655, "longitude": 36.7266569    , "type": "Public"},
    {"name": "Kirinyaga University", "latitude": -0.6956697, "longitude": 35.9761505, "type": "Public"},
    {"name": "Machakos University", "latitude": -1.5308534, "longitude": 37.2601941, "type": "Public"},
    {"name": "South Eastern Kenya University", "latitude": -1.37798, "longitude": 37.7178789, "type": "Public"},
    {"name": "Maasai Mara University", "latitude": -1.0943661, "longitude": 35.8580261, "type": "Public"},

    # Private Universities
    {"name": "Strathmore University", "latitude": -1.3089602, "longitude": 36.8075432, "type": "Private"},
    {"name": "USIU-Africa", "latitude": -1.2211537, "longitude": 36.880816, "type": "Private"},
    {"name": "Catholic University of Eastern Africa (CUEA)", "latitude": -1.3559738, "longitude": 36.7119972, "type": "Private"},
    {"name": "Daystar University (Valley Road)", "latitude": -1.2975367, "longitude": 36.7976492, "type": "Private"},
    {"name": "Africa Nazarene University (Nairobi CBD)", "latitude": -1.3997791, "longitude": 36.706351, "type": "Private"},
    {"name": "KCA University", "latitude": -1.2672544, "longitude": 36.8183049, "type": "Private"},
    {"name": "St. Paul’s University (Limuru Campus)", "latitude": -1.1475883, "longitude": 36.6632489, "type": "Private"},
    {"name": "Mount Kenya University (Juja Campus)", "latitude": -1.0448217, "longitude": 36.7932304, "type": "Private"},
    {"name": "Riara University", "latitude": -1.3148565, "longitude": 36.8043483, "type": "Private"},
    {"name": "Africa International University (Karen)", "latitude": -1.30678, "longitude": 36.6830321, "type": "Private"},
]

# --- Insert into DB ---
def seed_universities():
    # clear old data if you want fresh insert
    #universities.delete_many({})
    
    # insert new
    result = universities.insert_many(university_data)
    print(f"✅ Inserted {len(result.inserted_ids)} universities into DB")

if __name__ == "__main__":
    seed_universities()
