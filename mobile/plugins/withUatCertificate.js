const fs = require('fs');
const path = require('path');
const { withAndroidManifest, withDangerousMod } = require('@expo/config-plugins');

module.exports = function withUatCertificate(config) {
  config = withAndroidManifest(config, config => {
    config.modResults.manifest.application[0].$['android:networkSecurityConfig'] = '@xml/uat_network_security_config';
    return config;
  });
  return withDangerousMod(config, ['android', config => {
    const resources = path.join(config.modRequest.platformProjectRoot, 'app/src/main/res');
    fs.mkdirSync(path.join(resources, 'raw'), { recursive: true });
    fs.mkdirSync(path.join(resources, 'xml'), { recursive: true });
    fs.copyFileSync(path.join(__dirname, '../certs/uat-server.pem'), path.join(resources, 'raw/uat_server.crt'));
    fs.writeFileSync(path.join(resources, 'xml/uat_network_security_config.xml'), `<?xml version="1.0" encoding="utf-8"?>
<network-security-config>
  <domain-config>
    <domain includeSubdomains="false">172.17.121.200</domain>
    <trust-anchors>
      <certificates src="@raw/uat_server" />
    </trust-anchors>
  </domain-config>
</network-security-config>\n`);
    return config;
  }]);
};
