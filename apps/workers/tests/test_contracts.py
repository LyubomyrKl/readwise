"""The pydantic mirror must accept and reject exactly the shared fixtures (see packages/contracts)."""
import json

import pytest
from pydantic import ValidationError

from conftest import CONTRACTS
from worker.platform.contracts import JobControl, JobEnvelope, JobEvent

MODELS = {"envelope": JobEnvelope, "event": JobEvent, "control": JobControl}


def _fixtures(kind):
    files = sorted((CONTRACTS / "fixtures" / kind).glob("*.json"))
    assert files, f"no {kind} fixtures found under {CONTRACTS}"
    return [pytest.param(MODELS[f.name.split(".")[0]], json.loads(f.read_text()), id=f.name) for f in files]


@pytest.mark.parametrize("model,body", _fixtures("valid"))
def test_valid_fixtures_are_accepted(model, body):
    parsed = model.model_validate(body)
    assert parsed.jobId == body["jobId"]


@pytest.mark.parametrize("model,body", _fixtures("invalid"))
def test_invalid_fixtures_are_rejected(model, body):
    with pytest.raises(ValidationError):
        model.model_validate(body)


def test_event_serialises_without_nulls_and_with_routing_key():
    event = JobEvent.model_validate({"v": 1, "jobId": "j", "event": "waiting", "at": "2026-10-25T10:00:00Z",
                                     "workerId": "w", "reason": "LLM host unreachable"})
    assert event.routing_key() == "job.waiting"
    body = json.loads(event.to_json())
    assert body == {"v": 1, "jobId": "j", "event": "waiting", "at": "2026-10-25T10:00:00Z", "workerId": "w",
                    "reason": "LLM host unreachable"}


def test_every_valid_event_fixture_round_trips_through_to_json():
    for model, body in [p.values for p in _fixtures("valid")]:
        if model is JobEvent:
            again = json.loads(model.model_validate(body).to_json())
            assert JobEvent.model_validate(again).event == body["event"]
