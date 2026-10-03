/*
 * Wallpaper Switcher
 * GNOME Shell 46, 48, and 50 port of the original extension.
 *
 * Original project: https://github.com/rishuinfinity/WallpaperSwitcher
 * Original author: Rishu Raj
 * Fork maintainer: meekser
 */

import GLib from 'gi://GLib';
import Gio from 'gi://Gio';
import St from 'gi://St';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as PanelMenu from 'resource:///org/gnome/shell/ui/panelMenu.js';
import {Extension} from 'resource:///org/gnome/shell/extensions/extension.js';

import * as lib from './lib.js';

const WALLPAPER_OVERLAY_UUID = 'WallpaperOverlay@Rishu';

export default class WallpaperSwitcherExtension extends Extension {
    enable() {
        this._settings = this.getSettings();
        lib.setSettings(this._settings);

        this._cancellable = new Gio.Cancellable();
        this._changingWallpaper = false;
        this._timeoutId = 0;
        this._imageIndex = -1;
        this._wallpaperOverlaySettings = null;

        this._indicator = new PanelMenu.Button(0.0, this.metadata.name, false);
        this._indicator.accessible_name = this.metadata.name;

        const icon = new St.Icon({
            icon_name: 'preferences-desktop-wallpaper-symbolic',
            style_class: 'system-status-icon',
        });
        this._indicator.add_child(icon);
        Main.panel.addToStatusArea(this.uuid, this._indicator);
        this._indicator.menu.addAction('Preferences', () => this.openPreferences());

        this._tooltip = new St.Label({
            style_class: 'dash-label',
            visible: false,
            text: this.metadata.name,
        });
        Main.uiGroup.add_child(this._tooltip);

        this._indicator.connectObject(
            'notify::hover', () => this._syncTooltip(),
            this
        );

        this._settings.connectObject(
            'changed::switching-mode', () => this._updateTimer(),
            'changed::frequency', () => this._updateTimer(),
            this
        );

        Main.extensionManager.connectObject(
            'extension-state-changed', () => this._updateTimer(true),
            this
        );

        this._updateWallpaperOverlayIntegration();
        this._updateTimer();
    }

    disable() {
        this._clearTimer();
        this._hideTooltip();

        this._cancellable?.cancel();

        this._indicator?.disconnectObject(this);
        this._settings?.disconnectObject(this);
        Main.extensionManager.disconnectObject(this);
        this._wallpaperOverlaySettings?.disconnectObject(this);

        this._tooltip?.destroy();
        this._indicator?.destroy();

        this._tooltip = null;
        this._indicator = null;
        this._settings = null;
        this._cancellable = null;
        this._changingWallpaper = false;
        this._imageIndex = -1;
        this._wallpaperOverlaySettings = null;

        lib.setSettings(null);
    }

    _hideTooltip() {
        if (this._tooltipTimeoutId) {
            GLib.Source.remove(this._tooltipTimeoutId);
            this._tooltipTimeoutId = 0;
        }

        if (this._tooltip)
            this._tooltip.hide();
    }

    _syncTooltip() {
        if (!this._indicator?.hover) {
            this._hideTooltip();
            return;
        }

        if (this._tooltipTimeoutId)
            return;

        this._tooltipTimeoutId = GLib.timeout_add(
            GLib.PRIORITY_DEFAULT,
            500,
            () => {
                this._tooltipTimeoutId = 0;

                if (!this._indicator?.hover || !this._tooltip)
                    return GLib.SOURCE_REMOVE;

                this._tooltip.text = this.metadata.name;
                this._tooltip.show();

                const [stageX, stageY] = this._indicator.get_transformed_position();
                const indicatorWidth = this._indicator.width;
                const tooltipWidth = this._tooltip.width;
                const monitor = Main.layoutManager.findMonitorForActor(this._indicator);
                const x = Math.min(
                    Math.max(
                        stageX + Math.floor((indicatorWidth - tooltipWidth) / 2),
                        monitor.x
                    ),
                    monitor.x + monitor.width - tooltipWidth
                );
                const y = stageY + this._indicator.height + 6;

                this._tooltip.set_position(Math.floor(x), Math.floor(y));

                return GLib.SOURCE_REMOVE;
            }
        );
    }

    _clearTimer() {
        if (this._timeoutId) {
            GLib.Source.remove(this._timeoutId);
            this._timeoutId = 0;
        }
    }

    _getWallpaperOverlaySettings() {
        try {
            const extension = Main.extensionManager.lookup(WALLPAPER_OVERLAY_UUID);
            if (!extension || extension.state !== 1)
                return null;

            return lib.getOtherExtensionSettings(
                'org.gnome.shell.extensions.WallpaperOverlay',
                extension
            );
        } catch (_) {
            return null;
        }
    }

    _updateWallpaperOverlayIntegration() {
        const newSettings = this._getWallpaperOverlaySettings();

        if (this._wallpaperOverlaySettings === newSettings)
            return;

        this._wallpaperOverlaySettings?.disconnectObject(this);
        this._wallpaperOverlaySettings = newSettings;

        if (this._wallpaperOverlaySettings) {
            this._wallpaperOverlaySettings.connectObject(
                'changed::is-auto-apply', () => this._updateTimer(true),
                this
            );
        }
    }

    _getWallpaperSetter() {
        if (this._wallpaperOverlaySettings?.get_boolean('is-auto-apply')) {
            lib.setErrorMsg('UWO');
            return lib.getWallpaperWithOverlaySetterFunction(
                this._wallpaperOverlaySettings
            );
        }

        return lib.getWallpaperSetterFunction();
    }

    _changeWallpaper() {
        if (this._changingWallpaper || !this._cancellable)
            return;

        const cancellable = this._cancellable;
        this._changingWallpaper = true;
        void this._changeWallpaperAsync(cancellable);
    }

    async _changeWallpaperAsync(cancellable) {
        try {
            const wallpapers = await lib.getWallpaperList(undefined, cancellable);
            if (cancellable.is_cancelled() || this._cancellable !== cancellable)
                return;

            if (wallpapers.length === 0)
                return;

            let index;
            if (lib.getSwitchingMode() === 1) {
                index = Math.floor(Math.random() * wallpapers.length);
            } else {
                this._imageIndex = (this._imageIndex + 1) % wallpapers.length;
                index = this._imageIndex;
            }

            this._getWallpaperSetter()(wallpapers[index]);
        } catch (e) {
            if (!cancellable.is_cancelled())
                console.error(`Wallpaper Switcher: failed to change wallpaper: ${e}`);
        } finally {
            if (this._cancellable === cancellable)
                this._changingWallpaper = false;
        }
    }

    _updateTimer(checkWallpaperOverlay = false) {
        this._clearTimer();

        if (checkWallpaperOverlay)
            this._updateWallpaperOverlayIntegration();

        const frequency = Math.max(3, lib.getFrequency());
        this._timeoutId = GLib.timeout_add_seconds(
            GLib.PRIORITY_DEFAULT,
            frequency,
            () => {
                this._changeWallpaper();
                return GLib.SOURCE_CONTINUE;
            }
        );
    }
}
