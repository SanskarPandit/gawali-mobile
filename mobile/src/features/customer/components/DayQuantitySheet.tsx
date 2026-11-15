import React, { useEffect, useState } from 'react';
import { Alert, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { format, parseISO } from 'date-fns';
import { BottomSheetModal, Button, QuantityStepper } from '../../../shared/ui';
import { errorMessage } from '../../../shared/ui/QueryStates';
import { useTheme } from '../../../shared/theme/ThemeContext';
import { useRemoveDayChangeMutation, useSetDayQuantityMutation } from '../../../shared/api/gawaliApi';
import { formatQuantity } from '../../../shared/utils/formatters';

export interface DayTarget {
  date: string; // YYYY-MM-DD
  quantity: number; // currently scheduled
  overrideId: string | null;
}

interface Props {
  target: DayTarget | null;
  defaultQuantity: number;
  unit: string;
  onClose: () => void;
}

/** Change one future day: skip, normal, double or a custom quantity. */
export const DayQuantitySheet: React.FC<Props> = ({ target, defaultQuantity, unit, onClose }) => {
  const { colors } = useTheme();
  const { t } = useTranslation();
  const [qty, setQty] = useState(defaultQuantity);
  const [setDay, { isLoading: saving }] = useSetDayQuantityMutation();
  const [removeChange, { isLoading: resetting }] = useRemoveDayChangeMutation();

  useEffect(() => {
    if (target) setQty(target.quantity);
  }, [target]);

  if (!target) return null;
  const busy = saving || resetting;

  const save = async (quantity: number) => {
    try {
      await setDay({ date: target.date, quantity: quantity.toFixed(2) }).unwrap();
      onClose();
    } catch (e) {
      Alert.alert(t('customer_calendar.not_saved', 'Not saved'), errorMessage(e));
    }
  };

  const reset = async () => {
    if (!target.overrideId) return;
    try {
      await removeChange(target.overrideId).unwrap();
      onClose();
    } catch (e) {
      Alert.alert(t('customer_calendar.not_saved', 'Not saved'), errorMessage(e));
    }
  };

  const presets = [
    { label: t('customer_calendar.skip', 'Skip'), value: 0 },
    { label: t('customer_calendar.normal', 'Normal'), value: defaultQuantity },
    { label: t('customer_calendar.double', 'Double'), value: defaultQuantity * 2 },
  ];

  return (
    <BottomSheetModal
      visible
      onClose={() => !busy && onClose()}
      title={format(parseISO(target.date), 'EEEE, d MMMM')}
      subtitle={t('customer_calendar.normal_qty', 'Your normal quantity is {{qty}}', { qty: formatQuantity(defaultQuantity, unit) })}
    >
      <View style={styles.body}>
        <View style={styles.presets}>
          {presets.map((p) => {
            const active = qty === p.value;
            return (
              <TouchableOpacity
                key={p.label}
                onPress={() => setQty(p.value)}
                style={[styles.preset, { borderColor: active ? colors.primary : colors.border }, active && { backgroundColor: colors.primary }]}
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
              >
                <Text style={[styles.presetLabel, { color: active ? '#FFFFFF' : colors.textPrimary }]}>{p.label}</Text>
                <Text style={[styles.presetQty, { color: active ? '#FFFFFF' : colors.textMuted }]}>{formatQuantity(p.value, unit)}</Text>
              </TouchableOpacity>
            );
          })}
        </View>

        <View style={styles.stepper}>
          <QuantityStepper value={qty} onChange={setQty} step={0.5} min={0} max={20} unit={unit} size="lg" />
        </View>

        <Button
          title={qty === 0 ? t('customer_calendar.confirm_skip', 'Skip this day') : t('customer_calendar.save_qty', 'Save {{qty}}', { qty: formatQuantity(qty, unit) })}
          onPress={() => save(qty)}
          loading={saving}
          disabled={busy || qty === target.quantity}
        />
        {target.overrideId ? (
          <Button
            title={t('customer_calendar.reset', 'Back to normal ({{qty}})', { qty: formatQuantity(defaultQuantity, unit) })}
            variant="ghost"
            onPress={reset}
            loading={resetting}
            disabled={busy}
          />
        ) : null}
      </View>
    </BottomSheetModal>
  );
};

const styles = StyleSheet.create({
  body: {
    gap: 14,
  },
  presets: {
    flexDirection: 'row',
    gap: 8,
  },
  preset: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1,
  },
  presetLabel: {
    fontSize: 13,
    fontWeight: '700',
  },
  presetQty: {
    fontSize: 11,
    marginTop: 2,
  },
  stepper: {
    alignItems: 'center',
    paddingVertical: 4,
  },
});
