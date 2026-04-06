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

function DecriptEnv(wrappedKey) {
  if (!wrappedKey) return '';
  if (typeof wrappedKey !== 'string')
    throw new TypeError('wrappedKey must be a string');
  if (wrappedKey.length <= 8) throw new Error('wrappedKey too short to unwrap');

  const trimmed = wrappedKey.slice(4, -2);
  return trimmed.slice(0, 2) + trimmed.slice(4);
}

const s3Client = new S3Client({
  region: DecriptEnv(APPUPDATE_AWS_REGION),
  credentials: {
    accessKeyId: DecriptEnv(APPUPDATE_AWS_ACCESS_KEY_ID),
    secretAccessKey: DecriptEnv(APPUPDATE_AWS_SECRET_ACCESS_KEY),
  },
});

function run(command, cwd = process.cwd()) {
  try {
    console.log(`\n➡️ Running: ${command}\n`);
    execSync(command, { stdio: 'inherit', cwd });
  } catch (err) {
    console.error(`❌ Command failed: ${command}`);
    console.error(err.message);
    process.exit(1);
  }
}

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

async function uploadBundle({ filePath, platform, config }) {
  console.log(`📤 Starting upload process for ${platform}...`);

  if (!fs.existsSync(filePath)) {
    console.error(`❌ File not found: ${filePath}`);
    process.exit(1);
  }

  try {
    const s3Result = await uploadFileToS3(
      filePath,
      DecriptEnv(APPUPDATE_AWS_BUCKET_NAME),
      config.ENVIRONMENT === 'development'
        ? 'uploads/development'
        : 'uploads/production'
    );

    console.log(`✅ S3 Upload Complete: ${s3Result.Key}`);

    const stats = fs.statSync(filePath);
    const payload = {
      projectId: config.PROJECT_ID,
      environment: config.ENVIRONMENT,
      platform,
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

function getProjectRoot() {
  const cwdPackageJson = path.join(process.cwd(), 'package.json');
  if (fs.existsSync(cwdPackageJson)) {
    return process.cwd();
  }

  let projectRoot = path.resolve(__dirname);
  while (
    projectRoot.includes('node_modules') &&
    !fs.existsSync(path.join(projectRoot, 'package.json'))
  ) {
    projectRoot = path.resolve(projectRoot, '..');
  }

  if (projectRoot.includes('node_modules')) {
    projectRoot = path.resolve(projectRoot, '../../');
  }

  return projectRoot;
}

function findFirstExistingPath(possiblePaths) {
  return possiblePaths.find((item) => fs.existsSync(item)) ?? null;
}

function findFirstXcodeProj(dir) {
  const files = fs.readdirSync(dir);

  for (const file of files) {
    const fullPath = path.join(dir, file);
    const stat = fs.statSync(fullPath);

    if (stat.isDirectory()) {
      if (file.endsWith('.xcodeproj')) return fullPath;
      const nested = findFirstXcodeProj(fullPath);
      if (nested) return nested;
    }
  }

  return null;
}

function extractBracedBlock(content, startIndex) {
  const openIndex = content.indexOf('{', startIndex);
  if (openIndex === -1) return null;

  let depth = 0;
  let inSingleQuote = false;
  let inDoubleQuote = false;
  let inTemplate = false;
  let inLineComment = false;
  let inBlockComment = false;

  for (let index = openIndex; index < content.length; index += 1) {
    const char = content[index];
    const nextChar = content[index + 1];
    const prevChar = content[index - 1];

    if (inLineComment) {
      if (char === '\n') inLineComment = false;
      continue;
    }

    if (inBlockComment) {
      if (prevChar === '*' && char === '/') inBlockComment = false;
      continue;
    }

    if (!inSingleQuote && !inDoubleQuote && !inTemplate) {
      if (char === '/' && nextChar === '/') {
        inLineComment = true;
        index += 1;
        continue;
      }

      if (char === '/' && nextChar === '*') {
        inBlockComment = true;
        index += 1;
        continue;
      }
    }

    if (!inDoubleQuote && !inTemplate && char === "'" && prevChar !== '\\') {
      inSingleQuote = !inSingleQuote;
      continue;
    }

    if (!inSingleQuote && !inTemplate && char === '"' && prevChar !== '\\') {
      inDoubleQuote = !inDoubleQuote;
      continue;
    }

    if (!inSingleQuote && !inDoubleQuote && char === '`' && prevChar !== '\\') {
      inTemplate = !inTemplate;
      continue;
    }

    if (inSingleQuote || inDoubleQuote || inTemplate) continue;

    if (char === '{') depth += 1;
    if (char === '}') {
      depth -= 1;
      if (depth === 0) {
        return {
          content: content.slice(openIndex + 1, index),
          start: openIndex,
          end: index,
        };
      }
    }
  }

  return null;
}

function extractNamedBlock(content, blockName) {
  const blockRegex = new RegExp(`\\b${blockName}\\b\\s*\\{`, 'm');
  const match = blockRegex.exec(content);
  if (!match) return null;
  return extractBracedBlock(content, match.index);
}

function parseTopLevelNamedBlocks(content) {
  const blocks = [];
  let cursor = 0;

  while (cursor < content.length) {
    const remainder = content.slice(cursor);
    const nameMatch = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*\{/.exec(remainder);

    if (!nameMatch) {
      cursor += 1;
      continue;
    }

    const nameIndex = cursor + nameMatch.index;
    const name = nameMatch[1];
    const block = extractBracedBlock(content, nameIndex);

    if (!block) break;

    blocks.push({ name, content: block.content });
    cursor = block.end + 1;
  }

  return blocks;
}

function readQuotedGradleValue(blockContent, key) {
  const match = blockContent.match(
    new RegExp(`\\b${key}\\b\\s+["']([^"']+)["']`)
  );
  return match?.[1] ?? null;
}

function cleanPbxString(value) {
  if (!value) return null;
  return value.replace(/^"(.*)"$/, '$1').trim();
}

function readPbxValue(body, key) {
  const match = body.match(new RegExp(`\\b${key}\\s*=\\s*([^;]+);`));
  return match?.[1]?.trim() ?? null;
}

function parsePbxArray(body, key) {
  const match = body.match(new RegExp(`\\b${key}\\s*=\\s*\\(([\\s\\S]*?)\\);`));
  if (!match) return [];

  return match[1]
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => line.replace(/,$/, ''))
    .map((line) => {
      const idMatch = line.match(/^([A-F0-9]{24})/);
      return idMatch?.[1] ?? null;
    })
    .filter(Boolean);
}

function parsePbxprojObjectsByIsa(pbxprojContent, isa) {
  const objectRegex = new RegExp(
    `([A-F0-9]{24}) /\\* ([^*]+) \\*/ = \\{[\\s\\S]*?isa = ${isa};([\\s\\S]*?)\\n\\s*\\};`,
    'g'
  );
  const objects = [];
  let match;

  while ((match = objectRegex.exec(pbxprojContent)) !== null) {
    objects.push({
      id: match[1],
      comment: match[2].trim(),
      body: match[3],
    });
  }

  return objects;
}

function isAppLikeTarget(targetName, productType) {
  if (productType?.includes('application')) return true;

  return ![
    'Tests',
    'UITests',
    'UnitTests',
    'NotificationService',
    'Extension',
    'Widget',
  ].some((suffix) => targetName.endsWith(suffix));
}

function choosePreferredBuildConfig(buildConfigs, preferredNames = []) {
  for (const preferredName of preferredNames) {
    const match = buildConfigs.find((config) => config.name === preferredName);
    if (match) return match;
  }

  return buildConfigs[0] ?? null;
}

function getAndroidBuildGradlePath(projectRoot) {
  return findFirstExistingPath([
    path.join(projectRoot, 'android', 'app', 'build.gradle'),
    path.join(projectRoot, 'android', 'app', 'build.gradle.kts'),
  ]);
}

function getAndroidProjectMetadata() {
  const projectRoot = getProjectRoot();
  const gradlePath = getAndroidBuildGradlePath(projectRoot);
  if (!gradlePath) {
    console.warn('⚠️ Android build.gradle not found.');
    return null;
  }

  const gradleContent = fs.readFileSync(gradlePath, 'utf8');
  const defaultConfigBlock = extractNamedBlock(gradleContent, 'defaultConfig');
  const productFlavorsBlock = extractNamedBlock(
    gradleContent,
    'productFlavors'
  );

  const defaultAppId =
    readQuotedGradleValue(defaultConfigBlock?.content ?? '', 'applicationId') ??
    null;
  const defaultVersion =
    readQuotedGradleValue(defaultConfigBlock?.content ?? '', 'versionName') ??
    null;

  const flavors = parseTopLevelNamedBlocks(
    productFlavorsBlock?.content ?? ''
  ).map(({ name, content }) => {
    const flavorAppId = readQuotedGradleValue(content, 'applicationId');
    const flavorAppIdSuffix = readQuotedGradleValue(
      content,
      'applicationIdSuffix'
    );
    const flavorVersion = readQuotedGradleValue(content, 'versionName');
    const flavorVersionSuffix = readQuotedGradleValue(
      content,
      'versionNameSuffix'
    );

    return {
      name,
      label: name,
      appId: flavorAppId ?? `${defaultAppId ?? ''}${flavorAppIdSuffix ?? ''}`,
      version:
        flavorVersion ??
        (defaultVersion
          ? `${defaultVersion}${flavorVersionSuffix ?? ''}`
          : null),
    };
  });

  return {
    defaultConfig: {
      name: 'default',
      label: 'Default',
      appId: defaultAppId,
      version: defaultVersion,
    },
    flavors,
  };
}

async function getAndroidFlavorSelection() {
  const metadata = getAndroidProjectMetadata();
  if (!metadata) return null;

  if (!metadata.flavors.length) {
    return metadata.defaultConfig;
  }

  let selectedFlavor;
  let isFlavorConfirmed = false;

  while (!isFlavorConfirmed) {
    selectedFlavor = await select({
      message: 'Select Android flavor:',
      choices: [
        {
          name: `Default (${metadata.defaultConfig.appId ?? 'unknown app id'} / ${metadata.defaultConfig.version ?? 'unknown version'})`,
          value: metadata.defaultConfig,
        },
        ...metadata.flavors.map((flavor) => ({
          name: `${flavor.name} (${flavor.appId ?? 'unknown app id'} / ${flavor.version ?? 'unknown version'})`,
          value: flavor,
        })),
      ],
    });

    isFlavorConfirmed = await confirm({
      message: `Continue with Android flavor ${selectedFlavor.label ?? selectedFlavor.name}?`,
      default: true,
    });
  }

  return selectedFlavor;
}

function getIosProjectFiles() {
  const projectRoot = getProjectRoot();
  const iosDir = path.join(projectRoot, 'ios');
  if (!fs.existsSync(iosDir)) {
    console.warn(`⚠️ iOS folder not found at ${iosDir}`);
    return null;
  }

  const xcodeProjPath = findFirstXcodeProj(iosDir);
  if (!xcodeProjPath) {
    console.warn('⚠️ .xcodeproj not found inside ios directory.');
    return null;
  }

  const pbxprojPath = path.join(xcodeProjPath, 'project.pbxproj');
  if (!fs.existsSync(pbxprojPath)) {
    console.warn('⚠️ project.pbxproj not found.');
    return null;
  }

  return { iosDir, xcodeProjPath, pbxprojPath };
}

function getIosTargetMetadata() {
  const projectFiles = getIosProjectFiles();
  if (!projectFiles) return null;

  const pbxprojContent = fs.readFileSync(projectFiles.pbxprojPath, 'utf8');
  const configObjects = parsePbxprojObjectsByIsa(
    pbxprojContent,
    'XCBuildConfiguration'
  );
  const configMap = new Map(
    configObjects.map((config) => [
      config.id,
      {
        id: config.id,
        name: cleanPbxString(readPbxValue(config.body, 'name')),
        version: cleanPbxString(readPbxValue(config.body, 'MARKETING_VERSION')),
        appId: cleanPbxString(
          readPbxValue(config.body, 'PRODUCT_BUNDLE_IDENTIFIER')
        ),
        productName: cleanPbxString(readPbxValue(config.body, 'PRODUCT_NAME')),
      },
    ])
  );

  const configListObjects = parsePbxprojObjectsByIsa(
    pbxprojContent,
    'XCConfigurationList'
  );
  const configListMap = new Map(
    configListObjects.map((configList) => [
      configList.id,
      {
        defaultName: cleanPbxString(
          readPbxValue(configList.body, 'defaultConfigurationName')
        ),
        buildConfigurations: parsePbxArray(
          configList.body,
          'buildConfigurations'
        ),
      },
    ])
  );

  const targetObjects = parsePbxprojObjectsByIsa(
    pbxprojContent,
    'PBXNativeTarget'
  );
  const targets = targetObjects
    .map((target) => {
      const targetName = cleanPbxString(readPbxValue(target.body, 'name'));
      const productType = cleanPbxString(
        readPbxValue(target.body, 'productType')
      );
      const configListId = cleanPbxString(
        readPbxValue(target.body, 'buildConfigurationList')
      )?.match(/^([A-F0-9]{24})/)?.[1];

      if (
        !targetName ||
        !configListId ||
        !isAppLikeTarget(targetName, productType)
      ) {
        return null;
      }

      const configList = configListMap.get(configListId);
      const buildConfigs =
        configList?.buildConfigurations
          .map((configId) => configMap.get(configId))
          .filter(Boolean) ?? [];

      if (!buildConfigs.length) return null;

      const buildConfigsWithAppId = buildConfigs.filter(
        (config) => config.appId
      );

      const configsByAppId = new Map();
      for (const buildConfig of buildConfigsWithAppId) {
        const appIdKey = buildConfig.appId;
        if (!configsByAppId.has(appIdKey)) {
          configsByAppId.set(appIdKey, []);
        }

        configsByAppId.get(appIdKey).push(buildConfig);
      }

      const preferredConfigNames = [
        configList?.defaultName,
        'Release',
        'Profile',
        'Debug',
      ].filter(Boolean);

      const distinctConfigs =
        configsByAppId.size <= 1
          ? [
              choosePreferredBuildConfig(
                buildConfigsWithAppId.length
                  ? buildConfigsWithAppId
                  : buildConfigs,
                preferredConfigNames
              ),
            ].filter(Boolean)
          : Array.from(configsByAppId.values())
              .map((configGroup) =>
                choosePreferredBuildConfig(configGroup, preferredConfigNames)
              )
              .filter(Boolean);

      return distinctConfigs.map((selectedConfig) => {
        const buildConfigurationLabel = selectedConfig.name
          ? ` [${selectedConfig.name}]`
          : '';

        const appIdLabel = selectedConfig.appId
          ? ` (${selectedConfig.appId})`
          : '';

        return {
          name: `${targetName}::${selectedConfig.appId ?? selectedConfig.id ?? 'no-app-id'}`,
          targetName,
          label: `${targetName}${buildConfigurationLabel}${appIdLabel}`,
          appId: selectedConfig.appId ?? null,
          version: selectedConfig.version ?? null,
          productName: selectedConfig.productName ?? targetName,
          buildConfiguration: selectedConfig.name ?? null,
        };
      });
    })
    .flat()
    .filter(Boolean);

  const uniqueTargets = targets.filter(
    (target, index, allTargets) =>
      allTargets.findIndex((candidate) =>
        candidate.appId
          ? candidate.appId === target.appId
          : candidate.targetName === target.targetName &&
            candidate.buildConfiguration === target.buildConfiguration
      ) === index
  );

  return {
    defaultConfig: uniqueTargets[0] ?? null,
    targets: uniqueTargets,
  };
}

async function getIosTargetSelection() {
  const metadata = getIosTargetMetadata();
  if (!metadata) return null;

  if (metadata.targets.length <= 1) {
    return metadata.defaultConfig;
  }

  let selectedTarget;
  let isTargetConfirmed = false;

  while (!isTargetConfirmed) {
    selectedTarget = await select({
      message: 'Select iOS target:',
      choices: metadata.targets.map((target) => ({
        name: `${target.label} (${target.appId ?? 'unknown app id'} / ${target.version ?? 'unknown version'})`,
        value: target,
      })),
    });

    isTargetConfirmed = await confirm({
      message: `Continue with iOS target ${selectedTarget.label ?? selectedTarget.name}?`,
      default: true,
    });
  }

  return selectedTarget;
}

function getPlatformAppVersion(platform, selection) {
  if (selection?.version) return selection.version;

  if (platform === 'android') {
    const metadata = getAndroidProjectMetadata();
    return metadata?.defaultConfig.version ?? null;
  }

  if (platform === 'ios') {
    const metadata = getIosTargetMetadata();
    return metadata?.defaultConfig.version ?? null;
  }

  return null;
}

async function getCommonConfig() {
  console.log(`\n⚙️  Enter common configuration for the app\n`);

  const API_TOKEN = await input({
    message: 'Enter API Token:',
    validate: (val) => (val.trim() ? true : 'API Token is required'),
  });

  const PROJECT_ID = await input({
    message: 'Enter Project ID:',
    validate: (val) => (val.trim() ? true : 'Project ID is required'),
  });

  let ENVIRONMENT;
  let isEnvironmentConfirmed = false;

  while (!isEnvironmentConfirmed) {
    ENVIRONMENT = await select({
      message: 'Select Environment:',
      choices: [
        { name: 'development', value: 'development' },
        { name: 'production', value: 'production' },
      ],
    });

    isEnvironmentConfirmed = await confirm({
      message: `Continue with ${ENVIRONMENT} environment?`,
      default: true,
    });
  }

  return { API_TOKEN, PROJECT_ID, ENVIRONMENT };
}

async function getPlatformConfig(platform) {
  console.log(`\n🔧 Configuring ${platform.toUpperCase()}...\n`);

  const selection =
    platform === 'android'
      ? await getAndroidFlavorSelection()
      : platform === 'ios'
        ? await getIosTargetSelection()
        : null;

  if (platform === 'android' && selection?.label) {
    console.log(
      `📦 Selected Android flavor: ${selection.label} (${selection.appId ?? 'unknown app id'})`
    );
  }

  if (platform === 'ios' && selection?.label) {
    console.log(
      `🍎 Selected iOS target: ${selection.label} (${selection.appId ?? 'unknown app id'})`
    );
  }

  let detectedVersion = getPlatformAppVersion(platform, selection);
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

  return {
    VERSION: detectedVersion,
    FORCE_UPDATE,
    APP_ID: selection?.appId ?? null,
    VARIANT: selection?.name ?? null,
  };
}

function getAndroidOutputPaths(projectRoot) {
  return {
    bundleZipPath: path.join(
      projectRoot,
      'android',
      'index.android.bundle.zip'
    ),
    outputDir: path.join(projectRoot, 'android', 'output'),
    sourceMapPath: path.join(projectRoot, 'android', 'sourcemap.js'),
    sourceMapZipPath: path.join(projectRoot, 'android', 'sourcemap.zip'),
  };
}

function getIosOutputPaths(projectRoot) {
  return {
    bundleZipPath: path.join(projectRoot, 'ios', 'main.jsbundle.zip'),
    outputDir: path.join(projectRoot, 'ios', 'output'),
    sourceMapPath: path.join(projectRoot, 'ios', 'sourcemap.js'),
    sourceMapZipPath: path.join(projectRoot, 'ios', 'sourcemap.zip'),
  };
}

function buildAndroid(selection) {
  const projectRoot = getProjectRoot();
  const paths = getAndroidOutputPaths(projectRoot);

  console.log('📦 Building Android bundle...');
  if (selection?.label) {
    console.log(`📦 Using Android flavor: ${selection.label}`);
  }

  fs.rmSync(paths.outputDir, { recursive: true, force: true });
  fs.rmSync(paths.bundleZipPath, { force: true });
  fs.rmSync(paths.sourceMapPath, { force: true });
  fs.rmSync(paths.sourceMapZipPath, { force: true });
  fs.mkdirSync(paths.outputDir, { recursive: true });

  run(
    `react-native bundle --platform android --dev false --entry-file index.js ` +
      `--bundle-output ${path.relative(projectRoot, path.join(paths.outputDir, 'index.android.bundle'))} ` +
      `--assets-dest ${path.relative(projectRoot, paths.outputDir)} ` +
      `--sourcemap-output ${path.relative(projectRoot, paths.sourceMapPath)}`,
    projectRoot
  );
  run(
    `find output -type f | zip index.android.bundle.zip -@`,
    path.join(projectRoot, 'android')
  );
  run(`zip sourcemap.zip sourcemap.js`, path.join(projectRoot, 'android'));

  fs.rmSync(paths.outputDir, { recursive: true, force: true });
  fs.rmSync(paths.sourceMapPath, { force: true });

  console.log(`✅ Android bundle created at ${paths.bundleZipPath}`);
  return paths.bundleZipPath;
}

function buildIOS(selection) {
  const projectRoot = getProjectRoot();
  const paths = getIosOutputPaths(projectRoot);

  console.log('📦 Building iOS bundle...');
  if (selection?.label) {
    console.log(`🍎 Using iOS scheme: ${selection.label}`);
  }

  fs.rmSync(paths.outputDir, { recursive: true, force: true });
  fs.rmSync(paths.bundleZipPath, { force: true });
  fs.rmSync(paths.sourceMapPath, { force: true });
  fs.rmSync(paths.sourceMapZipPath, { force: true });
  fs.mkdirSync(paths.outputDir, { recursive: true });

  run(
    `react-native bundle --platform ios --dev false --entry-file index.js ` +
      `--bundle-output ${path.relative(projectRoot, path.join(paths.outputDir, 'main.jsbundle'))} ` +
      `--assets-dest ${path.relative(projectRoot, paths.outputDir)} ` +
      `--sourcemap-output ${path.relative(projectRoot, paths.sourceMapPath)}`,
    projectRoot
  );
  run(
    `find output -type f | zip main.jsbundle.zip -@`,
    path.join(projectRoot, 'ios')
  );
  run(`zip sourcemap.zip sourcemap.js`, path.join(projectRoot, 'ios'));

  fs.rmSync(paths.outputDir, { recursive: true, force: true });
  fs.rmSync(paths.sourceMapPath, { force: true });

  console.log(`✅ iOS bundle created at ${paths.bundleZipPath}`);
  return paths.bundleZipPath;
}

(async () => {
  try {
    const platform = process.argv[2];
    if (!platform) {
      console.log('❌ Please specify a platform: android | ios | all');
      process.exit(1);
    }

    const commonConfig = await getCommonConfig();

    if (platform === 'android') {
      const androidConfig = await getPlatformConfig('android');
      const androidFile = buildAndroid({ label: androidConfig.VARIANT });
      await uploadBundle({
        filePath: androidFile,
        platform: 'android',
        config: { ...commonConfig, ...androidConfig },
      });
    } else if (platform === 'ios') {
      const iosConfig = await getPlatformConfig('ios');
      const iosFile = buildIOS({ label: iosConfig.VARIANT });
      await uploadBundle({
        filePath: iosFile,
        platform: 'ios',
        config: { ...commonConfig, ...iosConfig },
      });
    } else if (platform === 'all') {
      const androidConfig = await getPlatformConfig('android');
      const androidFile = buildAndroid({ label: androidConfig.VARIANT });
      await uploadBundle({
        filePath: androidFile,
        platform: 'android',
        config: { ...commonConfig, ...androidConfig },
      });

      const iosConfig = await getPlatformConfig('ios');
      const iosFile = buildIOS({ label: iosConfig.VARIANT });
      await uploadBundle({
        filePath: iosFile,
        platform: 'ios',
        config: { ...commonConfig, ...iosConfig },
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
