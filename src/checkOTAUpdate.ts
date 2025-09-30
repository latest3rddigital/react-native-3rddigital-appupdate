import axios from 'axios';
import { Platform } from 'react-native';
import ReactNativeBlobUtil from 'react-native-blob-util';
import DeviceInfo from 'react-native-device-info';
import hotUpdate from 'react-native-ota-hot-update';
import { AppAlertDialog, type DialogOptions } from './AppAlertDialog';
import { AppLoader, type LoaderOptions } from './AppLoader';

const API_URL = 'https://dev.3rddigital.com/appupdate-api/api/';

export type OTAUpdateProps = {
  key: string;
  iosPackage: string;
  androidPackage: string;
  loaderOptions?: LoaderOptions;
  dialogOptions?: Omit<DialogOptions, 'onConfirm' | 'onCancel'>;
};

export const checkOTAUpdate = async ({
  key,
  iosPackage,
  androidPackage,
  loaderOptions,
  dialogOptions,
}: OTAUpdateProps) => {
  try {
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

    if (version <= currentVersion) return;

    const downloadAndReport = () => {
      AppLoader.show(loaderOptions);
      hotUpdate.downloadBundleUri(ReactNativeBlobUtil, url, version, {
        updateSuccess: () => {
          axios
            .post(
              `${API_URL}bundles/${bundleId}/count`,
              { status: 'success' },
              { headers: { 'Content-Type': 'application/json' } }
            )
            .finally(() => AppLoader.hide());
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
        restartAfterInstall: true,
        restartDelay: 1000,
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
