import fastf1
import pandas as pd
import logging
logging.basicConfig(level=logging.DEBUG)

fastf1.Cache.enable_cache("/tmp/fastf1_cache")
try:
    session = fastf1.get_session(2026, "Canadian Grand Prix", "R")
except Exception as e:
    print("Error getting 2026 session:", e)
    session = fastf1.get_session(2024, "Canadian Grand Prix", "R")

session.load(laps=True, telemetry=True, weather=False, messages=False)

laps = session.laps
for _, lap in laps.iterlaps():
    print("Driver:", lap["DriverNumber"], "Lap:", lap["LapNumber"])
    try:
        tel = lap.get_telemetry(interpolate_edges=True)
        if tel is not None and not tel.empty:
            print("Telemetry columns:", list(tel.columns))
            break
        else:
            print("Empty telemetry")
            break
    except Exception as e:
        print("Error:", e)
        break
