const fs = require('fs');
const path = require('path');
const appJsonPath = path.join(__dirname, '..', 'app.json');
const appJson = JSON.parse(fs.readFileSync(appJsonPath, 'utf8'));
delete appJson.expo.runtimeVersion;
appJson.expo.updates = { enabled: false, checkAutomatically: 'NEVER' };
fs.writeFileSync(appJsonPath, JSON.stringify(appJson, null, 2));
console.log('✅ app.json fixed - expo-updates disabled, runtimeVersion removed');
