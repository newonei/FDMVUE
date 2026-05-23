#!/usr/bin/env bash
#
# 前端拉取部署脚本（FDMVUE 仓库专用，对应 .github/workflows/fdm-build.yml）。
#
# 工作流程：
#   1. 从 OSS 找最新 build-* tag（curl latest.txt）
#   2. 下载 dist 的 tar.gz + sha256
#   3. 校验 sha256
#   4. 解压到 ${APP_ROOT}/releases/<id>/frontend/
#   5. 原子切换 ${APP_ROOT}/current symlink 指向 release_dir/frontend
#   6. （可选）reload nginx
#
# 典型用法：
#   sudo APP_NAME=fdmvue \
#        APP_ROOT=/home/www/FDMVue-deploy \
#        OSS_BASE_URL=https://my-bucket.oss-cn-hangzhou.aliyuncs.com/fdmvue-yyyyyy \
#        bash /home/www/FDMVue-deploy/scripts/pull-deploy-frontend.sh
#
# 接 nginx（一次性配置，让 nginx 看到 current 链接的内容）：
#   sudo mv /home/www/FDMVue /home/www/FDMVue.bak
#   sudo ln -s /home/www/FDMVue-deploy/current /home/www/FDMVue
#

set -Eeuo pipefail
IFS=$'\n\t'

# -------- Configuration --------
APP_NAME="${APP_NAME:-fdmvue}"
APP_ROOT="${APP_ROOT:-/home/www/FDMVue-deploy}"
DEPLOY_ENV="${DEPLOY_ENV:-prod}"
RELEASES_DIR="${APP_ROOT}/releases"
PACKAGES_DIR="${APP_ROOT}/packages"
CURRENT_LINK="${APP_ROOT}/current"
PULL_LOG_DIR="${APP_ROOT}/logs"
STATE_DIR="${APP_ROOT}/state"
LAST_TAG_FILE="${STATE_DIR}/last-deployed-tag"
LOCK_FILE="${APP_ROOT}/pull-deploy.lock"

RELEASE_TAG="${RELEASE_TAG:-}"
TAG_PREFIX="${TAG_PREFIX:-build-}"
KEEP_RELEASES="${KEEP_RELEASES:-5}"
RELOAD_NGINX="${RELOAD_NGINX:-false}"

# 必填：OSS 公读 URL 前缀（不带末尾斜杠）
OSS_BASE_URL="${OSS_BASE_URL:?OSS_BASE_URL is required, e.g. https://bucket.oss-cn-hangzhou.aliyuncs.com/fdmvue-xxxx}"

mkdir -p "${RELEASES_DIR}" "${PACKAGES_DIR}" "${PULL_LOG_DIR}" "${STATE_DIR}"

# -------- Helpers --------
log() {
  printf '[%s] [pull-deploy/%s] %s\n' \
    "$(date '+%Y-%m-%d %H:%M:%S')" "${APP_NAME}" "$*"
}

die() { log "ERROR: $*"; exit 1; }

require_cmd() {
  command -v "$1" >/dev/null 2>&1 || die "Required command not found: $1"
}

require_cmd curl
require_cmd sha256sum
require_cmd tar
require_cmd flock

exec 9>"${LOCK_FILE}"
flock -n 9 || die "Another pull-deploy is running"

# -------- Resolve target release --------
if [[ -n "${RELEASE_TAG}" ]]; then
  target_tag="${RELEASE_TAG}"
else
  target_tag="$(curl -fsS --retry 3 --retry-delay 2 --max-time 30 \
      "${OSS_BASE_URL%/}/latest.txt" | tr -d '[:space:]')"
  [[ -n "${target_tag}" ]] || die "OSS latest.txt is empty"
fi
log "Target release tag: ${target_tag}"

# 幂等：cron 重复跑同一 tag 直接跳过
if [[ -z "${RELEASE_TAG}" && -f "${LAST_TAG_FILE}" ]]; then
  last_tag="$(cat "${LAST_TAG_FILE}" || true)"
  if [[ "${last_tag}" == "${target_tag}" ]]; then
    log "Tag ${target_tag} already deployed; skip"
    exit 0
  fi
