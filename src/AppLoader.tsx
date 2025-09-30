import { useState } from 'react';
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  View,
  type TextStyle,
  type ViewStyle,
} from 'react-native';

export type LoaderOptions = {
  text?: string;
  color?: string;
  backgroundColor?: string;
  textColor?: string;
  containerStyle?: ViewStyle;
  textStyle?: TextStyle;
};

let showLoader: (options?: LoaderOptions) => void;
let hideLoader: () => void;

export const AppLoader = () => {
  const [visible, setVisible] = useState(false);
  const [options, setOptions] = useState<LoaderOptions>({});

  showLoader = (opts?: LoaderOptions) => {
    setOptions(opts || {});
    setVisible(true);
  };

  hideLoader = () => {
    setVisible(false);
  };

  if (!visible) return null;

  return (
    <View
      style={[
        styles.overlay,
        { backgroundColor: options.backgroundColor || 'rgba(0,0,0,0.3)' },
      ]}
    >
      <View style={[styles.loaderBox, options.containerStyle]}>
        <ActivityIndicator size="large" color={options.color || '#2563EB'} />
        {options.text && (
          <Text
            style={[
              styles.text,
              { color: options.textColor || '#fff' },
              options.textStyle,
            ]}
          >
            {options.text}
          </Text>
        )}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 9999,
  },
  loaderBox: {
    padding: 20,
    borderRadius: 10,
    backgroundColor: '#1F2937',
    alignItems: 'center',
  },
  text: {
    marginTop: 12,
    fontSize: 14,
    fontWeight: '500',
  },
});

AppLoader.show = (options?: LoaderOptions) => showLoader?.(options);
AppLoader.hide = () => hideLoader?.();
