import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ViewStyle } from 'react-native';
import { Minus, Plus } from 'lucide-react-native';
import { useTheme } from '../theme/ThemeContext';

interface QuantityStepperProps {
  value: number;
  onChange: (val: number) => void;
  step?: number;
  min?: number;
  max?: number;
  unit?: string;
  size?: 'sm' | 'md' | 'lg';
  style?: ViewStyle;
}

export const QuantityStepper: React.FC<QuantityStepperProps> = ({
  value,
  onChange,
  step = 0.5,
  min = 0,
  max = 20,
  unit = 'L',
  size = 'md',
  style,
}) => {
  const { colors, isDark } = useTheme();

  const handleDecrement = () => {
    const next = Math.max(min, Math.round((value - step) * 100) / 100);
    onChange(next);
  };

  const handleIncrement = () => {
    const next = Math.min(max, Math.round((value + step) * 100) / 100);
    onChange(next);
  };

  const buttonSize = size === 'sm' ? 28 : size === 'lg' ? 44 : 36;
  const iconSize = size === 'sm' ? 14 : size === 'lg' ? 20 : 16;
  const fontSize = size === 'sm' ? 14 : size === 'lg' ? 18 : 16;

  return (
    <View
      style={[
        styles.container,
        {
          backgroundColor: isDark ? colors.surface : '#F1F5F9',
          borderColor: colors.border,
        },
        style,
      ]}
    >
      <TouchableOpacity
        activeOpacity={0.6}
        disabled={value <= min}
        onPress={handleDecrement}
        style={[
          styles.button,
          {
            width: buttonSize,
            height: buttonSize,
            borderRadius: buttonSize / 2,
            backgroundColor: value <= min ? 'transparent' : colors.card,
          },
        ]}
      >
        <Minus
          size={iconSize}
          color={value <= min ? colors.textMuted : colors.textPrimary}
        />
      </TouchableOpacity>

      <View style={styles.valueContainer}>
        <Text
          style={[
            styles.valueText,
            { fontSize, color: colors.textPrimary },
          ]}
        >
          {Number(value.toFixed(2))}
          {unit ? <Text style={{ fontSize: fontSize - 3, color: colors.textSecondary }}> {unit}</Text> : null}
        </Text>
      </View>

      <TouchableOpacity
        activeOpacity={0.6}
        disabled={value >= max}
        onPress={handleIncrement}
        style={[
          styles.button,
          {
            width: buttonSize,
            height: buttonSize,
            borderRadius: buttonSize / 2,
            backgroundColor: value >= max ? 'transparent' : colors.primary,
          },
        ]}
      >
        <Plus
          size={iconSize}
          color={value >= max ? colors.textMuted : '#FFFFFF'}
        />
      </TouchableOpacity>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 24,
    padding: 3,
    borderWidth: 1,
  },
  button: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonText: {
    fontSize: 18,
    fontWeight: '700',
    lineHeight: 20,
  },
  valueContainer: {
    paddingHorizontal: 12,
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 44,
  },
  valueText: {
    fontWeight: '700',
  },
});
