import json
from app.pipelines.story_graph_pipeline import run_story_graph_pipeline

session_key = "2024_monaco_R"
story_id = "dummy_story"
scope = {"kind": "driver", "driverNumber": 1}
angle_spec = {"focus": "Verstappen's speed vs Leclerc on Lap 14"}
content_blocks = [
    {"type": "paragraph", "text": "The race in Monaco was intense."},
    {"type": "paragraph", "text": "Verstappen showed incredible speed down the straight on Lap 14 compared to Leclerc."},
    {"type": "paragraph", "text": "Looking at their pace over the next 10 laps, it's clear Verstappen was pulling away."}
]

res = run_story_graph_pipeline(session_key, story_id, scope, angle_spec, content_blocks)
print(json.dumps(res, indent=2))
