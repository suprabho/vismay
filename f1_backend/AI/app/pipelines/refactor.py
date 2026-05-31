import re

def refactor_file(path):
    with open(path, "r") as f:
        content = f.read()

    # Refactor detect_signals
    content = re.sub(
        r'    state\["signals"\] = signals\n    _update_run_status\(state\["story_run_id"\], "running", f"detect_signals: \{len\(signals\)\} signals"\)\n    return state',
        r'    _update_run_status(state["story_run_id"], "running", f"detect_signals: {len(signals)} signals")\n    return {"signals": signals}',
        content
    )

    # Refactor detect_enriched_signals
    content = re.sub(
        r'    state\["signals"\] = state\.get\("signals", \[\]\) \+ new_signals\n    _update_run_status\(\n        state\["story_run_id"\], "running",\n        f"detect_enriched_signals: \{len\(new_signals\)\} new signals",\n    \)\n    return state',
        r'    _update_run_status(state["story_run_id"], "running", f"detect_enriched_signals: {len(new_signals)} new signals")\n    return {"signals": new_signals}',
        content
    )

    # Refactor build_projections
    content = re.sub(
        r'    state\["projections"\] = projections\n    _update_run_status\(state\["story_run_id"\], "running", f"build_projections: \{len\(projections\)\} drivers"\)\n    return state',
        r'    _update_run_status(state["story_run_id"], "running", f"build_projections: {len(projections)} drivers")\n    return {"projections": projections}',
        content
    )

    # Refactor generate_graph_specs
    content = re.sub(
        r'    state\["graph_specs"\] = specs\n    _update_run_status\(state\["story_run_id"\], "running", f"generate_graph_specs: \{len\(specs\)\} specs"\)\n    return state',
        r'    _update_run_status(state["story_run_id"], "running", f"generate_graph_specs: {len(specs)} specs")\n    return {"graph_specs": specs}',
        content
    )

    # For the driver/team graph nodes:
    # 1. Replace `specs = state.get("graph_specs") or []` with `specs = []`
    # 2. Replace `state["graph_specs"] = specs` + `return state` with `return {"graph_specs": specs}`
    # 3. Handle `team_specs = []` and `return {"team_graph_specs": team_specs}`

    content = content.replace('    specs = state.get("graph_specs") or []\n', '    specs = []\n')

    # generate_team_graph_specs
    content = re.sub(
        r'    state\["team_graph_specs"\] = \[\]\n        return state',
        r'        return {"team_graph_specs": []}',
        content
    )
    content = re.sub(
        r'    state\["team_graph_specs"\] = team_specs\n    _update_run_status\(state\["story_run_id"\], "running",\n                       f"generate_team_graph_specs: \{len\(team_specs\)\} specs"\)\n    return state',
        r'    _update_run_status(state["story_run_id"], "running", f"generate_team_graph_specs: {len(team_specs)} specs")\n    return {"team_graph_specs": team_specs}',
        content
    )

    # generic return replacement for driver graphs
    content = re.sub(
        r'        state\["graph_specs"\] = specs\n        return state',
        r'        return {"graph_specs": specs}',
        content
    )
    
    # generic end replacement for driver graphs
    content = re.sub(
        r'    state\["graph_specs"\] = specs\n    _update_run_status\(state\["story_run_id"\], "running", f"([^"]+) specs"\)\n    return state',
        r'    _update_run_status(state["story_run_id"], "running", f"\1 specs")\n    return {"graph_specs": specs}',
        content
    )
    
    with open(path, "w") as f:
        f.write(content)

if __name__ == "__main__":
    refactor_file("/Users/rohittiwari/VsCode_Projects/apex/AI/app/pipelines/telemetry_graph.py")
