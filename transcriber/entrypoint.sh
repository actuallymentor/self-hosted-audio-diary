#!/bin/sh
set -eu

service_uid="${APP_UID:-10001}"
service_gid="${APP_GID:-10001}"
cache_root="${MODEL_CACHE_PATH:-/var/lib/transcriber/huggingface}"

export HF_HOME="$cache_root"
export HF_TOKEN_PATH="$cache_root/token"
export HUGGINGFACE_HUB_CACHE="$cache_root"

# An empty mount is safe to claim. Existing model caches retain operator ownership.
install -d -m 0750 "$cache_root"

if [ -z "$(find "$cache_root" -mindepth 1 -maxdepth 1 -print -quit)" ]; then
    chown "$service_uid:$service_gid" "$cache_root"
fi

setpriv --reuid="$service_uid" --regid="$service_gid" --clear-groups test -w "$cache_root"

exec setpriv --reuid="$service_uid" --regid="$service_gid" --clear-groups "$@"
