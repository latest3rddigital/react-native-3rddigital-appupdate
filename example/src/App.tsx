import { useEffect } from 'react';
import { Text, View } from 'react-native';
import { OTAProvider, checkOTAUpdate } from 'react-native-app-update';

const App = () => {
  useEffect(() => {
    checkOTAUpdate({
      key: 'YOUR_PROJECT_KEY',
      iosPackage: 'com.example.ios',
      androidPackage: 'com.example.android',
      loaderOptions: {
        text: 'Downloading update...',
      },
      dialogOptions: {
        title: 'Update Available',
        message: 'A new version is ready to install.',
      },
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
