// Expo config plugin: add smallestScreenSize|density to MainActivity's
// android:configChanges so foldable fold/unfold does NOT recreate the Activity.
// Without this, React state is destroyed on every fold and our AsyncStorage
// restore races, causing apparent feed refresh + zombie deep-dive.
const { withAndroidManifest } = require('@expo/config-plugins');

const REQUIRED = [
  'keyboard',
  'keyboardHidden',
  'orientation',
  'screenSize',
  'smallestScreenSize',
  'screenLayout',
  'uiMode',
  'density',
  'navigation',
  'fontScale',
  'layoutDirection',
  'locale',
];

module.exports = function withFoldableConfigChanges(config) {
  return withAndroidManifest(config, (cfg) => {
    const app = cfg.modResults.manifest.application?.[0];
    if (!app) return cfg;
    const activities = app.activity ?? [];
    for (const act of activities) {
      const name = act.$?.['android:name'];
      if (name !== '.MainActivity' && name !== 'com.tushar.ireaderpro2.MainActivity') continue;
      const current = (act.$?.['android:configChanges'] ?? '').split('|').map((s) => s.trim()).filter(Boolean);
      const merged = Array.from(new Set([...current, ...REQUIRED])).join('|');
      act.$ = act.$ ?? {};
      act.$['android:configChanges'] = merged;
      // Foldables resize within the same Activity; resizeableActivity must be true.
      act.$['android:resizeableActivity'] = 'true';
    }
    return cfg;
  });
};
