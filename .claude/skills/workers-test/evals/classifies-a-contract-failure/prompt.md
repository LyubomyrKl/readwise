---
tags: [workers-test]
max_turns: 30
timeout_seconds: 900
allowed_tools: [Read, Glob, Grep, Skill, Write, Edit, Bash]
---

I ran the python tests and got this. Is it the worker or the contracts?

```
$ scripts/test-workers.sh
............................................................F......
=================================== FAILURES ===================================
____________ test_valid_fixtures_are_accepted[envelope.extract.json] ___________
model = <class 'worker.platform.contracts.JobEnvelope'>
body = {'attempt': 1, 'correlationId': None, 'jobId': 'job-1', 'payload': {...}, 'priority': 5, ...}

    @pytest.mark.parametrize("model,body", _fixtures("valid"))
    def test_valid_fixtures_are_accepted(model, body):
>       parsed = model.model_validate(body)
E       pydantic_core._pydantic_core.ValidationError: 1 validation error for JobEnvelope
E       priority
E         Extra inputs are not permitted [type=extra_forbidden, input_value=5, input_type=int]

tests/test_contracts.py:21: ValidationError
=========================== short test summary info ============================
FAILED tests/test_contracts.py::test_valid_fixtures_are_accepted[envelope.extract.json] - pydantic_core._pydantic_core.ValidationError: 1 validation error for JobEnvelope
1 failed, 66 passed in 2.31s
```
