#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" >/dev/null 2>&1 && pwd)"
EXT_UUID="WallpaperSwitcher@meekser"
SRC_DIR="${SCRIPT_DIR}/src"

if [[ "$(id -u)" -eq 0 ]]; then
    INSTALL_BASE="/usr/share/gnome-shell/extensions"
else
    INSTALL_BASE="${HOME}/.local/share/gnome-shell/extensions"
fi
INSTALL_DIR="${INSTALL_BASE}/${EXT_UUID}"

if [[ ! -f "${SRC_DIR}/metadata.json" || ! -f "${SRC_DIR}/extension.js" ]]; then
    echo "[!] Source files not found in ${SRC_DIR}" >&2
    exit 1
fi

SHELL_VERSION="$(sed -n 's/.*\"shell-version\"[[:space:]]*:[[:space:]]*\[\"\([^\"]*\)\"\].*/\1/p' "${SRC_DIR}/metadata.json" | head -n1)"

echo "[+] Installing ${EXT_UUID} to ${INSTALL_DIR}"
rm -rf "${INSTALL_DIR}"
mkdir -p "${INSTALL_DIR}"

# Copy the CONTENTS of src/, not the src/ directory itself.
cp -a "${SRC_DIR}/." "${INSTALL_DIR}/"

if [[ -d "${INSTALL_DIR}/schemas" ]]; then
    glib-compile-schemas "${INSTALL_DIR}/schemas"
fi

# Basic structural validation before reporting success.
for required in extension.js metadata.json prefs.js lib.js; do
    if [[ ! -f "${INSTALL_DIR}/${required}" ]]; then
        echo "[!] Missing installed file: ${INSTALL_DIR}/${required}" >&2
        exit 1
    fi
done

if [[ ! -d "${INSTALL_DIR}/schemas" ]]; then
    echo "[!] Missing schemas directory: ${INSTALL_DIR}/schemas" >&2
    exit 1
fi

echo "[✔] Files installed"
if [[ -n "${SHELL_VERSION}" ]]; then
    echo "[✔] Target GNOME Shell: ${SHELL_VERSION}"
fi

echo
echo "IMPORTANT: GNOME Shell loads newly installed user extensions in the next session."
echo "Log out and log in again (or reboot) before enabling the extension."
echo
echo "After logging in again, verify with:"
echo "  gnome-extensions info ${EXT_UUID}"
echo
echo "Then enable with:"
echo "  gnome-extensions enable ${EXT_UUID}"
echo
echo "Preferences:"
echo "  gnome-extensions prefs ${EXT_UUID}"
echo
echo "Installed files:"
echo "  ${INSTALL_DIR}"
