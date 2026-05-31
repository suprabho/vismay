import re

def refactor():
    path = "/Users/rohittiwari/VsCode_Projects/apex/AI/app/pipelines/telemetry_graph.py"
    with open(path, "r") as f:
        content = f.read()

    # Update TelemetryState to include final_signals and final_graph_specs
    # And add final_team_graph_specs just in case
    state_repl = """class TelemetryState(TypedDict, total=False):
    session_key: str
    story_id: str
    story_run_id: str
    context: str
    session_data: dict
    laps_df: Optional[pd.DataFrame]
    events: list[dict]
    signals: Annotated[list[dict], operator.add]
    projections: dict
    graph_specs: Annotated[list[dict], operator.add]
    team_graph_specs: Annotated[list[dict], operator.add]
    errors: Annotated[list[str], operator.add]
    fatal_error: Optional[str]   # set by load_session when there is nothing to analyse
    insight_summary: Optional[str]
    final_signals: list[dict]
    final_graph_specs: list[dict]
    final_team_graph_specs: list[dict]
"""
    content = re.sub(r'class TelemetryState\(TypedDict, total=False\):.*?insight_summary: Optional\[str\]\n', state_repl, content, flags=re.DOTALL)

    # Replace llm_curate_insights
    new_llm = """def llm_curate_insights(state: TelemetryState) -> dict:
    \"\"\"Multi-agent LLM pass over the heuristically-detected signals and generated graphs.

    Uses three passes (Strategist, Race Engineer, Editor) to analyze the signals
    from different perspectives before generating the final headline and summary.
    \"\"\"
    signals = state.get("signals") or []
    specs = state.get("graph_specs") or []
    team_specs = state.get("team_graph_specs") or []
    if not settings.LANGGRAPH_LLM_ENABLED or not signals:
        return {"final_signals": signals, "final_graph_specs": specs, "final_team_graph_specs": team_specs}

    llm = get_llm_optional()
    if llm is None:
        _update_run_status(state["story_run_id"], "running", "llm_curate: LLM disabled")
        return {"final_signals": signals, "final_graph_specs": specs, "final_team_graph_specs": team_specs}

    compact_sigs = _compact_signals_for_llm(signals, settings.LANGGRAPH_LLM_TOP_SIGNALS)
    compact_graphs = [
        {"i": i, "type": g.get("type"), "title": (g.get("title") or "")[:120]}
        for i, g in enumerate(specs)
    ][:30]

    import json as _json
    signals_json = _json.dumps(compact_sigs)
    graphs_json = _json.dumps(compact_graphs)

    try:
        strategist_prompt = (
            "You are an F1 Chief Strategist. Review these SIGNALS and focus ONLY on tire degradation, pit stops, undercuts/overcuts, and traffic.\\n\\n"
            f"SIGNALS:\\n{signals_json}\\n\\n"
            "Return a concise 2-sentence strategic evaluation."
        )
        try:
            strat_eval = str(llm.call(strategist_prompt))
        except Exception:
            strat_eval = "Strategy evaluation unavailable."

        engineer_prompt = (
            "You are an F1 Race Engineer. Review these SIGNALS and focus ONLY on raw pace, sector speeds, dirty air, and ML anomalies.\\n\\n"
            f"SIGNALS:\\n{signals_json}\\n\\n"
            "Return a concise 2-sentence engineering evaluation."
        )
        try:
            eng_eval = str(llm.call(engineer_prompt))
        except Exception:
            eng_eval = "Engineering evaluation unavailable."

        editor_prompt = (
            "You are the Editor-in-Chief. You have a strategic evaluation and an engineering evaluation for an F1 session.\\n\\n"
            f"Strategist:\\n{strat_eval}\\n\\n"
            f"Engineer:\\n{eng_eval}\\n\\n"
            f"Original SIGNALS:\\n{signals_json}\\n\\n"
            f"CHARTS:\\n{graphs_json}\\n\\n"
            "Synthesize these into a cohesive output.\\n"
            "Return ONLY a JSON object with this exact shape:\\n"
            '{"headline": "<=90 char session headline", '
            '"summary": "2-3 sentence neutral session summary combining strategy and pace", '
            '"ranked_signals": [{"i": <signal index>, "priority": "high|med|low", "insight": "<=160 char sharper implication for this signal"}], '
            '"featured_graphs": [{"i": <chart index>, "caption": "<=120 char caption"}]}\\n'
            "Rank the most race-defining signals first. Only include charts that clearly support the story. "
            "No markdown, no code fences, no extra keys."
        )
        raw = llm.call(editor_prompt)
    except Exception as e:
        logger.warning("llm_curate call failed: %s", e)
        _update_run_status(state["story_run_id"], "running", f"llm_curate: LLM call failed ({e})")
        return {"final_signals": signals, "final_graph_specs": specs, "final_team_graph_specs": team_specs}

    parsed = extract_json_object(str(raw))
    if not parsed:
        _update_run_status(state["story_run_id"], "running", "llm_curate: unparseable LLM output")
        return {"final_signals": signals, "final_graph_specs": specs, "final_team_graph_specs": team_specs}

    mutated_signals = [dict(s) for s in signals]
    rank_order: list[int] = []
    ranked = parsed.get("ranked_signals")
    if isinstance(ranked, list):
        for entry in ranked:
            if not isinstance(entry, dict):
                continue
            i = entry.get("i")
            if not isinstance(i, int) or not (0 <= i < len(mutated_signals)):
                continue
            rank_order.append(i)
            pr = entry.get("priority")
            if pr in ("high", "med", "low"):
                mutated_signals[i]["priority"] = pr
            insight = entry.get("insight")
            if isinstance(insight, str) and insight.strip():
                mutated_signals[i]["implication"] = insight.strip()[:1000]
                mutated_signals[i]["llmCurated"] = True

    if rank_order:
        seen = set(rank_order)
        final_signals = [mutated_signals[i] for i in rank_order] + [s for j, s in enumerate(mutated_signals) if j not in seen]
    else:
        final_signals = mutated_signals

    mutated_specs = [dict(g) for g in specs]
    featured = parsed.get("featured_graphs")
    if isinstance(featured, list):
        for entry in featured:
            if not isinstance(entry, dict):
                continue
            i = entry.get("i")
            cap = entry.get("caption")
            if isinstance(i, int) and 0 <= i < len(mutated_specs) and isinstance(cap, str) and cap.strip():
                mutated_specs[i]["subtitle"] = cap.strip()[:200]
                mutated_specs[i]["llmFeatured"] = True

    headline = str(parsed.get("headline") or "").strip()
    summary = str(parsed.get("summary") or "").strip()
    insight_summary = None
    if headline and summary:
        insight_summary = summary
        final_signals.insert(0, {
            "sessionKey":   state["session_key"],
            "driverNumber": None,
            "lap":          None,
            "location":     "Session",
            "type":         "ai_session_insight",
            "value":        0,
            "priority":     "high",
            "title":        headline[:300],
            "meaning":      summary[:2000],
            "implication":  "LLM-curated session overview grounded in detected signals.",
            "aiGenerated":  True,
            "llmCurated":   True,
        })

    _update_run_status(
        state["story_run_id"], "running",
        f"llm_curate: ranked {len(rank_order)} signals, featured "
        f"{sum(1 for g in mutated_specs if g.get('llmFeatured'))} charts"
    )
    
    return {
        "insight_summary": insight_summary,
        "final_signals": final_signals,
        "final_graph_specs": mutated_specs,
        "final_team_graph_specs": team_specs
    }
"""
    content = re.sub(r'def llm_curate_insights\(state: TelemetryState\) -> TelemetryState:.*?return state\n', new_llm, content, flags=re.DOTALL)

    # In persist_results, read from final_* instead of state.get
    content = content.replace('state.get("signals", [])', 'state.get("final_signals", [])')
    content = content.replace('state.get("graph_specs", [])', 'state.get("final_graph_specs", [])')
    content = content.replace('state.get("team_graph_specs") or []', 'state.get("final_team_graph_specs") or []')

    # Now replace build_telemetry_graph completely
    new_build = """def build_telemetry_graph():
    workflow = StateGraph(TelemetryState)

    workflow.add_node("load_session", load_session)
    workflow.add_node("abort_run", abort_run)
    workflow.add_node("normalize_laps", normalize_laps)
    workflow.add_node("detect_events", detect_events)
    workflow.add_node("detect_signals", detect_signals)
    workflow.add_node("detect_enriched_signals", detect_enriched_signals)
    
    workflow.add_node("detect_dirty_air", detect_dirty_air)
    workflow.add_node("detect_start_performance", detect_start_performance)
    workflow.add_node("detect_ml_anomalies", detect_ml_anomalies)
    
    workflow.add_node("build_projections", build_projections)
    workflow.add_node("generate_graph_specs", generate_graph_specs)
    workflow.add_node("generate_driver_lap_traces", generate_driver_lap_traces)
    workflow.add_node("generate_driver_stint_degradation", generate_driver_stint_degradation)
    workflow.add_node("generate_driver_sector_comparison", generate_driver_sector_comparison)
    workflow.add_node("generate_driver_lap_trace_overlay", generate_driver_lap_trace_overlay)
    workflow.add_node("generate_driver_degradation_overlay", generate_driver_degradation_overlay)
    workflow.add_node("generate_driver_pace_distribution", generate_driver_pace_distribution)
    workflow.add_node("generate_driver_position_progression", generate_driver_position_progression)
    workflow.add_node("generate_driver_gear_distribution", generate_driver_gear_distribution)
    workflow.add_node("generate_team_graph_specs", generate_team_graph_specs)
    
    workflow.add_node("sync_graphs", sync_graphs)
    workflow.add_node("llm_curate_insights", llm_curate_insights)
    workflow.add_node("persist_results", persist_results)

    workflow.set_entry_point("load_session")
    workflow.add_conditional_edges(
        "load_session", _route_after_load,
        {"continue": "normalize_laps", "abort": "abort_run"},
    )
    workflow.add_edge("abort_run", END)
    workflow.add_edge("normalize_laps", "detect_events")
    workflow.add_edge("detect_events", "detect_signals")
    workflow.add_edge("detect_signals", "detect_enriched_signals")
    workflow.add_edge("detect_enriched_signals", "detect_dirty_air")
    workflow.add_edge("detect_dirty_air", "detect_start_performance")
    workflow.add_edge("detect_start_performance", "detect_ml_anomalies")
    workflow.add_edge("detect_ml_anomalies", "build_projections")
    workflow.add_edge("build_projections", "generate_graph_specs")
    
    # Fan-out to parallel graph nodes
    workflow.add_edge("generate_graph_specs", "generate_driver_lap_traces")
    workflow.add_edge("generate_graph_specs", "generate_driver_stint_degradation")
    workflow.add_edge("generate_graph_specs", "generate_driver_sector_comparison")
    workflow.add_edge("generate_graph_specs", "generate_driver_lap_trace_overlay")
    workflow.add_edge("generate_graph_specs", "generate_driver_degradation_overlay")
    workflow.add_edge("generate_graph_specs", "generate_driver_pace_distribution")
    workflow.add_edge("generate_graph_specs", "generate_driver_position_progression")
    workflow.add_edge("generate_graph_specs", "generate_driver_gear_distribution")
    workflow.add_edge("generate_graph_specs", "generate_team_graph_specs")
    
    # Fan-in
    workflow.add_edge("generate_driver_lap_traces", "sync_graphs")
    workflow.add_edge("generate_driver_stint_degradation", "sync_graphs")
    workflow.add_edge("generate_driver_sector_comparison", "sync_graphs")
    workflow.add_edge("generate_driver_lap_trace_overlay", "sync_graphs")
    workflow.add_edge("generate_driver_degradation_overlay", "sync_graphs")
    workflow.add_edge("generate_driver_pace_distribution", "sync_graphs")
    workflow.add_edge("generate_driver_position_progression", "sync_graphs")
    workflow.add_edge("generate_driver_gear_distribution", "sync_graphs")
    workflow.add_edge("generate_team_graph_specs", "sync_graphs")
    
    workflow.add_edge("sync_graphs", "llm_curate_insights")
    workflow.add_edge("llm_curate_insights", "persist_results")
    workflow.add_edge("persist_results", END)

    return workflow.compile()
"""
    content = re.sub(r'def build_telemetry_graph\(\):.*?return workflow\.compile\(\)\n', new_build, content, flags=re.DOTALL)

    with open(path, "w") as f:
        f.write(content)

if __name__ == "__main__":
    refactor()
