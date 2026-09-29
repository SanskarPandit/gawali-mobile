import React from 'react';
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  TouchableWithoutFeedback,
  StyleSheet,
  ViewStyle,
  Animated,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../theme/ThemeContext';

interface BottomSheetModalProps {
  visible: boolean;
  onClose: () => void;
  title?: string;
  subtitle?: string;
  children: React.ReactNode;
  containerStyle?: ViewStyle;
}

export const BottomSheetModal: React.FC<BottomSheetModalProps> = ({
  visible,
  onClose,
  title,
  subtitle,
  children,
  containerStyle,
}) => {
  const insets = useSafeAreaInsets();
  const { colors, isDark } = useTheme();

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <TouchableWithoutFeedback onPress={onClose}>
        <View style={styles.overlay}>
          <TouchableWithoutFeedback>
            <View
              style={[
                styles.sheet,
                {
                  backgroundColor: colors.card,
                  paddingBottom: Math.max(insets.bottom, 20),
                },
                containerStyle,
              ]}
            >
              <View style={styles.dragHandle} />

              {(title || subtitle) && (
                <View style={styles.header}>
                  <View style={{ flex: 1 }}>
                    {title && (
                      <Text style={[styles.title, { color: colors.textPrimary }]}>
                        {title}
                      </Text>
                    )}
                    {subtitle && (
                      <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
                        {subtitle}
                      </Text>
                    )}
                  </View>
                  <TouchableOpacity
                    onPress={onClose}
                    style={[
                      styles.closeBtn,
                      { backgroundColor: isDark ? colors.surface : '#F1F5F9' },
                    ]}
                  >
                    <Text style={[styles.closeText, { color: colors.textSecondary }]}>
                      ✕
                    </Text>
                  </TouchableOpacity>
                </View>
              )}

              <View style={styles.content}>{children}</View>
            </View>
          </TouchableWithoutFeedback>
        </View>
      </TouchableWithoutFeedback>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  sheet: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 20,
    paddingTop: 12,
    maxHeight: '85%',
  },
  dragHandle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#CBD5E1',
    alignSelf: 'center',
    marginBottom: 16,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
  },
  subtitle: {
    fontSize: 13,
    marginTop: 2,
  },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 12,
  },
  closeText: {
    fontSize: 14,
    fontWeight: '600',
  },
  content: {
    paddingBottom: 8,
  },
});
