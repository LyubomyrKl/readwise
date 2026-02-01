#!/usr/bin/env python3
"""Startup script that runs both extraction and summarization workers concurrently."""

import subprocess
import sys
import signal
import os

processes = []


def signal_handler(signum, _frame):
    """Handle shutdown signals gracefully."""
    print(f"\nReceived signal {signum}, shutting down workers...")
    for proc in processes:
        if proc.poll() is None:
            proc.terminate()
    for proc in processes:
        proc.wait()
    sys.exit(0)


def main():
    signal.signal(signal.SIGINT, signal_handler)
    signal.signal(signal.SIGTERM, signal_handler)

    extraction_worker = subprocess.Popen(
        [sys.executable, "/app/workers/extraction-worker/main.py"],
        env={**os.environ, "WORKER_ID": os.environ.get("WORKER_ID", "worker") + "-extraction"},
    )
    processes.append(extraction_worker)
    print("Started extraction worker")

    summarization_worker = subprocess.Popen(
        [sys.executable, "/app/workers/summarization-worker/main.py"],
        env={**os.environ, "WORKER_ID": os.environ.get("WORKER_ID", "worker") + "-summarization"},
    )
    processes.append(summarization_worker)
    print("Started summarization worker")

    print("Both workers are running. Press Ctrl+C to stop.")

    while True:
        for i, proc in enumerate(processes):
            retcode = proc.poll()
            if retcode is not None:
                worker_name = "extraction" if i == 0 else "summarization"
                print(f"{worker_name} worker exited with code {retcode}")
                signal_handler(signal.SIGTERM, None)

        try:
            processes[0].wait(timeout=1)
        except subprocess.TimeoutExpired:
            pass


if __name__ == "__main__":
    main()
