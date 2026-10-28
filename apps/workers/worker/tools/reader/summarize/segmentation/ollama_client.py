"""Ollama client for embeddings and LLM calls."""

import json
import os
import requests
import numpy as np
from typing import Dict


class OllamaClient:
    """Client for interacting with Ollama API for embeddings and LLM calls."""

    def __init__(
        self,
        base_url: str = None,
        llm_model: str = None,
        embed_model: str = None
    ):
        # Use environment variables as defaults
        self.base_url = base_url or os.environ['OLLAMA_BASE_URL']
        self.llm_model = llm_model or os.environ['OLLAMA_MODEL']
        self.embed_model = embed_model or os.environ['OLLAMA_EMBED_MODEL']
        # call counters, reported in the job result (pipeline speed track baseline)
        self.calls = {"embeddings": 0, "llm": 0}

    def get_embedding(self, text: str) -> np.ndarray:
        """Get L2-normalized embedding from bge-m3 via Ollama."""
        self.calls["embeddings"] += 1
        try:
            response = requests.post(
                f"{self.base_url}/api/embeddings",
                json={"model": self.embed_model, "prompt": text},
                timeout=30
            )
            if response.status_code == 200:
                embedding = np.array(response.json()["embedding"])
                norm = np.linalg.norm(embedding)
                if norm > 0:
                    embedding = embedding / norm
                return embedding
            else:
                raise Exception(f"Embedding failed: {response.status_code}")
        except Exception as e:
            raise Exception(f"Ollama embedding error: {e}")

    def call_llm(self, prompt: str) -> Dict:
        """Call LLM via Ollama and return JSON response."""
        self.calls["llm"] += 1
        try:
            response = requests.post(
                f"{self.base_url}/api/generate",
                json={
                    "model": self.llm_model,
                    "prompt": prompt,
                    "stream": False,
                    "format": "json"
                },
                timeout=60
            )
            if response.status_code == 200:
                result = response.json()["response"].strip()
                return json.loads(result)
            else:
                raise Exception(f"LLM call failed: {response.status_code}")
        except json.JSONDecodeError as e:
            raise Exception(f"Invalid JSON from LLM: {e}")
        except Exception as e:
            raise Exception(f"LLM error: {e}")
