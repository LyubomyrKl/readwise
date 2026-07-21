# summarizer-contracts

Python validators and schemas for the Summarizer system.

## Installation

```bash
pip install summarizer-contracts
```

## Usage

### Basic Validation

```python
from summarizer_contracts import validate_summarize_request_v1

request = {
    "v": 1,
    "jobId": "job-123",
    "userId": "user-456",
    "input": {
        "url": "https://example.com/doc.pdf",
        "key": "documents/doc.pdf",
        "mime": "application/pdf"
    },
    "params": {
        "type": "extractive",
        "ratio": 0.3
    }
}

try:
    validate_summarize_request_v1(request)
    print(f"Processing job {request['jobId']}")
except ValueError as e:
    print(f"Validation error: {e}")
```

### Exception Handling

```python
from summarizer_contracts import validate_summary_failed_v1

failure_event = {
    "v": 1,
    "jobId": "job-failed-123",
    "error": {
        "code": "DOCUMENT_TOO_LARGE", 
        "message": "Document exceeds size limit",
        "details": {"actualSize": 67108864, "maxSize": 52428800}
    }
}

try:
    validate_summary_failed_v1(failure_event)
    # Event is valid, process it
    handle_failure(failure_event)
except ValueError as e:
    # Invalid event format
    logger.error(f"Invalid failure event: {e}")
```

### Raw Schemas

```python
from summarizer_contracts import get_schema

# Get raw schema for custom validation
schema = get_schema("summarize-request")
print(schema["$id"])  # https://schemas.summarizer.com/events/summarize.request.v1.schema.json

# Available schema names
from summarizer_contracts import get_available_schemas
print(get_available_schemas())
```

## Available Validators

### validate_summarize_request_v1(data)

Validates requests to start document summarization.

**Required fields:**
- `v`: Version number (must be `1`)
- `jobId`: Unique job identifier  
- `userId`: User identifier
- `input.url`: Document URL
- `input.key`: S3 storage key
- `input.mime`: MIME type
- `params.type`: Summary type (`"extractive"`, `"abstractive"`, or `"section"`)
- `params.ratio`: Summary ratio (0.1 to 0.5)

**Raises:** `ValueError` with detailed message if validation fails

### validate_summary_completed_v1(data)

Validates successful completion events.

**Required fields:**
- `v`: Version number (must be `1`)
- `jobId`: Job identifier
- `outputKey`: S3 key of generated summary

**Optional fields:**
- `stats.pages`: Number of pages processed (integer)
- `stats.durationMs`: Processing time in milliseconds (integer)

**Raises:** `ValueError` with detailed message if validation fails

### validate_summary_failed_v1(data)

Validates failure events.

**Required fields:**
- `v`: Version number (must be `1`)
- `jobId`: Job identifier  
- `error.code`: Error code (UPPER_SNAKE_CASE string)
- `error.message`: Human-readable error message

**Optional fields:**
- `error.details`: Additional error context (object)

**Raises:** `ValueError` with detailed message if validation fails

## Schema Access

### get_schema(name)

Returns raw JSON schema objects for embedding in applications.

**Available schema names:**
- `"common"` or `"common.v1"` - Common type definitions
- `"summarize-request"` or `"summarize.request.v1"` - Request schema
- `"summary-completed"` or `"summary.completed.v1"` - Completion schema  
- `"summary-failed"` or `"summary.failed.v1"` - Failure schema

**Example:**
```python
request_schema = get_schema("summarize-request")
# Use with jsonschema library directly
from jsonschema import validate
validate(data, request_schema)
```

### get_available_schemas()

Returns list of all available schema names.

## Error Handling

All validation functions raise `ValueError` with descriptive messages:

```python
try:
    validate_summarize_request_v1(invalid_data)
except ValueError as e:
    print(f"Validation failed: {e}")
    # Example output: "Validation error at params.ratio: 0.8 is greater than the maximum of 0.5"
```

## Type Hints

The package is fully typed with proper type hints for all public functions.

## Examples

### Gateway Service Integration

```python
from flask import Flask, request, jsonify
from summarizer_contracts import validate_summarize_request_v1

app = Flask(__name__)

@app.route('/summaries', methods=['POST'])
def create_summary():
    try:
        validate_summarize_request_v1(request.json)
        # Process valid request
        job_id = request.json['jobId'] 
        # ... business logic
        return jsonify({"jobId": job_id})
    except ValueError as e:
        return jsonify({"error": str(e)}), 400
```

### Worker Service Integration

```python
import json
from summarizer_contracts import validate_summary_completed_v1

def publish_completion(job_id: str, output_key: str, stats: dict = None):
    """Publish a completion event after validation"""
    event = {
        "v": 1,
        "jobId": job_id,
        "outputKey": output_key,
    }
    if stats:
        event["stats"] = stats
        
    # Validate before publishing
    validate_summary_completed_v1(event)
    
    # Publish to message queue
    queue.publish(json.dumps(event))
```

## Requirements

- **Python**: 3.8 or higher
- **Dependencies**: jsonschema >= 4.17.0

## Versioning

This package follows semantic versioning. Schema versions are independent of package versions:

- Package version updates indicate library changes
- Schema version (`v` field) indicates contract changes  
- Breaking schema changes create new schema versions (v2, v3, etc.)

## Related Packages

- [`@summarizer/contracts`](https://www.npmjs.com/package/@summarizer/contracts) - TypeScript equivalent