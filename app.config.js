const appJson = require('./app.json');
const config = appJson.expo;

if (process.env.APP_VARIANT === 'development') {
  config.name = 'iReader Dev';
  config.android.package = 'com.tushar.ireaderpro2.dev';
}

module.exports = { expo: config };
