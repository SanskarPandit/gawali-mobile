import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Switch,
  Alert,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../../shared/theme/ThemeContext';
import { Header, Card, Badge, Button, Input, BottomSheetModal } from '../../shared/ui';
import { useAppSelector } from '../../app/store';
import { ProductItem } from '../../app/store/subscriptionSlice';
import { formatCurrency } from '../../shared/utils/formatters';

export const DairyProductsScreen: React.FC<{ navigation: any }> = () => {
  const insets = useSafeAreaInsets();
  const { colors, isDark } = useTheme();
  const { catalog } = useAppSelector((state) => state.subscription);

  const [products, setProducts] = useState<ProductItem[]>(catalog);
  const [editingProduct, setEditingProduct] = useState<ProductItem | null>(null);
  const [newPrice, setNewPrice] = useState('');

  const handleToggleStock = (id: number) => {
    Alert.alert('Stock Status Updated', 'Product availability toggled for customer subscriptions.');
  };

  const handleSavePrice = () => {
    if (!editingProduct) return;
    const priceNum = parseFloat(newPrice);
    if (isNaN(priceNum) || priceNum <= 0) {
      Alert.alert('Invalid Price', 'Please enter a valid amount.');
      return;
    }
    setProducts((prev) =>
      prev.map((p) => (p.id === editingProduct.id ? { ...p, price: priceNum } : p))
    );
    setEditingProduct(null);
    Alert.alert('Price Updated', `${editingProduct.name} rate set to ₹${priceNum}.`);
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <Header
        title="Products & Rates"
        subtitle="Manage selling rates & stock availability"
      />

      <ScrollView
        contentContainerStyle={[
          styles.scrollContent,
          { paddingBottom: insets.bottom + 90 },
        ]}
        showsVerticalScrollIndicator={false}
      >
        {products.map((item) => (
          <Card key={item.id} style={styles.productCard}>
            <View style={styles.topRow}>
              <View style={{ flex: 1 }}>
                <Text style={[styles.productName, { color: colors.textPrimary }]}>
                  {item.name}
                </Text>
                <Text style={[styles.productDesc, { color: colors.textMuted }]}>
                  {item.description}
                </Text>
              </View>
              <Badge
                label={item.isDailySubscription ? 'Daily Plan' : 'Add-on Item'}
                variant={item.isDailySubscription ? 'emerald' : 'info'}
              />
            </View>

            <View style={styles.bottomRow}>
              <View>
                <Text style={{ fontSize: 11, color: colors.textMuted }}>Selling Price</Text>
                <Text style={[styles.priceTag, { color: colors.primary }]}>
                  {formatCurrency(item.price)} <Text style={{ fontSize: 12 }}>/ {item.unit}</Text>
                </Text>
              </View>

              <View style={styles.actions}>
                <TouchableOpacity
                  onPress={() => {
                    setEditingProduct(item);
                    setNewPrice(item.price.toString());
                  }}
                  style={[styles.editBtn, { backgroundColor: isDark ? colors.surface : '#F1F5F9' }]}
                >
                  <Text style={{ fontSize: 13, fontWeight: '600', color: colors.textPrimary }}>
                    ✏️ Edit Rate
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          </Card>
        ))}
      </ScrollView>

      {/* Edit Rate Bottom Sheet Modal */}
      {editingProduct && (
        <BottomSheetModal
          visible={!!editingProduct}
          onClose={() => setEditingProduct(null)}
          title={`Edit Rate for ${editingProduct.name}`}
          subtitle={`Current rate: ₹${editingProduct.price}/${editingProduct.unit}`}
        >
          <View style={{ paddingVertical: 12 }}>
            <Input
              label={`New Rate per ${editingProduct.unit} (₹)`}
              placeholder="e.g. 70"
              keyboardType="numeric"
              value={newPrice}
              onChangeText={setNewPrice}
            />

            <Button
              title="Save & Update Subscriptions"
              variant="primary"
              onPress={handleSavePrice}
              style={{ marginTop: 16 }}
            />
          </View>
        </BottomSheetModal>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
    gap: 12,
  },
  productCard: {
    padding: 16,
    gap: 12,
  },
  topRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 10,
  },
  productName: {
    fontSize: 16,
    fontWeight: '700',
  },
  productDesc: {
    fontSize: 12,
    marginTop: 4,
    lineHeight: 16,
  },
  bottomRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(0,0,0,0.06)',
  },
  priceTag: {
    fontSize: 18,
    fontWeight: '800',
  },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  editBtn: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
  },
});
