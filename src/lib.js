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

export function getOtherExtensionSettings(schema, otherExtension) {
    if (!otherExtension)
        throw new Error('An extension instance is required');

    return otherExtension.getSettings(schema);
}

export function getWallpaperWithOverlaySetterFunction(wallpaperOverlaySettings) {
    return path => wallpaperOverlaySettings.set_string('picture-uri', path);
}

export function getWallpaperSetterFunction() {
    const backgroundSettings = new Gio.Settings({
        schema: 'org.gnome.desktop.background',
    });

    return path => {
        const key = getCurrentColorScheme() === 1 ? 'picture-uri-dark' : 'picture-uri';
        backgroundSettings.set_string(key, Gio.File.new_for_path(path).get_uri());
    };
}

export async function getWallpaperList(
    wallpaperFolderPath = getWallpaperPath(),
    cancellable = null
) {
    const folder = Gio.File.new_for_path(wallpaperFolderPath);
    let enumerator = null;

    try {
        enumerator = await folder.enumerate_children_async(
            'standard::name,standard::type,standard::is-hidden',
            Gio.FileQueryInfoFlags.NOFOLLOW_SYMLINKS,
            GLib.PRIORITY_DEFAULT,
            cancellable
        );

        const wallpaperPaths = [];

        while (true) {
            const fileInfos = await enumerator.next_files_async(
                50,
                GLib.PRIORITY_DEFAULT,
                cancellable
            );

            if (fileInfos.length === 0)
                break;

            for (const childInfo of fileInfos) {
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
        }

        if (wallpaperPaths.length === 0 && !cancellable?.is_cancelled())
            setErrorMsg(`NIF:--\n${wallpaperFolderPath}`);

        return wallpaperPaths;
    } catch (e) {
        if (!cancellable?.is_cancelled())
            setErrorMsg(`PNE:--\n${wallpaperFolderPath}`);

        return [];
    } finally {
        if (enumerator)
            await enumerator.close_async(GLib.PRIORITY_DEFAULT, null);
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
    return getSettings().set_string('error-msg', String(value));
}
