#!/bin/sh
set -eu

app_uid="${APP_UID:-10001}"
app_gid="${APP_GID:-10001}"

# Create only known mount roots. Existing archives are never recursively changed.
install -d -m 0750 -o "$app_uid" -g "$app_gid" /data/app /data/diary

for mount_root in /data/app /data/diary; do
    # An empty Docker-created mount has no archive ownership to preserve.
    if [ -z "$(find "$mount_root" -mindepth 1 -maxdepth 1 -print -quit)" ]; then
        chown "$app_uid:$app_gid" "$mount_root"
    fi
done

setpriv --reuid="$app_uid" --regid="$app_gid" --clear-groups test -w /data/app
setpriv --reuid="$app_uid" --regid="$app_gid" --clear-groups test -w /data/diary

exec setpriv --reuid="$app_uid" --regid="$app_gid" --clear-groups "$@"
