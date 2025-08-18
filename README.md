# Summarizer Contracts

The single source of truth for JSON Schemas, OpenAPI specifications, and validator libraries for the Summarizer system.

## Purpose

This repository provides:

- **JSON Schemas** for all events in the summarizer system
- **OpenAPI specification** for the gateway API
- **Validator libraries** for TypeScript and Python
- **Type definitions** and runtime validation
- **Test fixtures** and comprehensive test suites

## Versioning

This project follows [Semantic Versioning](https://semver.org/) with the following rules:

- **PATCH**: Bug fixes, documentation updates, non-breaking changes
- **MINOR**: New schemas, new optional fields, backward-compatible changes
- **MAJOR**: Breaking changes to existing schemas or APIs

### Schema Evolution

- Breaking changes create new files with incremented version suffixes (e.g., `v1` → `v2`)
- Existing schemas are never mutated once published
- All packages maintain version compatibility with schemas

## Installation

### TypeScript/Node.js

```bash
npm install @summarizer/contracts
```

### Python

```bash
pip install summarizer-contracts
```

## Usage

### TypeScript

```typescript
import { 
  validateSummarizeRequestV1,
  validateSummaryCompletedV1,
  SummarizeRequestV1,
  SummaryCompletedV1
} from '@summarizer/contracts';

// Validate and get typed data
const request: SummarizeRequestV1 = {
  v: 1,
  jobId: "job-123",
  userId: "user-456",
  input: {
    url: "https://example.com/doc.pdf",
    key: "documents/doc.pdf",
    mime: "application/pdf"
  },
  params: {
    type: "extractive",
    ratio: 0.3
  }
};

if (validateSummarizeRequestV1(request)) {
  // Request is valid and typed
  console.log(request.jobId);
} else {
  console.error(validateSummarizeRequestV1.errors);
}
```

### Python

```python
from summarizer_contracts import (
    validate_summarize_request_v1,
    validate_summary_completed_v1,
    get_schema
)

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
    print(f"Valid request for job {request['jobId']}")
except ValueError as e:
    print(f"Validation error: {e}")
```

## Compatibility Matrix

| Package Version | Schema Version | Compatible Services |
|----------------|---------------|-------------------|
| 1.x.x          | v1            | Gateway v1, Worker v1 |

## Development

### Publishing

1. Update version in `package.json`, `pyproject.toml`, and `CHANGELOG.md`
2. Commit changes: `git commit -m "chore: bump version to x.y.z"`
3. Create and push tag: `git tag vx.y.z && git push origin vx.y.z`
4. GitHub Actions will automatically publish to npm and PyPI

### Testing

```bash
# TypeScript tests
cd packages/ts && npm test

# Python tests  
cd packages/py && pytest
```

## Repository Structure

The repository provides a complete contracts system with the following components:

- **JSON Schemas** (`schemas/`) - Event definitions with examples
- **OpenAPI Spec** (`openapi/`) - Gateway API specification  
- **TypeScript Package** (`packages/ts/`) - Validators and types for Node.js
- **Python Package** (`packages/py/`) - Validators for Python
- **Test Suites** (`tests/`) - Comprehensive validation tests
- **CI/CD** (`.github/workflows/`) - Automated testing and publishing

## Ready to Use

This repository includes everything needed for production use:

✅ **Complete package definitions** with proper versioning
✅ **Automated CI/CD workflows** for quality assurance  
✅ **Publishing pipelines** to npm and PyPI registries
✅ **Comprehensive test suites** with fixtures
✅ **Documentation** and usage examples
✅ **Security validation** and dependency auditing

Simply set up repository secrets for `NPM_TOKEN` and `PYPI_TOKEN` and the system is ready for automated releases.