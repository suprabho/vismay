import sys
from app.config import get_llm
try:
    llm = get_llm()
    print("LLM instantiated")
    resp = llm.call([{"role": "user", "content": "Hello"}])
    print("Response:", resp)
except Exception as e:
    import traceback
    traceback.print_exc()
