# Base image for the per-case agent sandbox. Run with no network,
# 4GB memory limit, and the case worktree bind-mounted (see PLAN.md).
FROM python:3.12-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
    git \
    jq \
    poppler-utils \
    miller \
    && rm -rf /var/lib/apt/lists/*

RUN pip install --no-cache-dir \
    pandas \
    openpyxl \
    pdfplumber \
    csvkit

RUN useradd --create-home agent
USER agent
WORKDIR /case

CMD ["sleep", "infinity"]
