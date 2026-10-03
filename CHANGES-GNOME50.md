# GNOME 50 port

This fork is targeted at GNOME Shell 50.

The code uses the ES module APIs introduced in GNOME 45. The official GNOME 50 porting guide reports no additional changes required in `metadata.json`, `extension.js`, or `prefs.js` for GNOME 50.

The installer was also fixed so that the contents of `src/` are copied directly into the extension directory; this avoids creating an unwanted nested `src/` directory.
