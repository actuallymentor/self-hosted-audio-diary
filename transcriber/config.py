import os
from pathlib import Path


def physical_cpu_threads():
    """Reserve one physical core when Linux topology is available."""

    allowed = getattr(os, "sched_getaffinity", lambda _pid: range(os.cpu_count() or 1))(0)
    cores = set()

    for cpu in allowed:
        topology = Path(f"/sys/devices/system/cpu/cpu{cpu}/topology")

        try:
            package = (topology / "physical_package_id").read_text().strip()
            core = (topology / "core_id").read_text().strip()
            cores.add((package, core))
        except OSError:
            cores.add(("logical", str(cpu)))

    return max(1, len(cores) - 1)


MODEL_ID = os.getenv("TRANSCRIPTION_MODEL", "Systran/faster-whisper-large-v3")
MODEL_REVISION = os.getenv(
    "TRANSCRIPTION_MODEL_REVISION",
    "edaa852ec7e145841d8ffdb056a99866b5f0a478",
)
COMPUTE_TYPE = os.getenv("TRANSCRIPTION_COMPUTE_TYPE", "int8")
CPU_THREADS_SETTING = os.getenv("TRANSCRIPTION_CPU_THREADS", "auto")
CPU_THREADS = physical_cpu_threads() if CPU_THREADS_SETTING == "auto" else int(CPU_THREADS_SETTING)
MODEL_CACHE_PATH = os.getenv("MODEL_CACHE_PATH", "/var/lib/transcriber/huggingface")
MODEL_OFFLINE = os.getenv("TRANSCRIPTION_OFFLINE", "false").lower() == "true"
