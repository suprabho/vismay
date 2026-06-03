import logging as _logging
from pydantic_settings import BaseSettings
from typing import Literal


class Settings(BaseSettings):
    MONGODB_URI: str = "mongodb://localhost:27017/apex"
    BACKEND_API_URL: str = "http://localhost:4000"
    AI_WORKER_SECRET: str = "dev-secret"

    # LLM provider selection
    LLM_PROVIDER: Literal["ollama", "gemini", "openai", "anthropic", "none"] = "ollama"
    LLM_TEMPERATURE: float = 0.7

    # Gemini
    GEMINI_API_KEY: str = ""
    GEMINI_MODEL: str = "gemini-2.0-flash"

    # Ollama (default)
    OLLAMA_BASE_URL: str = "http://localhost:11434"
    OLLAMA_MODEL: str = "llama3"

    # OpenAI
    OPENAI_API_KEY: str = ""
    OPENAI_MODEL: str = "gpt-4o"

    # Anthropic — keep the model string in env; this default is a stable alias.
    ANTHROPIC_API_KEY: str = ""
    ANTHROPIC_MODEL: str = "claude-3-5-sonnet-latest"

    # Story fanout
    STORY_CONCURRENCY: int = 3

    # Angle discovery — max angles proposed per driver/team scope, and a global
    # ceiling across all scopes so a 20-car grid can't propose 80 angles.
    ANGLES_PER_SCOPE: int = 4
    MAX_TOTAL_ANGLES: int = 24

    # LLM-in-LangGraph: enrich + rank signals and curate graphs. Independently
    # toggleable; when off (or provider 'none') the graph keeps its heuristic output.
    LANGGRAPH_LLM_ENABLED: bool = True
    LANGGRAPH_LLM_TOP_SIGNALS: int = 12   # how many top signals the LLM rewrites/ranks

    # Signal dedup + cap in persist_results. Prevents a 20-driver grid from
    # flooding the DB with 300–500 signals per run.
    SIGNAL_MAX_PER_TYPE_PER_DRIVER: int = 3   # keep top N of each type per driver
    SIGNAL_MAX_TOTAL: int = 150               # hard ceiling before bulk POST

    # Resilient Backend I/O
    HTTP_TIMEOUT_SEC: float = 20.0
    HTTP_MAX_RETRIES: int = 4
    HTTP_BACKOFF_BASE_SEC: float = 0.5

    # Bounded background-run concurrency (number of pipelines in flight at once)
    MAX_CONCURRENT_RUNS: int = 4

    model_config = {"env_file": ".env", "extra": "ignore"}


settings = Settings()
_logging.getLogger(__name__).info("LLM provider: %s", settings.LLM_PROVIDER)


class LLMConfigError(RuntimeError):
    """Raised when a provider is selected but its credentials are missing."""


def get_llm():
    """Return a CrewAI LLM instance for the configured provider.

    Fails fast on misconfiguration (e.g. provider=gemini with no API key) instead
    of silently falling back to a different model — a silent fallback hides bugs
    and can quietly change cost/quality.
    """
    from crewai import LLM
    p = settings.LLM_PROVIDER
    t = settings.LLM_TEMPERATURE

    if p == "ollama":
        return LLM(model=f"ollama/{settings.OLLAMA_MODEL}",
                   base_url=settings.OLLAMA_BASE_URL, temperature=t)

    if p == "gemini":
        if not settings.GEMINI_API_KEY:
            raise LLMConfigError("LLM_PROVIDER=gemini but GEMINI_API_KEY is empty")
        return LLM(model=f"gemini/{settings.GEMINI_MODEL}",
                   api_key=settings.GEMINI_API_KEY, temperature=t)

    if p == "openai":
        if not settings.OPENAI_API_KEY:
            raise LLMConfigError("LLM_PROVIDER=openai but OPENAI_API_KEY is empty")
        return LLM(model=settings.OPENAI_MODEL,
                   api_key=settings.OPENAI_API_KEY, temperature=t)

    if p == "anthropic":
        if not settings.ANTHROPIC_API_KEY:
            raise LLMConfigError("LLM_PROVIDER=anthropic but ANTHROPIC_API_KEY is empty")
        return LLM(model=f"anthropic/{settings.ANTHROPIC_MODEL}",
                   api_key=settings.ANTHROPIC_API_KEY, temperature=t)

    # p == "none": explicit mock/disabled mode. Callers that need an LLM should
    # check llm_enabled() first; raising here surfaces accidental use.
    raise LLMConfigError(f"No usable LLM for provider '{p}'")


def llm_enabled() -> bool:
    """True when a real LLM provider is configured (i.e. not 'none')."""
    return settings.LLM_PROVIDER != "none"


def get_llm_optional():
    """Like get_llm() but returns None instead of raising when the LLM is
    disabled/misconfigured — used by best-effort paths (LangGraph enrichment)
    that must degrade gracefully to heuristic output."""
    if not llm_enabled():
        return None
    try:
        return get_llm()
    except Exception as exc:  # noqa: BLE001 — best-effort
        _logging.getLogger(__name__).warning("get_llm_optional disabled: %s", exc)
        return None
