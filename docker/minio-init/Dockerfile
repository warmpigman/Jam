FROM debian:bullseye-slim

# Install necessary packages
RUN apt-get update && apt-get install -y \
    curl \
    wget \
    netcat-openbsd \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# Install MinIO client
RUN curl -fsSL https://dl.min.io/client/mc/release/linux-amd64/mc -o /usr/local/bin/mc \
    && chmod +x /usr/local/bin/mc

# Verify installation
RUN mc --version

ENTRYPOINT ["/bin/bash"]