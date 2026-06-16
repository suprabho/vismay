import sys
sys.path.append("/Users/rohittiwari/VsCode_Projects/apex/AI")
from dotenv import load_dotenv
load_dotenv()
from app.pipelines.story_crew import _check_lap_citations
print(_check_lap_citations("nonexistent", [{"type": "paragraph", "text": "lap 50"}]))
