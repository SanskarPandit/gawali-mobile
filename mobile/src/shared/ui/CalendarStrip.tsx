import React from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet } from 'react-native';
import { format, addDays, isSameDay } from 'date-fns';
import { useTheme } from '../theme/ThemeContext';

export interface DayItem {
  date: Date;
  quantity?: number;
  status?: 'delivered' | 'skipped' | 'scheduled' | 'overridden';
}

interface CalendarStripProps {
  selectedDate: Date;
  onSelectDate: (date: Date) => void;
  daysCount?: number;
  startDate?: Date;
  statusMap?: Record<string, { quantity: number; status: string }>;
}

export const CalendarStrip: React.FC<CalendarStripProps> = ({
  selectedDate,
  onSelectDate,
  daysCount = 14,
  startDate = addDays(new Date(), -2),
  statusMap = {},
}) => {
  const { colors, isDark } = useTheme();

  const days: Date[] = [];
  for (let i = 0; i < daysCount; i++) {
    days.push(addDays(startDate, i));
  }

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.scrollContent}
    >
      {days.map((day) => {
        const isSelected = isSameDay(day, selectedDate);
        const isToday = isSameDay(day, new Date());
        const dateKey = format(day, 'yyyy-MM-dd');
        const dayInfo = statusMap[dateKey];

        const dayName = format(day, 'EEE');
        const dayNum = format(day, 'd');

        return (
          <TouchableOpacity
            key={dateKey}
            activeOpacity={0.7}
            onPress={() => onSelectDate(day)}
            style={[
              styles.dayBox,
              {
                backgroundColor: isSelected
                  ? colors.primary
                  : isDark
                  ? colors.surface
                  : '#FFFFFF',
                borderColor: isToday && !isSelected
                  ? colors.primary
                  : colors.border,
                borderWidth: isToday || isSelected ? 1.5 : 1,
              },
            ]}
          >
            <Text
              style={[
                styles.dayName,
                {
                  color: isSelected
                    ? '#FFFFFF'
                    : isToday
                    ? colors.primary
                    : colors.textSecondary,
                },
              ]}
            >
              {dayName}
            </Text>

            <Text
              style={[
                styles.dayNum,
                {
                  color: isSelected ? '#FFFFFF' : colors.textPrimary,
                },
              ]}
            >
              {dayNum}
            </Text>

            {dayInfo ? (
              <View style={styles.indicatorContainer}>
                {dayInfo.quantity === 0 ? (
                  <View style={[styles.statusDot, { backgroundColor: '#EF4444' }]} />
                ) : (
                  <Text
                    style={[
                      styles.qtyBadge,
                      { color: isSelected ? '#FFFFFF' : colors.primary },
                    ]}
                  >
                    {dayInfo.quantity}L
                  </Text>
                )}
              </View>
            ) : (
              <View style={styles.emptyDotPlaceholder} />
            )}
          </TouchableOpacity>
        );
      })}
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  scrollContent: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    gap: 8,
  },
  dayBox: {
    width: 54,
    height: 78,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  dayName: {
    fontSize: 11,
    fontWeight: '600',
    textTransform: 'uppercase',
  },
  dayNum: {
    fontSize: 18,
    fontWeight: '700',
    marginVertical: 4,
  },
  indicatorContainer: {
    height: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  qtyBadge: {
    fontSize: 10,
    fontWeight: '700',
  },
  emptyDotPlaceholder: {
    height: 14,
  },
});
