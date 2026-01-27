"""Feature toggles for gradual rollout and debugging."""

from pydantic_settings import BaseSettings


class FeatureFlags(BaseSettings):
    """Feature toggles for the summarization pipeline.

    All flags can be overridden via environment variables with FEATURE_ prefix.
    Example: FEATURE_USE_ASYNC_LLM=true
    """

    # Core feature toggles
    use_async_llm: bool = True
    use_running_context: bool = True
    use_entity_tracking: bool = True
    use_semantic_chunking: bool = False  # Default to token-based for stability
    use_adaptive_compression: bool = True
    use_validation_loop: bool = True
    use_overlap_dedup: bool = True
    use_hierarchical_merge: bool = True

    # Debug flags
    debug_log_prompts: bool = False
    debug_log_responses: bool = False
    debug_save_intermediate: bool = False
    debug_timing: bool = False

    class Config:
        env_prefix = "FEATURE_"
        env_file = ".env"
        extra = "ignore"
