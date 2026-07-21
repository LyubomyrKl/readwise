"""Tests for summarizer-contracts validators"""

import json
import pytest
from pathlib import Path

from summarizer_contracts import (
    validate_summarize_request_v1,
    validate_summary_completed_v1,
    validate_summary_failed_v1,
    get_schema,
    get_available_schemas,
)


def load_fixture(path: str):
    """Load a test fixture by path"""
    fixture_path = Path(__file__).parent.parent / "fixtures" / path
    with open(fixture_path) as f:
        return json.load(f)


class TestSummarizeRequestV1:
    """Tests for summarize request validation"""

    def test_validate_basic_request(self):
        """Should validate a basic valid request"""
        request = load_fixture("valid/summarize-request-basic.json")
        # Should not raise
        validate_summarize_request_v1(request)

    def test_validate_abstractive_request(self):
        """Should validate abstractive request"""
        request = load_fixture("valid/summarize-request-abstractive.json")
        validate_summarize_request_v1(request)

    def test_validate_section_request(self):
        """Should validate section request"""
        request = load_fixture("valid/summarize-request-section.json")
        validate_summarize_request_v1(request)

    def test_reject_missing_version(self):
        """Should reject request missing version field"""
        request = load_fixture("invalid/summarize-request-missing-v.json")
        with pytest.raises(ValueError, match="required"):
            validate_summarize_request_v1(request)

    def test_reject_invalid_ratio(self):
        """Should reject request with ratio out of bounds"""
        request = load_fixture("invalid/summarize-request-invalid-ratio.json")
        with pytest.raises(ValueError, match="ratio.*greater than.*maximum"):
            validate_summarize_request_v1(request)

    def test_reject_invalid_type(self):
        """Should reject request with invalid summary type"""
        request = load_fixture("invalid/summarize-request-invalid-type.json")
        with pytest.raises(ValueError, match="not one of"):
            validate_summarize_request_v1(request)

    def test_reject_additional_properties(self):
        """Should reject request with additional properties"""
        request = load_fixture("valid/summarize-request-basic.json")
        request["extraField"] = "not allowed"
        
        with pytest.raises(ValueError, match="Additional properties"):
            validate_summarize_request_v1(request)

    def test_reject_invalid_job_id(self):
        """Should reject request with invalid job ID pattern"""
        request = load_fixture("valid/summarize-request-basic.json")
        request["jobId"] = "invalid job id with spaces"
        
        with pytest.raises(ValueError, match="does not match"):
            validate_summarize_request_v1(request)

    def test_reject_invalid_url(self):
        """Should reject request with invalid URL format"""
        request = load_fixture("valid/summarize-request-basic.json")
        request["input"]["url"] = "not-a-url"
        
        with pytest.raises(ValueError):
            validate_summarize_request_v1(request)


class TestSummaryCompletedV1:
    """Tests for summary completion validation"""

    def test_validate_basic_completion(self):
        """Should validate basic completion without stats"""
        event = load_fixture("valid/summary-completed-basic.json")
        validate_summary_completed_v1(event)

    def test_validate_completion_with_stats(self):
        """Should validate completion with stats"""
        event = load_fixture("valid/summary-completed-with-stats.json")
        validate_summary_completed_v1(event)

    def test_reject_missing_output_key(self):
        """Should reject completion missing outputKey"""
        event = load_fixture("invalid/summary-completed-missing-outputkey.json")
        with pytest.raises(ValueError, match="required"):
            validate_summary_completed_v1(event)

    def test_reject_invalid_stats(self):
        """Should reject completion with invalid stats"""
        event = load_fixture("valid/summary-completed-with-stats.json")
        event["stats"]["pages"] = -1  # Invalid: below minimum
        
        with pytest.raises(ValueError, match="less than.*minimum"):
            validate_summary_completed_v1(event)

    def test_reject_stats_additional_properties(self):
        """Should reject stats with additional properties"""
        event = load_fixture("valid/summary-completed-with-stats.json")
        event["stats"]["invalidField"] = "not allowed"
        
        with pytest.raises(ValueError, match="Additional properties"):
            validate_summary_completed_v1(event)


