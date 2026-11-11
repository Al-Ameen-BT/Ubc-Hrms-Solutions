const fs = require('node:fs');
const path = require('node:path');

module.exports = ({ config }) => {
  const generatedIcon = './assets/generated/platform-icon.png';
  const icon = fs.existsSync(path.join(__dirname, generatedIcon)) ? generatedIcon : './assets/splash-icon.png';
  config.name = 'UCB-HRMS';
  config.icon = icon;
  config.android = { ...config.android, adaptiveIcon: { ...config.android?.adaptiveIcon, foregroundImage: icon } };
  config.web = { ...config.web, favicon: icon };
  config.plugins = (config.plugins || []).map(plugin => {
    if (!Array.isArray(plugin) || plugin[0] !== 'expo-splash-screen') return plugin;
    return [plugin[0], { ...plugin[1], image: icon }];
  });
  if (process.env.EXPO_PUBLIC_API_BASE_URL === 'https://172.17.121.200:8443') {
    config.version = require('./package.json').version;
    config.plugins = [...(config.plugins || []), './plugins/withUatCertificate'];
  }
  return config;
};
