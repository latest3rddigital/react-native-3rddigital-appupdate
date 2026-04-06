import { useEffect } from 'react';
import { Alert, Text, View } from 'react-native';
import {
  OTAProvider,
  checkOTAUpdate,
  consumeOTAUpdateSuccessState,
} from 'react-native-3rddigital-appupdate';

const App = () => {
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
      </View>
    </OTAProvider>
  );
};

export default App;