class TestSummaryFailedV1:
    """Tests for summary failure validation"""

    def test_validate_basic_failure(self):
        """Should validate basic failure"""
        event = load_fixture("valid/summary-failed-basic.json")
        validate_summary_failed_v1(event)

    def test_validate_failure_with_details(self):
        """Should validate failure with details"""
        event = load_fixture("valid/summary-failed-with-details.json")
        validate_summary_failed_v1(event)

    def test_reject_invalid_error_code(self):
        """Should reject failure with invalid error code pattern"""
        event = load_fixture("invalid/summary-failed-invalid-error-code.json")
        with pytest.raises(ValueError, match="does not match"):
            validate_summary_failed_v1(event)

    def test_reject_missing_error_code(self):
        """Should reject failure missing error code"""
        event = load_fixture("valid/summary-failed-basic.json")
        del event["error"]["code"]
        
        with pytest.raises(ValueError, match="required"):
            validate_summary_failed_v1(event)

    def test_reject_missing_error_message(self):
        """Should reject failure missing error message"""
        event = load_fixture("invalid/summary-failed-missing-message.json")
        with pytest.raises(ValueError, match="required"):
            validate_summary_failed_v1(event)

    def test_reject_empty_error_message(self):
        """Should reject failure with empty error message"""
        event = load_fixture("valid/summary-failed-basic.json")
        event["error"]["message"] = ""
        
        with pytest.raises(ValueError, match="too short"):
            validate_summary_failed_v1(event)

    def test_reject_error_additional_properties(self):
        """Should reject error with additional properties"""
        event = load_fixture("valid/summary-failed-basic.json")
        event["error"]["invalidField"] = "not allowed"
        
        with pytest.raises(ValueError, match="Additional properties"):
            validate_summary_failed_v1(event)


class TestSchemaAccess:
    """Tests for schema access functions"""

    def test_get_schema_by_name(self):
        """Should return schema objects by name"""
        common_schema = get_schema("common")
        assert common_schema["$id"] == "https://schemas.summarizer.com/$defs/common.v1.schema.json"
        assert "$defs" in common_schema

        request_schema = get_schema("summarize-request")
        assert request_schema["$id"] == "https://schemas.summarizer.com/events/summarize.request.v1.schema.json"
        assert "properties" in request_schema

    def test_get_schema_with_version_suffix(self):
        """Should accept schema names with version suffixes"""
        schema1 = get_schema("common")
        schema2 = get_schema("common.v1")
        assert schema1 == schema2

        schema3 = get_schema("summarize-request")
        schema4 = get_schema("summarize.request.v1")
        assert schema3 == schema4

    def test_get_schema_invalid_name(self):
        """Should raise error for invalid schema name"""
        with pytest.raises(ValueError, match="Unknown schema name"):
            get_schema("invalid-schema-name")

    def test_get_available_schemas(self):
        """Should return list of available schema names"""
        available = get_available_schemas()
        assert isinstance(available, list)
        assert "common" in available
        assert "summarize-request" in available
        assert "summary-completed" in available
        assert "summary-failed" in available

    def test_schema_has_proper_structure(self):
        """Should return properly structured schemas"""
        request_schema = get_schema("summarize-request")
        
        # Should have JSON Schema 2020-12 meta schema
        assert request_schema["$schema"] == "https://json-schema.org/draft/2020-12/schema"
        
        # Should have additionalProperties: false
        assert request_schema["additionalProperties"] is False
        
        # Should have required fields
        assert "required" in request_schema
        assert "v" in request_schema["required"]
        assert "jobId" in request_schema["required"]
        
        # Should have examples
        assert "examples" in request_schema
        assert isinstance(request_schema["examples"], list)
        assert len(request_schema["examples"]) > 0


