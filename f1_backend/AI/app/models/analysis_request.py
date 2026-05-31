from typing import Literal

from pydantic import BaseModel, Field


Scope = Literal["session", "driver", "team"]


class AnalysisRequest(BaseModel):
    session_key: str
    story_run_id: str
    story_id: str
    context: str = ""
    scopes: list[Scope] = Field(default_factory=lambda: ["session", "driver", "team"])
    pipeline: str = "full"
