from app.utils import db_client
run = db_client.story_runs().find_one(sort=[("_id", -1)])
print("Latest run status:", run.get("status"))
import json
print("Logs:", json.dumps(run.get("logs", []), indent=2))
print("Errors:", run.get("error", "None"))