class TestErrorMessages:
    """Tests for error message quality"""

    def test_error_includes_path_information(self):
        """Should include field path in error messages"""
        request = load_fixture("valid/summarize-request-basic.json")
        request["params"]["ratio"] = 0.8  # Invalid
        
        with pytest.raises(ValueError) as exc_info:
            validate_summarize_request_v1(request)
        
        error_msg = str(exc_info.value)
        assert "params.ratio" in error_msg
        assert "greater than" in error_msg

    def test_error_includes_constraint_details(self):
        """Should include constraint details in error messages"""
        request = load_fixture("valid/summarize-request-basic.json")
        request["jobId"] = ""  # Too short
        
        with pytest.raises(ValueError) as exc_info:
            validate_summarize_request_v1(request)
        
        error_msg = str(exc_info.value)
        assert "jobId" in error_msg
        assert "too short" in error_msg or "minLength" in error_msg


class TestSchemaValidation:
    """Tests that schemas themselves are valid"""

    def test_schemas_are_valid_json_schema(self):
        """All schemas should be valid JSON Schema Draft 2020-12"""
        from jsonschema import Draft202012Validator
        
        # Test each schema
        for schema_name in ["common", "summarize-request", "summary-completed", "summary-failed"]:
            schema = get_schema(schema_name)
            
            # Should not raise ValidationError
            Draft202012Validator.check_schema(schema)
            
    def test_examples_validate_against_schemas(self):
        """Examples in schemas should validate against the schemas"""
        request_schema = get_schema("summarize-request")
        completed_schema = get_schema("summary-completed")
        failed_schema = get_schema("summary-failed")
        
        # Test request examples
        if "examples" in request_schema:
            for example in request_schema["examples"]:
                validate_summarize_request_v1(example)  # Should not raise
                
        # Test completed examples
        if "examples" in completed_schema:
            for example in completed_schema["examples"]:
                validate_summary_completed_v1(example)  # Should not raise
                
        # Test failed examples  
        if "examples" in failed_schema:
            for example in failed_schema["examples"]:
                validate_summary_failed_v1(example)  # Should not raise


class TestCrossValidation:
    """Tests for cross-validation between fixtures"""

    def test_all_valid_fixtures_pass(self):
        """All fixtures in valid/ should pass validation"""
        valid_dir = Path(__file__).parent.parent / "fixtures" / "valid"
        
        for fixture_file in valid_dir.glob("summarize-request*.json"):
            data = load_fixture(f"valid/{fixture_file.name}")
            validate_summarize_request_v1(data)  # Should not raise
            
        for fixture_file in valid_dir.glob("summary-completed*.json"):
            data = load_fixture(f"valid/{fixture_file.name}")
            validate_summary_completed_v1(data)  # Should not raise
            
        for fixture_file in valid_dir.glob("summary-failed*.json"):
            data = load_fixture(f"valid/{fixture_file.name}")
            validate_summary_failed_v1(data)  # Should not raise

    def test_all_invalid_fixtures_fail(self):
        """All fixtures in invalid/ should fail validation"""
        invalid_dir = Path(__file__).parent.parent / "fixtures" / "invalid"
        
        for fixture_file in invalid_dir.glob("summarize-request*.json"):
            data = load_fixture(f"invalid/{fixture_file.name}")
            with pytest.raises(ValueError):
                validate_summarize_request_v1(data)
                
        for fixture_file in invalid_dir.glob("summary-completed*.json"):
            data = load_fixture(f"invalid/{fixture_file.name}")
            with pytest.raises(ValueError):
                validate_summary_completed_v1(data)
                
        for fixture_file in invalid_dir.glob("summary-failed*.json"):
            data = load_fixture(f"invalid/{fixture_file.name}")
            with pytest.raises(ValueError):
                validate_summary_failed_v1(data)