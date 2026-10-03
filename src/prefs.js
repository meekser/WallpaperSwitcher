/*
 * Preferences for Wallpaper Switcher, using GNOME Shell 45+ ESM APIs.
 */

import Gdk from 'gi://Gdk';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Gtk from 'gi://Gtk';

import {
    ExtensionPreferences,
} from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

import * as lib from './lib.js';

export default class WallpaperSwitcherPreferences extends ExtensionPreferences {
    fillPreferencesWindow(window) {
        window.set_default_size(530, 400);

        const styleProvider = new Gtk.CssProvider();
        styleProvider.load_from_path(GLib.build_filenamev([
            this.path,
            'stylesheet.css',
        ]));
        Gtk.StyleContext.add_provider_for_display(
            Gdk.Display.get_default(),
            styleProvider,
            Gtk.STYLE_PROVIDER_PRIORITY_APPLICATION
        );

        const settings = this.getSettings();
        lib.setSettings(settings);

        const builder = Gtk.Builder.new();
        builder.add_from_file(GLib.build_filenamev([this.path, 'prefs.ui']));

        const frequencyChanger = builder.get_object('frequency-changer');
        const switchingModeComboRow = builder.get_object('switching-mode-comborow');
        const wallpaperPathRow = builder.get_object('wallpaper-path-row');
        const wallpaperPathEntry = builder.get_object('wallpaper-path-entry');
        const showCurrentButton = builder.get_object('show-current');
        const resetButton = builder.get_object('reset-button');
        const errorGroup = builder.get_object('error-group');
        const errorRow = builder.get_object('error-row');
        const errorView = builder.get_object('error-view');

        window.connectObject(
            'close-request', () => lib.setSettings(null),
            window
        );

        const dropErrors = ['WC', 'NIF', 'PNE', 'Reset'];
        if (dropErrors.includes(lib.getErrorMsg().split(':--')[0]))
            lib.setErrorMsg('');

        settings.bind(
            'frequency',
            frequencyChanger,
            'value',
            Gio.SettingsBindFlags.DEFAULT
        );

        switchingModeComboRow.connectObject(
            'notify::selected-item', () => {
                lib.setSwitchingMode(switchingModeComboRow.selected);
            },
            window
        );
        switchingModeComboRow.selected = lib.getSwitchingMode();

        let validationToken = 0;
        const updatePathEntry = async () => {
            const path = wallpaperPathEntry.text.trim();
            const token = ++validationToken;

            if (!path) {
                wallpaperPathEntry.primary_icon_name = 'mail-mark-junk-symbolic';
                return;
            }

            const wallpapers = await lib.getWallpaperList(path);
            if (token !== validationToken)
                return;

            if (wallpapers.length > 0) {
                wallpaperPathEntry.primary_icon_name = 'go-next-symbolic';
                wallpaperPathRow.subtitle = path;
                wallpaperPathRow.expanded = false;
                lib.setWallpaperPath(path);
                lib.setErrorMsg(`WC:--${wallpapers.length}`);
            } else {
                wallpaperPathEntry.primary_icon_name = 'mail-mark-junk-symbolic';
            }
        };

        wallpaperPathRow.subtitle = lib.getWallpaperPath();
        wallpaperPathEntry.text = lib.getWallpaperPath();
        wallpaperPathEntry.primary_icon_name = 'go-next-symbolic';

        wallpaperPathEntry.connectObject(
            'activate', () => void updatePathEntry(),
            'icon-release', () => void updatePathEntry(),
            window
        );

        showCurrentButton.connectObject(
            'clicked', () => {
                const wallpaper = lib.getCurrentWallpaperUri();
                if (!wallpaper)
                    return;

                const command = `nautilus -s ${GLib.shell_quote(wallpaper)}`;
                GLib.spawn_command_line_async(command);
            },
            window
        );

        resetButton.connectObject(
            'clicked', () => {
                lib.setFrequency(300);
                lib.setWallpaperPath('/usr/share/backgrounds');
                switchingModeComboRow.selected = 1;
                lib.setErrorMsg('Reset');
            },
            window
        );

        const showSimpleError = (iconName, title) => {
            const actionRow = errorRow.get_first_child()?.get_first_child()?.get_first_child();
            const suffix = actionRow?.get_first_child()?.get_last_child();

            errorGroup.visible = true;
            errorRow.enable_expansion = false;
            errorRow.expanded = false;
            if (actionRow)
                actionRow.activatable = false;
            if (suffix)
                suffix.visible = false;
            errorRow.title = title;
            errorRow.icon_name = iconName;
        };

        const showComplexError = (iconName, title, description) => {
            const actionRow = errorRow.get_first_child()?.get_first_child()?.get_first_child();
            const suffix = actionRow?.get_first_child()?.get_last_child();

            errorGroup.visible = true;
            errorRow.enable_expansion = true;
            errorRow.expanded = false;
            if (actionRow)
                actionRow.activatable = true;
            if (suffix)
                suffix.visible = true;
            errorRow.title = title;
            errorRow.icon_name = iconName;
            errorView.label = description;
        };

        const updateErrorShowStatus = () => {
            const errMsgs = lib.getErrorMsg().split(':--');
            const type = errMsgs[0] ?? '';
            const value = errMsgs[1] ?? '';

            switch (type) {
                case '':
                    showSimpleError(
                        'face-smile-symbolic',
                        'Thanks for using Wallpaper Switcher'
                    );
                    break;
                case 'UWO':
                    showSimpleError(
                        'face-smile-symbolic',
                        'Thanks for using Wallpaper Switcher and Wallpaper Overlay'
                    );
                    break;
                case 'WC':
                    showSimpleError(
                        'emblem-default-symbolic',
                        `${value} Wallpapers Collected`
                    );
                    break;
                case 'NIF':
                    showComplexError(
                        'dialog-warning-symbolic',
                        'No images found',
                        `No images found on ${value}`
                    );
                    break;
                case 'PNE':
                    showComplexError(
                        'dialog-error-symbolic',
                        'Path Does not Exist',
                        `The path ${value} does not exist.`
                    );
                    break;
                case 'Reset':
                    showSimpleError(
                        'emblem-default-symbolic',
                        'Settings have been reset'
                    );
                    break;
                default:
                    showComplexError(
                        'dialog-error-symbolic',
                        'Some Error Occurred',
                        String(errMsgs)
                    );
                    break;
            }
        };

        updateErrorShowStatus();
        settings.connectObject(
            'changed::error-msg', updateErrorShowStatus,
            window
        );

        window.add(builder.get_object('prefs-page'));
    }
}
