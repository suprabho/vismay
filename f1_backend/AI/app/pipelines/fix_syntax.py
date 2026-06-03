def fix():
    with open("/Users/rohittiwari/VsCode_Projects/apex/AI/app/pipelines/telemetry_graph.py", "r") as f:
        content = f.read()

    # The previous string replacement messed up around line 1700-1750
    # Let's replace the whole llm_curate_insights block safely
    
    start_idx = content.find("def llm_curate_insights(state: TelemetryState) -> dict:")
    end_idx = content.find("def persist_results(state: TelemetryState) -> TelemetryState:")
    
    if start_idx == -1 or end_idx == -1:
        print("Could not find bounds")
        return
        
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
    rank_order = []
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
    new_content = content[:start_idx] + new_llm + content[end_idx:]
    with open("/Users/rohittiwari/VsCode_Projects/apex/AI/app/pipelines/telemetry_graph.py", "w") as f:
        f.write(new_content)

if __name__ == "__main__":
    fix()
