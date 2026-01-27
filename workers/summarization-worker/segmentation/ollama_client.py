"""Ollama client for embeddings and LLM calls."""

import json
import requests
import numpy as np
from typing import Dict


class OllamaClient:
    """Client for interacting with Ollama API for embeddings and LLM calls."""

    def __init__(
        self,
        base_url: str = "http://localhost:11434",
        llm_model: str = "qwen2.5:14b-instruct-q5_k_m",
        embed_model: str = "bge-m3"
    ):
        self.base_url = base_url
        self.llm_model = llm_model
        self.embed_model = embed_model

    def get_embedding(self, text: str) -> np.ndarray:
        """Get L2-normalized embedding from bge-m3 via Ollama."""
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
