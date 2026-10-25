"""Workbench Python workers: a queue consumer, a job runner and per-tool handlers.

Layout (docs/toolbox-architecture-plan.md, 2.9 and 3.2):
  worker/platform   settings, logging, message contracts, queue consumer, event publisher,
                    job runner, S3 storage, LLM host probe
  worker/tools/<id> handlers of one tool; they read only the job payload and storage,
                    never a database
"""
