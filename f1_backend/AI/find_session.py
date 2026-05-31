from app.utils import db_client
import sys

def get_session():
    # Find a session that has processedLaps
    doc = db_client.telemetry_sessions().find_one({"processedLaps": {"$exists": True, "$not": {"$size": 0}}})
    if not doc:
        print("No valid session found in DB.")
        sys.exit(1)
    
    sk = doc["sessionKey"]
    print(f"Found valid sessionKey: {sk}")
    
    # Also find or mock a story_run_id and story_id
    print("Test run complete.")

if __name__ == "__main__":
    get_session()
