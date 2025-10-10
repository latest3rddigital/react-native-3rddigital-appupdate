# react-native-3rddigital-appupdate

A React Native library for **seamless Over-The-Air (OTA) updates** with:

- 🔄 Automatic version checks
- 📥 Bundle download & installation (iOS & Android)
- ⚡ Configurable user prompts (dialogs) & loaders
- 🛠️ CLI tool for building & uploading bundles to your update server

## 🚀 Installation

```sh
npm install react-native-3rddigital-appupdate
# or
yarn add react-native-3rddigital-appupdate
```

This package has peer dependencies that also need to be installed:

```sh
npm install react-native-blob-util react-native-device-info react-native-ota-hot-update
```

Run pod install for iOS:

```sh
cd ios && pod install
```

## 📦 Usage in Your App

- Wrap your app with the OTAProvider to enable the loader and dialog components globally:

```sh
import React, { useEffect } from 'react';
import { View, Text } from 'react-native';
import { OTAProvider, checkOTAUpdate } from 'react-native-3rddigital-appupdate';

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
```

## ⚙️ API Reference

🔹 checkOTAUpdate(options: OTAUpdateProps)

- Checks the server for available updates and installs if needed.

Options:

| Key              | Type   | Required | Description                                           |
| ---------------- | ------ | -------- | ----------------------------------------------------- |
| `key`            | string | ✅       | Project key to identify the app on your update server |
| `iosPackage`     | string | ✅       | iOS bundle/package identifier                         |
| `androidPackage` | string | ✅       | Android bundle/package identifier                     |
| `loaderOptions`  | object | ❌       | Customize loader UI (see below)                       |
| `dialogOptions`  | object | ❌       | Customize alert dialog UI (see below)                 |

🔹 OTAProvider

- Renders background components (AppLoader, AppAlertDialog) that handle UI for downloads and update prompts.
- Must be included once, usually at the root of your app.

🔹 Loader (AppLoader)

- Global loader shown when downloading an update.

Props (LoaderOptions):

| Key               | Type      | Default           | Description                           |
| ----------------- | --------- | ----------------- | ------------------------------------- |
| `text`            | string    | `undefined`       | Text displayed below the spinner      |
| `color`           | string    | `#2563EB`         | Spinner color                         |
| `backgroundColor` | string    | `rgba(0,0,0,0.3)` | Overlay background color              |
| `textColor`       | string    | `#fff`            | Loader text color                     |
| `containerStyle`  | ViewStyle | `{}`              | Custom style for the loader container |
| `textStyle`       | TextStyle | `{}`              | Custom style for the loader text      |

🔹 Dialog (AppAlertDialog)

- Global confirmation dialog used to prompt users for updates.

Props (DialogOptions):

| Key                  | Type       | Default             | Description                            |
| -------------------- | ---------- | ------------------- | -------------------------------------- |
| `title`              | string     | `"Alert"`           | Dialog title                           |
| `message`            | string     | `""`                | Dialog message                         |
| `cancelText`         | string     | `"Cancel"`          | Cancel button text                     |
| `confirmText`        | string     | `"OK"`              | Confirm button text                    |
| `onCancel`           | () => void | `undefined`         | Callback when cancel is pressed        |
| `onConfirm`          | () => void | `undefined`         | Callback when confirm is pressed       |
| `titleStyle`         | TextStyle  | `{}`                | Style override for title text          |
| `messageStyle`       | TextStyle  | `{}`                | Style override for message text        |
| `cancelButtonStyle`  | ViewStyle  | `{}`                | Style override for cancel button       |
| `confirmButtonStyle` | ViewStyle  | `{}`                | Style override for confirm button      |
| `cancelTextStyle`    | TextStyle  | `{}`                | Style override for cancel button text  |
| `confirmTextStyle`   | TextStyle  | `{}`                | Style override for confirm button text |
| `overlayColor`       | string     | `'rgba(0,0,0,0.3)'` | Overlay background color               |

## 🖥️ CLI Tool – appupdate

- This package also provides a CLI for building and uploading OTA bundles.

Build & Upload

```sh
npx appupdate android
npx appupdate ios
npx appupdate all
```

You will be prompted for:

- API Token
- Project ID
- Environment (development / production)
- Version
- Force Update (true/false)

What it does

- Bundles your React Native JS + assets
- Zips the output
- Uploads bundle + metadata to your update server (https://dev.3rddigital.com/appupdate-api/api/)

## 📄 License

- This project is licensed under the [MIT License](./LICENSE).
