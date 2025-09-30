import { useState } from 'react';
import {
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  type TextStyle,
  type ViewStyle,
} from 'react-native';

export type DialogOptions = {
  title?: string;
  message?: string;
  cancelText?: string;
  confirmText?: string;
  onCancel?: () => void;
  onConfirm?: () => void;
  titleStyle?: TextStyle;
  messageStyle?: TextStyle;
  cancelButtonStyle?: ViewStyle;
  confirmButtonStyle?: ViewStyle;
  cancelTextStyle?: TextStyle;
  confirmTextStyle?: TextStyle;
  overlayColor?: string;
};

let showDialog: (options: DialogOptions) => void;
let hideDialog: () => void;

export const AppAlertDialog = () => {
  const [visible, setVisible] = useState(false);
  const [options, setOptions] = useState<DialogOptions>({});

  showDialog = (opts: DialogOptions) => {
    setOptions(opts);
    setVisible(true);
  };

  hideDialog = () => {
    setVisible(false);
  };

  const handleBackPress = () => {
    if (visible) {
      hideDialog();
      options.onCancel?.();
    }
  };

  return (
    <Modal
      transparent
      visible={visible}
      animationType="fade"
      onRequestClose={handleBackPress}
    >
      <Pressable
        style={[
          styles.overlay,
          { backgroundColor: options.overlayColor || 'rgba(0,0,0,0.3)' },
        ]}
        onPress={() => {
          hideDialog();
          options.onCancel?.();
        }}
      >
        <Pressable style={styles.dialogBox} onPress={() => {}}>
          <Text style={[styles.title, options.titleStyle]}>
            {options.title || 'Alert'}
          </Text>
          <Text style={[styles.message, options.messageStyle]}>
            {options.message || ''}
          </Text>

          <View style={styles.buttonRow}>
            <TouchableOpacity
              onPress={() => {
                hideDialog();
                options.onCancel?.();
              }}
              style={[
                styles.button,
                styles.cancelButton,
                options.cancelButtonStyle,
              ]}
            >
              <Text style={[styles.cancelText, options.cancelTextStyle]}>
                {options.cancelText || 'Cancel'}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={() => {
                hideDialog();
                options.onConfirm?.();
              }}
              style={[
                styles.button,
                styles.confirmButton,
                options.confirmButtonStyle,
              ]}
            >
              <Text style={[styles.confirmText, options.confirmTextStyle]}>
                {options.confirmText || 'OK'}
              </Text>
            </TouchableOpacity>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 9999,
  },
  dialogBox: {
    width: '80%',
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 20,
    alignItems: 'center',
  },
  title: {
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 10,
    textAlign: 'center',
  },
  message: {
    fontSize: 14,
    color: '#4B5563',
    textAlign: 'center',
    marginBottom: 20,
  },
  buttonRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    width: '100%',
  },
  button: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 8,
    alignItems: 'center',
    marginHorizontal: 5,
  },
  cancelButton: {
    backgroundColor: '#E5E7EB',
  },
  confirmButton: {
    backgroundColor: '#2563EB',
  },
  cancelText: {
    color: '#374151',
    fontWeight: '500',
  },
  confirmText: {
    color: '#fff',
    fontWeight: '500',
  },
});

AppAlertDialog.showMessage = (options: DialogOptions) => showDialog?.(options);
AppAlertDialog.hide = () => hideDialog?.();
