/*
 * Shared helper functions for Wallpaper Switcher.
 * This module intentionally contains no GNOME Shell UI imports so it can be
 * loaded both by extension.js and by prefs.js.
 */

import Gio from 'gi://Gio';
import GLib from 'gi://GLib';

const homeDir = GLib.get_home_dir();
let settings = null;

export function setSettings(newSettings) {
    settings = newSettings;
}

function getSettings() {
    if (!settings)
        throw new Error('Wallpaper Switcher settings are not initialized');
    return settings;
}

export function getCurrentColorScheme() {
    const colorSchemeSettings = new Gio.Settings({
        schema: 'org.gnome.desktop.interface',
    });
    return colorSchemeSettings.get_enum('color-scheme') === 1 ? 1 : 0;
}

export function getCurrentWallpaperUri() {
    const backgroundSettings = new Gio.Settings({
        schema: 'org.gnome.desktop.background',
    });

    const key = getCurrentColorScheme() === 1 ? 'picture-uri-dark' : 'picture-uri';
    const uri = backgroundSettings.get_string(key);

    if (uri.startsWith('file://'))
        return decodeURI(uri.slice(7));

    return decodeURI(uri);
}

function modifyExternalSetting(schemaId, settingId, settingValue) {
    const setting = new Gio.Settings({schema: schemaId});

    if (!setting.is_writable(settingId)) {
        saveExceptionLog(`${schemaId}.${settingId} unwritable`);
        return [settingId + ' unwritable\n', 0];
    }

    try {
        setting.set_string(settingId, settingValue);
        Gio.Settings.sync();
        return [settingId + ' set \n', 1];
    } catch (e) {
        saveExceptionLog(e);
        return [settingId + ' unmodifiable\n', 0];
    }
}

export function getOtherExtensionSettings(schema, otherExtension) {
    if (!otherExtension)
        throw new Error('An extension instance is required');

    const extensionSchema = schema || otherExtension.metadata?.['settings-schema'];
    if (!extensionSchema)
        throw new Error(`No settings schema declared for ${otherExtension.uuid}`);

    const schemaDir = otherExtension.dir.get_child('schemas');
    let schemaSource;

    if (schemaDir.query_exists(null)) {
        const source = Gio.SettingsSchemaSource.get_default();
        schemaSource = Gio.SettingsSchemaSource.new_from_directory(
            schemaDir.get_path(),
            source,
            false
        );
    } else {
        schemaSource = Gio.SettingsSchemaSource.get_default();
    }

    const schemaObject = schemaSource.lookup(extensionSchema, true);
    if (!schemaObject)
        throw new Error(`Schema ${extensionSchema} could not be found`);

    return new Gio.Settings({settings_schema: schemaObject});
}

export function getWallpaperWithOverlaySetterFunction(wallpaperOverlaySettings) {
    return path => wallpaperOverlaySettings.set_string('picture-uri', path);
}

export function getWallpaperSetterFunction() {
    return path => {
        const file = Gio.File.new_for_path(path);
        if (!file.query_exists(null))
            return;

        const uri = file.get_uri();
        const key = getCurrentColorScheme() === 1 ? 'picture-uri-dark' : 'picture-uri';
        modifyExternalSetting('org.gnome.desktop.background', key, uri);
    };
}

export function saveExceptionLog(error) {
    try {
        const logSize = 8000;
        const logFile = Gio.File.new_for_path(
            GLib.build_filenamev([homeDir, '.local', 'var', 'log', 'WallpaperSwitcher.log'])
        );

        const parent = logFile.get_parent();
        if (parent)
            parent.make_directory_with_parents(null);

        try {
            logFile.create(Gio.FileCreateFlags.NONE, null).close(null);
        } catch (_) {
            // File already exists.
        }

        let fileSize = 0;
        try {
            fileSize = logFile.query_info(
                'standard::size',
                Gio.FileQueryInfoFlags.NONE,
                null
            ).get_size();
        } catch (_) {
            // Ignore logging failures below.
        }

        if (fileSize > logSize) {
            try {
                logFile.replace(null, false, Gio.FileCreateFlags.NONE, null).close(null);
            } catch (_) {
                // Ignore logging failures below.
            }
        }

        const date = new Date();
        const timestamp = [
            String(date.getDate()).padStart(2, '0'), '/',
            String(date.getMonth() + 1).padStart(2, '0'), '/',
            String(date.getFullYear()).padStart(4, '0'), '-',
            String(date.getHours()).padStart(2, '0'), ':',
            String(date.getMinutes()).padStart(2, '0'), ':',
            String(date.getSeconds()).padStart(2, '0'), '~ ',
            String(error), '\n',
        ].join('');

        const output = logFile.append_to(Gio.FileCreateFlags.NONE, null);
        output.write_all(timestamp, null);
        output.close(null);
    } catch (loggingError) {
        console.error(`WallpaperSwitcher: Logger Error: ${loggingError}`);
    }
}

export function getWallpaperList(wallpaperFolderPath = getWallpaperPath()) {
    try {
        const folder = Gio.File.new_for_path(wallpaperFolderPath);
        const enumerator = folder.enumerate_children(
            'standard::name,standard::type,standard::is-hidden',
            Gio.FileQueryInfoFlags.NOFOLLOW_SYMLINKS,
            null
        );

        const wallpaperPaths = [];
        let childInfo;

        while ((childInfo = enumerator.next_file(null)) !== null) {
            if (childInfo.get_file_type() !== Gio.FileType.REGULAR)
                continue;
            if (childInfo.get_is_hidden())
                continue;

            const ext = childInfo.get_name().split('.').pop().toLowerCase();
            if (!['png', 'jpg', 'jpeg'].includes(ext))
                continue;

            wallpaperPaths.push(
                folder.get_child(childInfo.get_name()).get_path()
            );
        }

        enumerator.close(null);

        if (wallpaperPaths.length === 0)
            setErrorMsg(`NIF:--\n${wallpaperFolderPath}`);

        return wallpaperPaths;
    } catch (e) {
        setErrorMsg(`PNE:--\n${wallpaperFolderPath}`);
        return [];
    }
}

export function getFrequency() {
    return getSettings().get_int('frequency');
}

export function getWallpaperPath() {
    return getSettings().get_string('wallpaper-path');
}

export function getSwitchingMode() {
    return getSettings().get_int('switching-mode');
}

export function setFrequency(value) {
    return getSettings().set_int('frequency', value);
}

export function setWallpaperPath(value) {
    if (value.startsWith('~'))
        value = homeDir + value.slice(1);
    return getSettings().set_string('wallpaper-path', value);
}

export function setSwitchingMode(value) {
    return getSettings().set_int('switching-mode', value);
}

export function getErrorMsg() {
    return getSettings().get_string('error-msg');
}

export function setErrorMsg(value) {
    const dropErrorLog = ['UWO', ''];
    if (!dropErrorLog.includes(value))
        saveExceptionLog(`DisplayLog: ${String(value)}`);

    return getSettings().set_string('error-msg', String(value));
}
