import asyncio
from app.pipelines.telemetry_graph import telemetry_graph
from app.utils import db_client
from bson import ObjectId

def run_test():
    session_key = "2026_canadian_grand_prix_R"
    
    # Create a dummy story run in DB so the nodes don't fail when calling _update_run_status
    res = db_client.story_runs().insert_one({
        "storyId": ObjectId(),
        "status": "pending",
        "logs": [],
        "sessionKey": session_key
    })
    run_id = str(res.inserted_id)
    story_id = str(ObjectId())

    state = {
        "session_key": session_key,
        "story_id": story_id,
        "story_run_id": run_id,
        "errors": [],
        "signals": [],
        "graph_specs": [],
        "team_graph_specs": [],
    }

    print(f"Running pipeline for session {session_key}, run ID {run_id}...")
    final_state = telemetry_graph.invoke(state)
    
    print("Pipeline finished.")
    
    errors = final_state.get("errors", [])
    if errors:
        print(f"Errors encountered: {errors}")
    
    final_signals = final_state.get("final_signals", [])
    final_graphs = final_state.get("final_graph_specs", [])
    
    print(f"Total Signals: {len(final_signals)}")
    for sig in final_signals:
        print(f"  - [{sig.get('priority')}] {sig.get('type')}: {sig.get('title')}")
        
    print(f"Total Graphs: {len(final_graphs)}")
    
    # Print the session insight (which should be signal 0)
    if final_signals and final_signals[0].get("type") == "ai_session_insight":
        print(f"\\nLLM Headline: {final_signals[0].get('title')}")
        print(f"LLM Summary: {final_signals[0].get('meaning')}")
        
    print("\\nCheck MongoDB 'story_runs' for the final payload refs.")

if __name__ == "__main__":
    run_test()
