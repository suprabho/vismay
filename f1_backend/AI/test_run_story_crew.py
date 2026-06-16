import sys
sys.path.append("/Users/rohittiwari/VsCode_Projects/apex/AI")
from dotenv import load_dotenv
load_dotenv()

from app.pipelines.story_crew import run_story_crew
import traceback

try:
    run_story_crew(
        session_key="dummy",
        story_id="dummy",
        story_run_id="6655c6b41234567890abcdef", # Valid ObjectId format
        context={},
        scope={"kind": "driver", "driverNumber": 12},
        shared_brief=None,
        final_status=None,
        angle_spec={"title": "test"}
    )
except Exception as e:
    print("CRASHED WITH:", repr(e))
    traceback.print_exc()
