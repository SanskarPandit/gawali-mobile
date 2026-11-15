import React, { useCallback, useState } from 'react';
import { ActivityIndicator, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { CloudOff, RefreshCw } from 'lucide-react-native';
import { useTheme } from '../theme/ThemeContext';
import { Button } from './Button';
import type { ApiError } from '../api/baseQuery';

/** Message for any RTK Query error, including ones thrown by `.unwrap()`. */
export const errorMessage = (error: unknown, fallback = 'Something went wrong. Please try again.'): string => {
  const e = error as Partial<ApiError> | undefined;
  return (e && typeof e.message === 'string' && e.message) || fallback;
};

export const fieldErrorsOf = (error: unknown): Record<string, string> =>
  ((error as Partial<ApiError> | undefined)?.fieldErrors as Record<string, string>) ?? {};

interface LoadStateProps {
  isLoading: boolean;
  error?: unknown;
  /** True when data exists; errors then only show as a slim banner, not a full screen. */
  hasData: boolean;
  onRetry: () => void;
  children: React.ReactNode;
}

/** Full-screen loading and error states for a screen's primary query. */
export const LoadState: React.FC<LoadStateProps> = ({ isLoading, error, hasData, onRetry, children }) => {
  const { colors } = useTheme();
  const { t } = useTranslation();

  if (isLoading && !hasData) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }
  if (error && !hasData) {
    const offline = (error as ApiError).status === 'NETWORK';
    return (
      <View style={styles.center}>
        <CloudOff size={36} color={colors.textMuted} />
        <Text style={[styles.title, { color: colors.textPrimary }]}>
          {offline ? t('common.offline_title', 'You are offline') : t('common.error_title', 'Could not load this')}
        </Text>
        <Text style={[styles.body, { color: colors.textSecondary }]}>{errorMessage(error)}</Text>
        <Button
          title={t('common.retry', 'Try again')}
          icon={<RefreshCw size={14} color={colors.primary} />}
          variant="outline"
          size="sm"
          onPress={onRetry}
        />
      </View>
    );
  }
  return <>{children}</>;
};

/** Slim notice shown above cached data when a refresh failed. */
export const StaleBanner: React.FC<{ error?: unknown }> = ({ error }) => {
  const { t } = useTranslation();
  if (!error) return null;
  return (
    <View style={styles.banner}>
      <CloudOff size={14} color="#92400E" />
      <Text style={styles.bannerText}>
        {t('common.stale', 'Showing saved data. Pull down to refresh.')}
      </Text>
    </View>
  );
};

/** Pull-to-refresh that shows the spinner only for user-initiated refreshes. */
export const usePullToRefresh = (refetch: () => unknown) => {
  const [refreshing, setRefreshing] = useState(false);
  const { colors } = useTheme();
  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await refetch();
    } finally {
      setRefreshing(false);
    }
  }, [refetch]);
  return <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} colors={[colors.primary]} />;
};

interface EmptyStateProps {
  icon?: React.ReactNode;
  title: string;
  body?: string;
  action?: React.ReactNode;
}

export const EmptyState: React.FC<EmptyStateProps> = ({ icon, title, body, action }) => {
  const { colors } = useTheme();
  return (
    <View style={styles.empty}>
      {icon}
      <Text style={[styles.title, { color: colors.textPrimary }]}>{title}</Text>
      {body ? <Text style={[styles.body, { color: colors.textSecondary }]}>{body}</Text> : null}
      {action}
    </View>
  );
};

const styles = StyleSheet.create({
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
    gap: 12,
  },
  empty: {
    alignItems: 'center',
    paddingVertical: 32,
    paddingHorizontal: 16,
    gap: 10,
  },
  title: {
    fontSize: 16,
    fontWeight: '700',
    textAlign: 'center',
  },
  body: {
    fontSize: 13,
    lineHeight: 19,
    textAlign: 'center',
  },
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: '#FEF3C7',
  },
  bannerText: {
    flex: 1,
    fontSize: 12,
    fontWeight: '600',
    color: '#92400E',
  },
});