fi

# -------- Download --------
download_dir="$(mktemp -d)"
trap 'rm -rf "${download_dir}"' EXIT

base_url="${OSS_BASE_URL%/}/${target_tag}"

# 命名约定要和 fdm-build.yml 的 package step 完全一致：
#   ${APP_NAME}-${DEPLOY_ENV}-<sha>.tar.gz
sha="${target_tag#${TAG_PREFIX}}"
package_file="${APP_NAME}-${DEPLOY_ENV}-${sha}.tar.gz"

log "GET ${base_url}/${package_file}"
curl -fSL --retry 3 --retry-delay 2 --max-time 600 \
  -o "${download_dir}/${package_file}" \
  "${base_url}/${package_file}"

log "GET ${base_url}/${package_file}.sha256"
curl -fSL --retry 3 --retry-delay 2 --max-time 60 \
  -o "${download_dir}/${package_file}.sha256" \
  "${base_url}/${package_file}.sha256"

log "Verifying checksum"
(cd "${download_dir}" && sha256sum -c "${package_file}.sha256")

final_package="${PACKAGES_DIR}/${package_file}"
mv -f "${download_dir}/${package_file}" "${final_package}"
mv -f "${download_dir}/${package_file}.sha256" "${final_package}.sha256"
log "Package staged at ${final_package}"

# -------- Extract + atomic symlink swap --------
release_id="$(date '+%Y%m%d%H%M%S')-${target_tag}"
release_dir="${RELEASES_DIR}/${release_id}"
[[ ! -e "${release_dir}" ]] || die "Release dir already exists: ${release_dir}"

mkdir -p "${release_dir}"
log "Extracting to ${release_dir}"
tar -xzf "${final_package}" -C "${release_dir}"

# fdm-build.yml 打包的结构是 release/frontend/index.html
new_frontend="${release_dir}/frontend"
[[ -s "${new_frontend}/index.html" ]] || die "Missing frontend/index.html in tarball"

log "Switching symlink ${CURRENT_LINK} → ${new_frontend}"
tmp_link="${CURRENT_LINK}.tmp"
ln -sfn "${new_frontend}" "${tmp_link}"
mv -T "${tmp_link}" "${CURRENT_LINK}"

# -------- Optional nginx reload --------
if [[ "${RELOAD_NGINX}" == "true" ]]; then
  log "Reloading nginx"
  nginx -t && nginx -s reload
fi

# -------- Cleanup old releases --------
log "Cleaning up old releases (keep ${KEEP_RELEASES})"
mapfile -t old_releases < <(find "${RELEASES_DIR}" -mindepth 1 -maxdepth 1 -type d | sort -r)
current_target="$(readlink -f "${CURRENT_LINK}" 2>/dev/null || true)"
idx=0
for dir in "${old_releases[@]}"; do
  idx=$((idx + 1))
  if [[ "${idx}" -le "${KEEP_RELEASES}" ]]; then continue; fi
  # 当前指向的 release 目录不能删（current 链接里的 frontend 子目录的父目录是 release_dir）
  case "${current_target}" in
    "${dir}"/*) continue ;;
  esac
  log "Removing old release ${dir}"
  rm -rf "${dir}"
done

# 旧包清理
mapfile -t old_pkgs < <(find "${PACKAGES_DIR}" -maxdepth 1 -type f \
  \( -name "${APP_NAME}-*.tar.gz" -o -name "${APP_NAME}-*.tar.gz.sha256" \) \
  -printf '%T@ %p\n' | sort -rn | awk '{print $2}')
idx=0
for f in "${old_pkgs[@]}"; do
  idx=$((idx + 1))
  if [[ "${idx}" -le $((KEEP_RELEASES * 2)) ]]; then continue; fi
  log "Removing old package ${f}"
  rm -f "${f}"
done

echo "${target_tag}" > "${LAST_TAG_FILE}"
log "Frontend deploy of ${target_tag} finished"
