#!/usr/bin/env node
const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');
const axios = require('axios');
const FormData = require('form-data');
const { input, select, confirm } = require('@inquirer/prompts');

const API_BASE_URL = 'https://dev.3rddigital.com/appupdate-api/api/';

/**
 * Run a shell command synchronously.
 */
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

/**
 * Upload bundle file to server.
 */
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

/**
 * Build Android JS bundle and zip it.
 */
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

/**
 * Build iOS JS bundle and zip it.
 */
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

/**
 * Automatically detect app version from native files.
 */
function getAppVersion(platform) {
  try {
    // Find the actual React Native project root (two levels up from node_modules)
    let projectRoot = path.resolve(__dirname);
    while (
      projectRoot.includes('node_modules') &&
      !fs.existsSync(path.join(projectRoot, 'package.json'))
    ) {
      projectRoot = path.resolve(projectRoot, '..');
    }

    // Once we exit node_modules, ensure we’re at the React Native app root
    if (projectRoot.includes('node_modules')) {
      projectRoot = path.resolve(projectRoot, '../../');
    }

    if (platform === 'android') {
      const gradlePath = path.join(
        projectRoot,
        'android',
        'app',
        'build.gradle'
      );
      if (!fs.existsSync(gradlePath)) {
        console.warn(`⚠️ Android build.gradle not found at ${gradlePath}`);
        return null;
      }
      const gradleContent = fs.readFileSync(gradlePath, 'utf8');
      const match = gradleContent.match(/versionName\s+"([\d.]+)"/);
      if (match && match[1]) {
        return match[1];
      } else {
        console.warn('⚠️ Could not find versionName in build.gradle.');
      }
    } else if (platform === 'ios') {
      const iosDir = path.join(projectRoot, 'ios');
      if (!fs.existsSync(iosDir)) {
        console.warn(`⚠️ iOS folder not found at ${iosDir}`);
        return null;
      }

      const projectDir = fs
        .readdirSync(iosDir)
        .find((d) => d.endsWith('.xcodeproj'));

      if (!projectDir) {
        console.warn('⚠️ .xcodeproj not found inside ios directory.');
        return null;
      }

      const pbxprojPath = path.join(iosDir, projectDir, 'project.pbxproj');
      if (!fs.existsSync(pbxprojPath)) {
        console.warn('⚠️ project.pbxproj not found.');
        return null;
      }

      const pbxprojContent = fs.readFileSync(pbxprojPath, 'utf8');
      const match = pbxprojContent.match(/MARKETING_VERSION\s*=\s*([\d.]+);/);

      if (match && match[1]) {
        return match[1];
      } else {
        console.warn('⚠️ Could not find MARKETING_VERSION in project.pbxproj.');
      }
    }
  } catch (err) {
    console.warn(`⚠️ Failed to read ${platform} version:`, err.message);
  }

  return null;
}

/**
 * Get common configuration (API token, project ID, env).
 */
async function getCommonConfig() {
  console.log(`\n⚙️  Enter common configuration (applies to both platforms)\n`);

  const API_TOKEN = await input({
    message: `Enter API Token:`,
    validate: (val) => (val.trim() ? true : 'API Token is required'),
  });

  const PROJECT_ID = await input({
    message: `Enter Project ID:`,
    validate: (val) => (val.trim() ? true : 'Project ID is required'),
  });

  const ENVIRONMENT = await select({
    message: `Select Environment:`,
    choices: [
      { name: 'development', value: 'development' },
      { name: 'production', value: 'production' },
    ],
  });

  return { API_TOKEN, PROJECT_ID, ENVIRONMENT };
}

/**
 * Get platform-specific configuration with version auto-detection.
 */
async function getPlatformSpecificConfig(platform) {
  console.log(`\n🔧 Configuring ${platform.toUpperCase()}...\n`);

  let detectedVersion = getAppVersion(platform);
  if (detectedVersion) {
    console.log(`📱 Detected ${platform} version: ${detectedVersion}`);
  } else {
    console.warn(`⚠️ Could not detect ${platform} version automatically.`);
    detectedVersion = await input({
      message: `(${platform}) Enter App Version (e.g. 1.0.0):`,
      validate: (val) => (val.trim() ? true : 'Version is required'),
    });
  }

  const FORCE_UPDATE = await confirm({
    message: `(${platform}) Force Update?`,
    default: false,
  });

  return { VERSION: detectedVersion, FORCE_UPDATE };
}

/**
 * Entry point
 */
(async () => {
  try {
    const platform = process.argv[2];
    if (!platform) {
      console.log('❌ Please specify a platform: android | ios | all');
      process.exit(1);
    }

    const commonConfig = await getCommonConfig();

    if (platform === 'android') {
      const androidExtra = await getPlatformSpecificConfig('android');
      const config = { ...commonConfig, ...androidExtra };
      const androidFile = buildAndroid();
      await uploadBundle({
        filePath: androidFile,
        platform: 'android',
        config,
      });
    } else if (platform === 'ios') {
      const iosExtra = await getPlatformSpecificConfig('ios');
      const config = { ...commonConfig, ...iosExtra };
      const iosFile = buildIOS();
      await uploadBundle({ filePath: iosFile, platform: 'ios', config });
    } else if (platform === 'all') {
      const androidExtra = await getPlatformSpecificConfig('android');
      const androidFile = buildAndroid();
      await uploadBundle({
        filePath: androidFile,
        platform: 'android',
        config: { ...commonConfig, ...androidExtra },
      });

      const iosExtra = await getPlatformSpecificConfig('ios');
      const iosFile = buildIOS();
      await uploadBundle({
        filePath: iosFile,
        platform: 'ios',
        config: { ...commonConfig, ...iosExtra },
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
