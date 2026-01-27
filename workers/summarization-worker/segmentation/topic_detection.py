"""Topic shift detection using embeddings and z-score analysis."""

from typing import List
import numpy as np


def compute_topic_shift_scores(embeddings: List[np.ndarray]) -> np.ndarray:
    """Compute topic shift scores: 1 - cos(E[i], E[i+1])."""
    scores = []
    for i in range(len(embeddings) - 1):
        cos_sim = np.dot(embeddings[i], embeddings[i + 1])
        topic_shift = 1.0 - cos_sim
        scores.append(topic_shift)
    return np.array(scores)


def find_peaks_zscore(
    scores: np.ndarray,
    z_window: int = 21,
    z_threshold: float = 2.5
) -> List[int]:
    """Find peaks using rolling z-score with specified window and threshold."""
    if len(scores) < z_window:
        return []

    z_scores = []
    half_window = z_window // 2

    for i in range(len(scores)):
        start = max(0, i - half_window)
        end = min(len(scores), i + half_window + 1)
        window = scores[start:end]

        if len(window) > 1:
            mean = np.mean(window)
            std = np.std(window)
            if std > 0:
                z_score = (scores[i] - mean) / std
            else:
                z_score = 0.0
        else:
            z_score = 0.0

        z_scores.append(z_score)

    peaks = []
    for i, z in enumerate(z_scores):
        if z > z_threshold:
            peaks.append(i)

    return peaks