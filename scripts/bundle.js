#!/usr/bin/env node
const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');
const axios = require('axios');
const FormData = require('form-data');
const { input, select, confirm } = require('@inquirer/prompts');

const API_BASE_URL = 'https://dev.3rddigital.com/appupdate-api/api/';

function run(command) {
  try {
    console.log(`\n➡️ Running: ${command}\n`);
    execSync(command, { stdio: 'inherit' });
  } catch (err) {
    console.error(`❌ Command failed: ${command}`);
    console.error(err.message);
    process.exit(1);
  }
}

async function uploadBundle({ filePath, platform, config }) {
  console.log(`📤 Uploading ${platform} bundle to server...`);

  if (!fs.existsSync(filePath)) {
    console.error(`❌ File not found: ${filePath}`);
    process.exit(1);
  }

  const fileStream = fs.createReadStream(filePath);
  const form = new FormData();
  form.append('bundle', fileStream);
  form.append('projectId', config.PROJECT_ID);
  form.append('environment', config.ENVIRONMENT);
  form.append('platform', platform);
  form.append('version', config.VERSION);
  form.append('buildNumber', String(config.BUILD_NUMBER));
  form.append('forceUpdate', String(config.FORCE_UPDATE));

  try {
    const res = await axios.post(`${API_BASE_URL}/bundles`, form, {
      headers: {
        ...form.getHeaders(),
        Authorization: `Bearer ${config.API_TOKEN}`,
      },
    });
    console.log(
      `✅ ${platform} bundle uploaded successfully! Response:`,
      JSON.stringify(res.data, null, 2)
    );
  } catch (err) {
    console.error(`❌ ${platform} bundle upload failed!`);
    if (err.response) {
      console.error('Status:', err.response.status);
      console.error('Data:', err.response.data);
    } else {
      console.error('Message:', err.message);
    }
    process.exit(1);
  }
}

function buildAndroid() {
  console.log('📦 Building Android bundle...');
  const outputPath = path.join('android', 'index.android.bundle.zip');
  run(
    `mkdir -p android/output && ` +
      `react-native bundle --platform android --dev false --entry-file index.js ` +
      `--bundle-output android/output/index.android.bundle --assets-dest android/output ` +
      `--sourcemap-output android/sourcemap.js && ` +
      `cd android && find output -type f | zip index.android.bundle.zip -@ && ` +
      `zip sourcemap.zip sourcemap.js && cd .. && rm -rf android/output && rm -rf android/sourcemap.js`
  );
  console.log(`✅ Android bundle created at ${outputPath}`);
  return outputPath;
}

function buildIOS() {
  console.log('📦 Building iOS bundle...');
  const outputPath = path.join('ios', 'main.jsbundle.zip');
  run(
    `mkdir -p ios/output && ` +
      `react-native bundle --platform ios --dev false --entry-file index.js ` +
      `--bundle-output ios/output/main.jsbundle --assets-dest ios/output ` +
      `--sourcemap-output ios/sourcemap.js && ` +
      `cd ios && find output -type f | zip main.jsbundle.zip -@ && ` +
      `zip sourcemap.zip sourcemap.js && cd .. && rm -rf ios/output && rm -rf ios/sourcemap.js`
  );
  console.log(`✅ iOS bundle created at ${outputPath}`);
  return outputPath;
}

async function getConfig(platform) {
  console.log(`\n⚙️  Enter configuration for ${platform.toUpperCase()}\n`);

  const API_TOKEN = await input({
    message: `(${platform}) Enter API Token:`,
    validate: (val) => (val.trim() ? true : 'API Token is required'),
  });

  const PROJECT_ID = await input({
    message: `(${platform}) Enter Project ID:`,
    validate: (val) => (val.trim() ? true : 'Project ID is required'),
  });

  const ENVIRONMENT = await select({
    message: `(${platform}) Select Environment:`,
    choices: [
      { name: 'development', value: 'development' },
      { name: 'production', value: 'production' },
    ],
  });

  const VERSION = await input({
    message: `(${platform}) Enter App Version (e.g. 1.0.0):`,
    validate: (val) => (val.trim() ? true : 'Version is required'),
  });

  const BUILD_NUMBER = await input({
    message: `(${platform}) Enter Build Number:`,
    validate: (val) =>
      !isNaN(val) && val.trim() !== '' ? true : 'Must be a number',
  });

  const FORCE_UPDATE = await confirm({
    message: `(${platform}) Force Update?`,
    default: false,
  });

  return {
    API_TOKEN,
    PROJECT_ID,
    ENVIRONMENT,
    VERSION,
    BUILD_NUMBER,
    FORCE_UPDATE,
  };
}

(async () => {
  try {
    const platform = process.argv[2];
    if (!platform) {
      console.log('❌ Please specify a platform: android | ios | all');
      process.exit(1);
    }

    if (platform === 'android') {
      const config = await getConfig('android');
      const androidFile = buildAndroid();
      await uploadBundle({
        filePath: androidFile,
        platform: 'android',
        config,
      });
    } else if (platform === 'ios') {
      const config = await getConfig('ios');
      const iosFile = buildIOS();
      await uploadBundle({ filePath: iosFile, platform: 'ios', config });
    } else if (platform === 'all') {
      const androidConfig = await getConfig('android');
      const androidFile = buildAndroid();
      await uploadBundle({
        filePath: androidFile,
        platform: 'android',
        config: androidConfig,
      });

      const iosConfig = await getConfig('ios');
      const iosFile = buildIOS();
      await uploadBundle({
        filePath: iosFile,
        platform: 'ios',
        config: iosConfig,
      });
    } else {
      console.log('❌ Invalid option. Use: android | ios | all');
      process.exit(1);
    }

    console.log('\n🎉 All tasks completed successfully!\n');
  } catch (err) {
    console.error('❌ Fatal error:', err.message);
    process.exit(1);
  }
})();
