from typing import Literal

from pydantic import BaseModel, Field


Scope = Literal["session", "driver", "team"]


class StoryRequest(BaseModel):
    session_key: str
    story_id: str
    story_run_id: str
    context: str = ""
    scopes: list[Scope] = Field(default_factory=lambda: ["session", "driver", "team"])
    scope_kind: Scope = "session"
    driver_number: int | None = None
    team_id: str | None = None
    team_name: str | None = None
    parent_story_id: str | None = None
    pipeline: str = "crew_story"
    angle_id: str | None = None
