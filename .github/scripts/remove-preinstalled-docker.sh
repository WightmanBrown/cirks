#!/usr/bin/env bash
# SPDX-License-Identifier: Apache-2.0
# Copyright (C) 2026 Wightman Brown Limited
# GitHub's Ubuntu runners come with Docker already installed, from Docker's own
# repository. The install guide starts from a machine without it, and its
# docker.io package conflicts with that one, so remove it first.
set -euo pipefail
sudo systemctl stop docker.socket docker.service containerd.service 2>/dev/null || true
mapfile -t pkgs < <(dpkg-query -W -f='${Package}\n' | grep -E '^(docker|containerd|moby|runc)' || true)
[ "${#pkgs[@]}" -eq 0 ] || sudo DEBIAN_FRONTEND=noninteractive apt-get purge -y "${pkgs[@]}"
sudo rm -rf /var/lib/docker /var/lib/containerd /etc/docker \
  /usr/local/lib/docker /usr/libexec/docker /usr/local/bin/docker-compose
if command -v docker >/dev/null; then echo "docker is still installed: $(command -v docker)" >&2; exit 1; fi
echo "Docker removed: this runner now starts like a new Ubuntu machine."
