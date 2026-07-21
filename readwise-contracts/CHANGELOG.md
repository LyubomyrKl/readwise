# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.0] - 2024-08-18

### Added
- Initial release of summarizer-contracts
- JSON Schema definitions for v1 events:
  - `summarize.request.v1.schema.json` - Document summarization requests
  - `summary.completed.v1.schema.json` - Successful completion events
  - `summary.failed.v1.schema.json` - Failure events with error details
- Common definitions schema `$defs/common.v1.schema.json`
- OpenAPI v1 specification for gateway endpoints:
  - POST `/summaries` - Create summarization jobs
  - GET `/jobs/{id}` - Get job status  
  - GET `/jobs/{id}/stream` - Server-sent events for real-time updates
- TypeScript package `@summarizer/contracts` with:
  - AJV-based validators with full error reporting
  - Generated TypeScript types for all events
  - ESM and CJS builds with proper exports
  - Type guards and assertion functions
- Python package `summarizer-contracts` with:
  - jsonschema-based validators  
  - Embedded schema files as package data
  - Comprehensive error messages with field paths
  - Schema access functions for custom validation
- Comprehensive test suites:
  - Positive and negative test fixtures
  - Cross-language validation consistency tests
  - Schema self-validation tests
  - Type inference verification
- CI/CD workflows:
  - Automated testing on pull requests and pushes
  - Multi-Python version testing (3.8-3.12)
  - Schema and OpenAPI spec validation
  - Security auditing with safety and bandit
  - Cross-package integration testing
- Release automation:
  - Automated npm and PyPI publishing on git tags
  - Version consistency validation
  - GitHub releases with changelog extraction
  - Build artifact attachment
- Documentation:
  - Complete usage examples for both packages
  - API reference and compatibility matrix
  - Development and contribution guidelines