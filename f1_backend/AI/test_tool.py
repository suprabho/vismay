import json
from app.tools.scoped_tools import build_scoped_tools
from app.tools.mongo_tool import db_client

tools = build_scoped_tools("2024_monaco_R", {"kind": "session"}, extra_driver_numbers=[1, 44])
custom_tool = next(t for t in tools if t.name == "generate_custom_telemetry_graph")

res = custom_tool._run(lap_number=14, driver_numbers=[1, 44], channel="speed")
res_dict = json.loads(res)
graph_id = res_dict.get("id")
print("Graph ID:", graph_id)

if graph_id:
    from bson import ObjectId
    doc = db_client.graph_specs().find_one({"_id": ObjectId(graph_id)})
    if doc:
        print("Graph keys:", list(doc.keys()))
        dp = doc.get("dataPoints", [])
        print("Data points len:", len(dp))
        if dp:
            print("First DP:", dp[0])
            # print("Series:", doc.get("series"))
