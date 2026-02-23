#!/usr/bin/env node
require('dotenv').config();
const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');
const axios = require('axios');
const { input, select, confirm } = require('@inquirer/prompts');
const { PutObjectCommand, S3Client } = require('@aws-sdk/client-s3');
const { v4: uuidv4 } = require('uuid');

const APPUPDATE_BASE_URL = process.env.APPUPDATE_BASE_URL;
const APPUPDATE_AWS_REGION = process.env.APPUPDATE_AWS_REGION;
const APPUPDATE_AWS_ACCESS_KEY_ID = process.env.APPUPDATE_AWS_ACCESS_KEY_ID;
const APPUPDATE_AWS_SECRET_ACCESS_KEY =
  process.env.APPUPDATE_AWS_SECRET_ACCESS_KEY;
const APPUPDATE_AWS_BUCKET_NAME = process.env.APPUPDATE_AWS_BUCKET_NAME;

/**
 * Decrypt helper logic
 */
function DecriptEnv(wrappedKey) {
  if (!wrappedKey) return '';
  if (typeof wrappedKey !== 'string')
    throw new TypeError('wrappedKey must be a string');
  if (wrappedKey.length <= 8) throw new Error('wrappedKey too short to unwrap');
  const trimmed = wrappedKey.slice(4, -2);
  const result = trimmed.slice(0, 2) + trimmed.slice(4);
  return result;
}

const s3Client = new S3Client({
  region: DecriptEnv(APPUPDATE_AWS_REGION),
  credentials: {
    accessKeyId: DecriptEnv(APPUPDATE_AWS_ACCESS_KEY_ID),
    secretAccessKey: DecriptEnv(APPUPDATE_AWS_SECRET_ACCESS_KEY),
  },
});

/**
 * Uploads local file to S3
 */
async function uploadFileToS3(filePath, bucketName, folder) {
  const fileName = path.basename(filePath);
  const cleanFileName = fileName.replace(/\s+/g, '_');
  const uniqueId = uuidv4();
  const fileKey = `${folder}/${uniqueId}/${cleanFileName}`;
  const fileBuffer = fs.readFileSync(filePath);

  try {
    const command = new PutObjectCommand({
      Bucket: bucketName,
      Key: fileKey,
      Body: fileBuffer,
      ContentType: 'application/zip',
      ACL: 'public-read',
    });

    await s3Client.send(command);

    const region = DecriptEnv(APPUPDATE_AWS_REGION);
    const location = `https://${bucketName}.s3.${region}.amazonaws.com/${fileKey}`;

    return { Location: location, Key: fileKey, Bucket: bucketName };
  } catch (error) {
    console.error('❌ S3 Upload Error:', error);
    throw error;
  }
}

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
 * Step 1: Upload to S3
 * Step 2: Register with Backend
 */
async function uploadBundle({ filePath, platform, config }) {
  console.log(`📤 Starting upload process for ${platform}...`);

  if (!fs.existsSync(filePath)) {
    console.error(`❌ File not found: ${filePath}`);
    process.exit(1);
  }

  try {
    // 1. Upload to S3
    const s3Result = await uploadFileToS3(
      filePath,
      DecriptEnv(APPUPDATE_AWS_BUCKET_NAME),
      config.ENVIRONMENT === 'development'
        ? 'uploads/development'
        : 'uploads/production'
    );

    console.log(`✅ S3 Upload Complete: ${s3Result.Key}`);

    // 2. Prepare Payload for Backend
    const stats = fs.statSync(filePath);
    const payload = {
      projectId: config.PROJECT_ID,
      environment: config.ENVIRONMENT,
      platform: platform,
      version: config.VERSION,
      forceUpdate: config.FORCE_UPDATE,
      s3Key: s3Result.Key,
      s3Url: s3Result.Location,
      fileName: path.basename(filePath),
      fileSize: stats.size,
    };

    const res = await axios.post(`${APPUPDATE_BASE_URL}/bundles`, payload, {
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${config.API_TOKEN}`,
      },
    });

    console.log(
      `✅ ${platform} bundle registered! Response:`,
      JSON.stringify(res.data, null, 2)
    );
  } catch (err) {
    console.error(`❌ ${platform} bundle upload/registration failed!`);
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
