import { useEffect, useState } from 'react';
import { Alert, Button, Text, View } from 'react-native';
import {
  OTAProvider,
  checkOTAUpdate,
  consumeOTAUpdateSuccessState,
  reloadAppForOTAUpdate,
  type OTAUpdateSuccessState,
} from 'react-native-3rddigital-appupdate';

const App = () => {
  const [pendingUpdate, setPendingUpdate] =
    useState<OTAUpdateSuccessState | null>(null);

  useEffect(() => {
    const initializeOTAUpdate = async () => {
      const updateState = await consumeOTAUpdateSuccessState();

      if (updateState) {
        Alert.alert(
          'Update successful',
          `OTA bundle v${updateState.version} is now active.`
        );
      }

      await checkOTAUpdate({
        baseUrl: 'https://your-api-url.com',
        key: 'YOUR_PROJECT_KEY',
        iosPackage: 'com.example.ios',
        androidPackage: 'com.example.android',
        restartAfterInstall: false,
        restartDelay: 1000,
        onUpdateInstalled: (state) => {
          setPendingUpdate(state);
        },
        loaderOptions: {
          text: 'Downloading update...',
          showProgress: true,
        },
        dialogOptions: {
          title: 'Update Available',
          message: 'A new version is ready to install.',
        },
      });
    };

    initializeOTAUpdate().catch((error) => {
      console.warn('Failed to initialize OTA update flow:', error);
    });
  }, []);

  return (
    <OTAProvider>
      <View>
        <Text>My App Content</Text>
        {pendingUpdate ? (
          <Button
            title={`Reload to apply OTA v${pendingUpdate.version}`}
            onPress={reloadAppForOTAUpdate}
          />
        ) : null}
      </View>
    </OTAProvider>
  );
};

export default App;
