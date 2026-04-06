import axios from 'axios';
import { Platform } from 'react-native';
import ReactNativeBlobUtil from 'react-native-blob-util';
import DeviceInfo from 'react-native-device-info';
import hotUpdate from 'react-native-ota-hot-update';
import { AppAlertDialog, type DialogOptions } from './AppAlertDialog';
import { AppLoader, type LoaderOptions } from './AppLoader';

export type OTAUpdateProps = {
  key: string;
  iosPackage: string;
  androidPackage: string;
  loaderOptions?: LoaderOptions;
  dialogOptions?: Omit<DialogOptions, 'onConfirm' | 'onCancel'>;
  baseUrl: string;
  restartAfterInstall?: boolean;
  restartDelay?: number;
  onUpdateInstalled?: (state: OTAUpdateSuccessState) => void;
};

export type OTAUpdateSuccessState = {
  bundleId: string;
  version: number;
  appVersion: string;
  installedAt: string;
};

const OTA_UPDATE_SUCCESS_FILE = `${ReactNativeBlobUtil.fs.dirs.CacheDir}/ota-update-success.json`;

const persistOTAUpdateSuccessState = async (state: OTAUpdateSuccessState) => {
  try {
    await ReactNativeBlobUtil.fs.writeFile(
      OTA_UPDATE_SUCCESS_FILE,
      JSON.stringify(state),
      'utf8'
    );
  } catch (error) {
    console.warn('Failed to persist OTA update success state:', error);
  }
};

const readOTAUpdateSuccessState = async () => {
  try {
    const exists = await ReactNativeBlobUtil.fs.exists(OTA_UPDATE_SUCCESS_FILE);

    if (!exists) {
      return null;
    }

    const content = await ReactNativeBlobUtil.fs.readFile(
      OTA_UPDATE_SUCCESS_FILE,
      'utf8'
    );
    return JSON.parse(content) as OTAUpdateSuccessState;
  } catch (error) {
    console.warn('Failed to read OTA update success state:', error);
    return null;
  }
};

export const consumeOTAUpdateSuccessState = async () => {
  const state = await readOTAUpdateSuccessState();

  if (!state) {
    return null;
  }

  try {
    const exists = await ReactNativeBlobUtil.fs.exists(OTA_UPDATE_SUCCESS_FILE);

    if (exists) {
      await ReactNativeBlobUtil.fs.unlink(OTA_UPDATE_SUCCESS_FILE);
    }
  } catch (error) {
    console.warn('Failed to clear OTA update success state:', error);
  }

  return state;
};

export const reloadAppForOTAUpdate = () => {
  hotUpdate.resetApp();
};

export const checkOTAUpdate = async ({
  key,
  iosPackage,
  androidPackage,
  loaderOptions,
  dialogOptions,
  baseUrl,
  restartAfterInstall = true,
  restartDelay = 1000,
  onUpdateInstalled,
}: OTAUpdateProps) => {
  try {
    const API_URL = baseUrl;
    const response = await axios.get(
      `${API_URL}projects/get-bundle?key=${key}&iosPackage=${iosPackage}&androidPackage=${androidPackage}`
    );

    const currentVersion = await hotUpdate.getCurrentVersion();
    const data =
      Platform.OS === 'android' ? response?.data?.android : response?.data?.ios;
    const version = data?.version ?? 0;
    const forceUpdate = data?.forceUpdate ?? false;
    const url = data?.url ?? '';
    const bundleId = data?.bundleId ?? '';
    const currentAppVersion = DeviceInfo.getVersion();
    const bundleAppVersion = data?.appVersion ?? currentAppVersion;

    if (version <= currentVersion || currentAppVersion !== bundleAppVersion) {
      return;
    }

    const downloadAndReport = () => {
      AppLoader.show(loaderOptions);
      hotUpdate.downloadBundleUri(ReactNativeBlobUtil, url, version, {
        progress: (received, total) => {
          if (loaderOptions?.showProgress) {
            const percentage = (
              (Number(received) / Number(total)) *
              100
            ).toFixed(1);
            AppLoader.updateProgress(Number(percentage));
          }
        },
        updateSuccess: () => {
          const updateState = {
            bundleId,
            version,
            appVersion: bundleAppVersion,
            installedAt: new Date().toISOString(),
          };

          persistOTAUpdateSuccessState(updateState)
            .finally(() => {
              axios
                .post(
                  `${API_URL}bundles/${bundleId}/count`,
                  { status: 'success' },
                  { headers: { 'Content-Type': 'application/json' } }
                )
                .finally(() => AppLoader.hide());
            })
            .catch((error) => {
              console.warn(
                'Failed to finalize OTA update success handling:',
                error
              );
            });

          onUpdateInstalled?.(updateState);
        },
        updateFail: (error) => {
          axios
            .post(
              `${API_URL}bundles/${bundleId}/count`,
              {
                status: 'failure',
                error: JSON.stringify(error),
                deviceInfo: {
                  model: DeviceInfo.getModel(),
                  brand: DeviceInfo.getBrand(),
                  systemName: DeviceInfo.getSystemName(),
                  systemVersion: DeviceInfo.getSystemVersion(),
                },
              },
              { headers: { 'Content-Type': 'application/json' } }
            )
            .finally(() => AppLoader.hide());
        },
        restartAfterInstall,
        restartDelay,
      });
    };

    if (forceUpdate) {
      downloadAndReport();
    } else {
      AppAlertDialog.showMessage({
        title: 'Update Available!',
        message: 'A newer version is ready to install.',
        confirmText: 'Update',
        cancelText: 'Cancel',
        onConfirm: downloadAndReport,
        onCancel: () => {},
        ...dialogOptions,
      });
    }
  } catch (err) {
    console.warn('OTA update check failed:', err);
  }
};
