"""The presets the worker selects with PIPELINE_MODE, and the strategy override."""
from worker.tools.reader.summarize.config.settings import ChunkerType, SummarizationStrategy
from worker.tools.reader.summarize.orchestration.pipeline_builder import PipelineBuilder

FEATURE_FLAGS = (
    "use_semantic_chunking", "use_running_context", "use_entity_tracking",
    "use_adaptive_compression", "use_validation_loop", "use_overlap_dedup",
    "use_hierarchical_merge",
)


def _flags(builder):
    return {name: getattr(builder.features, name) for name in FEATURE_FLAGS}


def test_fast_preset_disables_every_feature_and_uses_basic_strategy():
    b = PipelineBuilder().fast()
    assert not any(_flags(b).values())
    assert b.settings.summarization_strategy == SummarizationStrategy.BASIC


def test_balanced_preset_is_structured_with_light_validation():
    b = PipelineBuilder().balanced()
    assert _flags(b) == {
        "use_semantic_chunking": False,
        "use_running_context": True,
        "use_entity_tracking": False,
        "use_adaptive_compression": True,
        "use_validation_loop": True,
        "use_overlap_dedup": True,
        "use_hierarchical_merge": True,
    }
    assert b.settings.validation_max_attempts == 2
    assert b.settings.summarization_strategy == SummarizationStrategy.STRUCTURED


def test_quality_preset_enables_everything_with_two_pass():
    b = PipelineBuilder().quality()
    assert all(_flags(b).values())
    assert b.settings.validation_max_attempts == 3
    assert b.settings.summarization_strategy == SummarizationStrategy.TWO_PASS


def test_requested_strategy_overrides_the_preset():
    b = PipelineBuilder().balanced().with_strategy(SummarizationStrategy.CHAIN_OF_DENSITY)
    assert b.settings.summarization_strategy == SummarizationStrategy.CHAIN_OF_DENSITY


def test_with_ollama_sets_llm_settings():
    b = PipelineBuilder().with_ollama(base_url="http://llm:11434", model="m", embed_model="e")
    assert (b.settings.ollama_base_url, b.settings.ollama_model, b.settings.ollama_embed_model) == (
        "http://llm:11434", "m", "e")


def test_semantic_chunking_switches_the_chunker_type():
    b = PipelineBuilder().with_semantic_chunking(similarity_threshold=0.5)
    assert b.settings.chunker_type == ChunkerType.SEMANTIC
    assert b.settings.semantic_similarity_threshold == 0.5
    assert b.with_token_chunking().settings.chunker_type == ChunkerType.TOKEN


def test_build_hands_the_same_settings_and_flags_to_the_pipeline():
    b = PipelineBuilder().fast()
    pipeline = b.build()
    assert pipeline.settings is b.settings
    assert pipeline.features is b.features
