FROM python:3.12-slim

WORKDIR /app

RUN apt-get update \
    && apt-get install -y --no-install-recommends curl \
    && rm -rf /var/lib/apt/lists/* \
    && useradd --create-home --uid 1000 levla

COPY backend/requirements.txt /app/backend/requirements.txt
# camel-tools depends on torch; the default wheel bundles ~8 GB of CUDA
# libraries this CPU-only box never loads. Install the CPU build first.
RUN pip install --no-cache-dir torch --index-url https://download.pytorch.org/whl/cpu
RUN pip install --no-cache-dir -r /app/backend/requirements.txt \
    && python -m spacy download it_core_news_md || true \
    && mkdir -p /app/camel_data \
    && CAMELTOOLS_DATA=/app/camel_data camel_data -i morphology-db-msa-r13 || true \
    && CAMELTOOLS_DATA=/app/camel_data camel_data -i disambig-mle-calima-msa-r13 || true

COPY backend /app/backend
COPY data /app/data

RUN chmod +x /app/backend/entrypoint.sh \
    && mkdir -p /app/backend/audio /data \
    && chown -R levla:levla /app /data

WORKDIR /app/backend
ENV PYTHONPATH=/app/backend
ENV PYTHONUNBUFFERED=1
ENV APP_ENV=production
ENV CAMELTOOLS_DATA=/app/camel_data
# glibc gives each request thread its own heap arena; with the 40-thread
# request pool that roughly doubled resident memory per replica.
ENV MALLOC_ARENA_MAX=2

USER levla
EXPOSE 8000
HEALTHCHECK --interval=30s --timeout=5s --start-period=300s --retries=3 \
    CMD curl -fsS http://127.0.0.1:8000/health || exit 1

ENTRYPOINT ["/app/backend/entrypoint.sh"]
