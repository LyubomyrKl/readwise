"""
Validation functions for summarizer event schemas
"""

import json
import os
from functools import lru_cache
from pathlib import Path
from typing import Any, Dict

from jsonschema import Draft202012Validator, validators
from jsonschema.exceptions import ValidationError

# Cache for loaded schemas
_SCHEMA_CACHE: Dict[str, Dict[str, Any]] = {}


def _get_schemas_dir() -> Path:
    """Get the path to the schemas directory"""
    return Path(__file__).parent / "schemas"


@lru_cache(maxsize=None)
def _load_schema(schema_file: str) -> Dict[str, Any]:
    """Load a JSON schema from file with caching"""
    if schema_file in _SCHEMA_CACHE:
        return _SCHEMA_CACHE[schema_file]
    
    schemas_dir = _get_schemas_dir()
    schema_path = schemas_dir / schema_file
    
    if not schema_path.exists():
        raise FileNotFoundError(f"Schema file not found: {schema_path}")
    
    with open(schema_path, "r", encoding="utf-8") as f:
        schema = json.load(f)
    
    _SCHEMA_CACHE[schema_file] = schema
    return schema


def _create_validator_with_refs(schema: Dict[str, Any]) -> Draft202012Validator:
    """Create a validator with $ref resolution support"""
    # Load the common schema for $ref resolution
    common_schema = _load_schema("common.v1.schema.json")
    
    # Create a custom resolver that can handle our schema references
    schema_store = {
        "https://schemas.summarizer.com/$defs/common.v1.schema.json": common_schema,
        schema.get("$id", ""): schema,
    }
    
    # Create validator class with custom resolver
    validator_cls = validators.create(
        meta_schema=Draft202012Validator.META_SCHEMA,
        validators=Draft202012Validator._VALIDATORS,
    )
    
    # Create resolver
    resolver = validator_cls._SCHEMA_ROOT_RESOLVER.resolve_from_schema(
        schema, schema_store
    )[1]
    
    return validator_cls(schema, resolver=resolver)


def validate_summarize_request_v1(data: Any) -> None:
    """
    Validate a SummarizeRequestV1 event object
    
    Args:
        data: The data to validate
        
    Raises:
        ValueError: If validation fails, with detailed error message
    """
    schema = _load_schema("summarize.request.v1.schema.json")
    validator = _create_validator_with_refs(schema)
    
    try:
        validator.validate(data)
    except ValidationError as e:
        # Create a more user-friendly error message
        error_path = ".".join(str(p) for p in e.absolute_path) if e.absolute_path else "root"
        raise ValueError(f"Validation error at {error_path}: {e.message}") from e


def validate_summary_completed_v1(data: Any) -> None:
    """
    Validate a SummaryCompletedV1 event object
    
    Args:
        data: The data to validate
        
    Raises:
        ValueError: If validation fails, with detailed error message
    """
    schema = _load_schema("summary.completed.v1.schema.json")
    validator = _create_validator_with_refs(schema)
    
    try:
        validator.validate(data)
    except ValidationError as e:
        error_path = ".".join(str(p) for p in e.absolute_path) if e.absolute_path else "root"
        raise ValueError(f"Validation error at {error_path}: {e.message}") from e


def validate_summary_failed_v1(data: Any) -> None:
    """
    Validate a SummaryFailedV1 event object
    
    Args:
        data: The data to validate
        
    Raises:
        ValueError: If validation fails, with detailed error message
    """
    schema = _load_schema("summary.failed.v1.schema.json") 
    validator = _create_validator_with_refs(schema)
    
    try:
        validator.validate(data)
    except ValidationError as e:
        error_path = ".".join(str(p) for p in e.absolute_path) if e.absolute_path else "root"
        raise ValueError(f"Validation error at {error_path}: {e.message}") from e


def get_schema(name: str) -> Dict[str, Any]:
    """
    Get a raw schema object by name
    
    Args:
        name: Schema name, one of:
            - 'common' or 'common.v1'
            - 'summarize-request' or 'summarize.request.v1' 
            - 'summary-completed' or 'summary.completed.v1'
            - 'summary-failed' or 'summary.failed.v1'
    
    Returns:
        The raw JSON schema as a dictionary
        
    Raises:
        ValueError: If schema name is not recognized
    """
    # Normalize schema names
    name_mapping = {
        "common": "common.v1.schema.json",
        "common.v1": "common.v1.schema.json",
        "summarize-request": "summarize.request.v1.schema.json",
        "summarize.request.v1": "summarize.request.v1.schema.json",
        "summary-completed": "summary.completed.v1.schema.json", 
        "summary.completed.v1": "summary.completed.v1.schema.json",
        "summary-failed": "summary.failed.v1.schema.json",
        "summary.failed.v1": "summary.failed.v1.schema.json",
    }
    
    if name not in name_mapping:
        available = ", ".join(sorted(name_mapping.keys()))
        raise ValueError(f"Unknown schema name '{name}'. Available: {available}")
    
    schema_file = name_mapping[name]
    return _load_schema(schema_file)


def get_available_schemas() -> list[str]:
    """
    Get list of all available schema names
    
    Returns:
        List of schema names that can be used with get_schema()
    """
    return [
        "common",
        "common.v1", 
        "summarize-request",
        "summarize.request.v1",
        "summary-completed",
        "summary.completed.v1",
        "summary-failed",
        "summary.failed.v1",
    ]