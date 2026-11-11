module.exports = ({ config }) => {
  if (process.env.EXPO_PUBLIC_API_BASE_URL === 'https://172.17.121.200:8443') {
    config.version = require('./package.json').version;
    config.plugins = [...(config.plugins || []), './plugins/withUatCertificate'];
  }
  return config;
};
