import React, { useState } from 'react';
import { Alert, ScrollView, StyleSheet, Switch, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { Milk, Package, Plus } from 'lucide-react-native';
import { useTheme } from '../../shared/theme/ThemeContext';
import { Badge, BottomSheetModal, Button, Card, EmptyState, Header, Input, LoadState, StaleBanner, usePullToRefresh } from '../../shared/ui';
import { errorMessage, fieldErrorsOf } from '../../shared/ui/QueryStates';
import {
  useCreateProductMutation,
  useDeleteProductMutation,
  useGetProductsQuery,
  useUpdateProductMutation,
} from '../../shared/api/gawaliApi';
import type { Product, ProductKind } from '../../shared/api/types';
import { formatCurrency } from '../../shared/utils/formatters';

interface Draft {
  id?: string;
  name: string;
  unit: string;
  price: string;
  kind: ProductKind;
  available: boolean;
  description: string;
}

const EMPTY: Draft = { name: '', unit: 'L', price: '', kind: 'subscription', available: true, description: '' };

export const DairyProductsScreen: React.FC<{ navigation: any }> = () => {
  const insets = useSafeAreaInsets();
  const { colors, isDark } = useTheme();
  const { t } = useTranslation();
  const products = useGetProductsQuery();
  const [create, createState] = useCreateProductMutation();
  const [update, updateState] = useUpdateProductMutation();
  const [remove] = useDeleteProductMutation();
  const refreshControl = usePullToRefresh(products.refetch);
  const [draft, setDraft] = useState<Draft | null>(null);

  const saving = createState.isLoading || updateState.isLoading;
  const fieldErrors = fieldErrorsOf(draft?.id ? updateState.error : createState.error);

  const open = (p?: Product) => {
    createState.reset();
    updateState.reset();
    setDraft(
      p
        ? { id: p.id, name: p.name, unit: p.unit, price: p.price_per_unit, kind: p.kind, available: p.is_available, description: p.description }
        : EMPTY
    );
  };

  const save = async () => {
    if (!draft) return;
    const body = {
      name: draft.name.trim(),
      unit: draft.unit.trim(),
      price_per_unit: draft.price.trim(),
      kind: draft.kind,
      is_available: draft.available,
      description: draft.description.trim(),
    };
    try {
      if (draft.id) await update({ id: draft.id, ...body }).unwrap();
      else await create(body).unwrap();
      setDraft(null);
    } catch (e) {
      if (!Object.keys(fieldErrorsOf(e)).length) Alert.alert(t('dairy.not_updated', 'Not updated'), errorMessage(e));
    }
  };

  const confirmRemove = () => {
    if (!draft?.id) return;
    Alert.alert(
      t('dairy.remove_product', 'Remove {{name}}?', { name: draft.name }),
      t('dairy.remove_product_body', 'It disappears from the store. Existing bills keep their history.'),
      [
        { text: t('common.cancel', 'Cancel'), style: 'cancel' },
        {
          text: t('admin_dashboard.delete_btn', 'Delete'),
          style: 'destructive',
          onPress: async () => {
            try {
              await remove(draft.id!).unwrap();
              setDraft(null);
            } catch (e) {
              Alert.alert(errorMessage(e));
            }
          },
        },
      ]
    );
  };

  const toggleAvailable = (p: Product, value: boolean) => {
    update({ id: p.id, is_available: value }).unwrap().catch((e) => Alert.alert(errorMessage(e)));
  };

  const groups: { kind: ProductKind; title: string; sub: string }[] = [
    { kind: 'subscription', title: t('dairy.daily_products', 'Daily milk'), sub: t('dairy.daily_products_sub', 'Customers subscribe to these') },
    { kind: 'one_time', title: t('dairy.extra_products', 'Extras'), sub: t('dairy.extra_products_sub', 'Ordered occasionally from the store') },
  ];

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <Header
        title={t('dairy.products', 'Products')}
        subtitle={t('dairy.products_sub', 'Prices and availability')}
        rightAction={<Button title={t('dairy.add', 'Add')} icon={<Plus size={14} color="#FFFFFF" />} size="sm" onPress={() => open()} />}
      />
      <LoadState isLoading={products.isLoading} error={products.error} hasData={!!products.data} onRetry={products.refetch}>
        <ScrollView contentContainerStyle={[styles.scroll, { paddingBottom: insets.bottom + 100 }]} refreshControl={refreshControl}>
          <StaleBanner error={products.error} />
          {(products.data ?? []).length === 0 ? (
            <EmptyState
              icon={<Package size={36} color={colors.textMuted} />}
              title={t('dairy.no_products', 'No products yet')}
              body={t('dairy.no_products_body', 'Add your milk first so you can start customer plans.')}
              action={<Button title={t('dairy.add_product', 'Add a product')} onPress={() => open()} />}
            />
          ) : (
            groups.map((g) => {
              const items = (products.data ?? []).filter((p) => p.kind === g.kind);
              if (!items.length) return null;
              return (
                <View key={g.kind} style={{ gap: 8 }}>
                  <Text style={[styles.heading, { color: colors.textPrimary }]}>{g.title}</Text>
                  <Text style={[styles.muted, { color: colors.textMuted }]}>{g.sub}</Text>
                  {items.map((p) => (
                    <Card key={p.id} style={styles.row} onPress={() => open(p)}>
                      <View style={[styles.icon, { backgroundColor: isDark ? colors.surface : '#ECFDF5' }]}>
                        {p.kind === 'subscription' ? <Milk size={18} color={colors.primary} /> : <Package size={18} color={colors.primary} />}
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={[styles.name, { color: colors.textPrimary }]}>{p.name}</Text>
                        <Text style={[styles.price, { color: colors.primary }]}>
                          {formatCurrency(p.price_per_unit)} / {p.unit}
                        </Text>
                      </View>
                      {!p.is_available && <Badge label={t('dairy.hidden', 'Hidden')} variant="neutral" size="sm" />}
                      <Switch
                        value={p.is_available}
                        onValueChange={(v) => toggleAvailable(p, v)}
                        trackColor={{ true: colors.primary, false: colors.border }}
                        accessibilityLabel={t('dairy.available', 'Available')}
                      />
                    </Card>
                  ))}
                </View>
              );
            })
          )}
        </ScrollView>
      </LoadState>

      <BottomSheetModal
        visible={!!draft}
        onClose={() => !saving && setDraft(null)}
        title={draft?.id ? t('dairy.edit_product', 'Edit product') : t('dairy.add_product', 'Add a product')}
      >
        {draft && (
          <ScrollView style={{ maxHeight: 520 }} keyboardShouldPersistTaps="handled">
            <View style={{ gap: 10 }}>
              <View style={styles.kindRow}>
                {(['subscription', 'one_time'] as const).map((k) => {
                  const active = draft.kind === k;
                  return (
                    <TouchableOpacity
                      key={k}
                      onPress={() => setDraft({ ...draft, kind: k })}
                      style={[styles.kind, { borderColor: active ? colors.primary : colors.border }, active && { backgroundColor: colors.primary }]}
                    >
                      <Text style={{ fontWeight: '700', color: active ? '#FFFFFF' : colors.textSecondary }}>
                        {k === 'subscription' ? t('dairy.daily_products', 'Daily milk') : t('dairy.extra_products', 'Extras')}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
              <Input label={t('dairy.product_name', 'Name')} placeholder="e.g. A2 Cow Milk" value={draft.name} onChangeText={(v) => setDraft({ ...draft, name: v })} error={fieldErrors.name} />
              <View style={styles.pair}>
                <View style={{ flex: 1 }}>
                  <Input label={t('dairy.unit', 'Unit')} placeholder="L, 500g, pack" value={draft.unit} onChangeText={(v) => setDraft({ ...draft, unit: v })} error={fieldErrors.unit} />
                </View>
                <View style={{ flex: 1 }}>
                  <Input
                    label={t('dairy.price', 'Price (₹)')}
                    value={draft.price}
                    onChangeText={(v) => setDraft({ ...draft, price: v.replace(/[^0-9.]/g, '') })}
                    keyboardType="decimal-pad"
                    error={fieldErrors.price_per_unit}
                  />
                </View>
              </View>
              <Input label={t('dairy.description', 'Description (optional)')} value={draft.description} onChangeText={(v) => setDraft({ ...draft, description: v })} multiline />
              {draft.id && (
                <Text style={[styles.muted, { color: colors.textMuted }]}>
                  {t('dairy.price_note', 'A new price applies to deliveries from now on.')}
                </Text>
              )}
              <Button title={t('settings.save', 'Save changes')} onPress={save} loading={saving} disabled={!draft.name.trim() || !draft.unit.trim() || !draft.price.trim()} />
              {draft.id && <Button title={t('dairy.remove', 'Remove product')} variant="ghost" onPress={confirmRemove} textStyle={{ color: '#DC2626' }} />}
            </View>
          </ScrollView>
        )}
      </BottomSheetModal>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1 },
  scroll: { padding: 16, gap: 16 },
  heading: { fontSize: 16, fontWeight: '800' },
  muted: { fontSize: 12 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14 },
  icon: { width: 38, height: 38, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  name: { fontSize: 15, fontWeight: '700' },
  price: { fontSize: 13, fontWeight: '700', marginTop: 2 },
  kindRow: { flexDirection: 'row', gap: 8 },
  kind: { flex: 1, alignItems: 'center', paddingVertical: 10, borderRadius: 10, borderWidth: 1 },
  pair: { flexDirection: 'row', gap: 10 },
});
