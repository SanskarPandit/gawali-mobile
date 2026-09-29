import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../../shared/theme/ThemeContext';
import { Header, Card, Badge, Button, QuantityStepper } from '../../shared/ui';
import { useAppDispatch, useAppSelector } from '../../app/store';
import {
  updateDefaultPlan,
  addAddonToCart,
  removeAddonFromCart,
  clearCart,
  ProductItem,
} from '../../app/store/subscriptionSlice';
import { formatCurrency } from '../../shared/utils/formatters';

export const CustomerShopScreen: React.FC<{ navigation: any }> = ({ navigation }) => {
  const insets = useSafeAreaInsets();
  const { colors, isDark } = useTheme();
  const dispatch = useAppDispatch();
  const { defaultPlan, catalog, cartAddons } = useAppSelector((state) => state.subscription);

  const [activeCategory, setActiveCategory] = useState<'all' | 'milk' | 'ghee' | 'paneer' | 'curd'>('all');

  const dailyPlans = catalog.filter((p) => p.isDailySubscription);
  const addonProducts = catalog.filter((p) => !p.isDailySubscription);

  const filteredAddons = addonProducts.filter((p) => {
    if (activeCategory === 'all') return true;
    if (activeCategory === 'milk') return p.category.includes('milk');
    if (activeCategory === 'ghee') return p.category === 'ghee';
    if (activeCategory === 'paneer') return p.category === 'paneer';
    if (activeCategory === 'curd') return p.category === 'curd';
    return true;
  });

  const cartTotalAmount = cartAddons.reduce(
    (sum, item) => sum + item.product.price * item.quantity,
    0
  );

  const handleUpdateDailyMilk = (prod: ProductItem, qty: number) => {
    dispatch(updateDefaultPlan({ productId: prod.id, quantity: qty }));
    Alert.alert('Subscription Updated', `Your daily delivery is set to ${qty}L of ${prod.name}.`);
  };

  const handleAddToCart = (product: ProductItem) => {
    dispatch(addAddonToCart({ product, quantity: 1 }));
  };

  const handleCheckoutCart = () => {
    Alert.alert(
      'Order Confirmed!',
      `Added ${cartAddons.length} item(s) to tomorrow's delivery. Total ₹${cartTotalAmount} will be added to your month-end Gawali bill.`,
      [
        {
          text: 'Great',
          onPress: () => dispatch(clearCart()),
        },
      ]
    );
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <Header
        title="Store & Add-ons"
        subtitle="Manage daily plan & order fresh dairy"
      />

      <ScrollView
        contentContainerStyle={[
          styles.scrollContent,
          { paddingBottom: insets.bottom + (cartAddons.length > 0 ? 140 : 90) },
        ]}
        showsVerticalScrollIndicator={false}
      >
        {/* Section 1: Daily Milk Plan Selection */}
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>
            Your Daily Milk Plan
          </Text>
          <Text style={[styles.sectionSubtitle, { color: colors.textSecondary }]}>
            Delivered fresh every morning before 7:00 AM
          </Text>

          <View style={styles.dailyPlansList}>
            {dailyPlans.map((plan) => {
              const isSelected = defaultPlan.productId === plan.id;

              return (
                <Card
                  key={plan.id}
                  style={[
                    styles.dailyPlanCard,
                    isSelected && { borderColor: colors.primary, borderWidth: 1.5 },
                  ]}
                >
                  <View style={styles.planCardHeader}>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.planName, { color: colors.textPrimary }]}>
                        {plan.name}
                      </Text>
                      <Text style={[styles.planDesc, { color: colors.textMuted }]}>
                        {plan.description}
                      </Text>
                    </View>
                    <View style={styles.planPriceCol}>
                      <Text style={[styles.planPrice, { color: colors.primary }]}>
                        {formatCurrency(plan.price)}
                      </Text>
                      <Text style={{ fontSize: 11, color: colors.textMuted }}>per litre</Text>
                    </View>
                  </View>

                  <View style={styles.planActionRow}>
                    {isSelected ? (
                      <View style={styles.selectedRow}>
                        <Badge label="Active Plan" variant="success" />
                        <View style={styles.dailyStepper}>
                          <Text style={{ fontSize: 13, color: colors.textSecondary, marginRight: 8 }}>
                            Daily Qty:
                          </Text>
                          <QuantityStepper
                            value={defaultPlan.quantity}
                            onChange={(val) => handleUpdateDailyMilk(plan, val)}
                            step={0.5}
                            min={0.5}
                            max={10}
                            size="sm"
                          />
                        </View>
                      </View>
                    ) : (
                      <Button
                        title="Switch to This Plan"
                        variant="outline"
                        size="sm"
                        onPress={() => handleUpdateDailyMilk(plan, 1.0)}
                      />
                    )}
                  </View>
                </Card>
              );
            })}
          </View>
        </View>

        {/* Section 2: Farm-Fresh Addons */}
        <View style={styles.section}>
          <View style={styles.addonSectionHeader}>
            <View>
              <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>
                Fresh Dairy Add-ons
              </Text>
              <Text style={[styles.sectionSubtitle, { color: colors.textSecondary }]}>
                Delivered with your morning milk • Pay at month end
              </Text>
            </View>
          </View>

          {/* Categories */}
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.catScroll}>
            {(['all', 'ghee', 'paneer', 'curd'] as const).map((cat) => (
              <TouchableOpacity
                key={cat}
                onPress={() => setActiveCategory(cat)}
                style={[
                  styles.catTab,
                  activeCategory === cat && { backgroundColor: colors.primary },
                ]}
              >
                <Text
                  style={[
                    styles.catTabText,
                    { color: activeCategory === cat ? '#FFFFFF' : colors.textSecondary },
                  ]}
                >
                  {cat === 'all'
                    ? 'All Items'
                    : cat === 'ghee'
                    ? 'A2 Ghee'
                    : cat === 'paneer'
                    ? 'Fresh Paneer'
                    : 'Curd / Dahi'}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>

          {/* Addon Products List */}
          <View style={styles.addonGrid}>
            {filteredAddons.map((item) => {
              const inCart = cartAddons.find((c) => c.product.id === item.id);

              return (
                <Card key={item.id} style={styles.addonCard}>
                  <View style={styles.addonContent}>
                    <Text style={[styles.addonName, { color: colors.textPrimary }]}>
                      {item.name}
                    </Text>
                    <Text numberOfLines={2} style={[styles.addonDesc, { color: colors.textMuted }]}>
                      {item.description}
                    </Text>

                    <View style={styles.addonBottom}>
                      <View>
                        <Text style={[styles.addonPrice, { color: colors.textPrimary }]}>
                          {formatCurrency(item.price)}
                        </Text>
                        <Text style={{ fontSize: 11, color: colors.textMuted }}>per {item.unit}</Text>
                      </View>

                      {inCart ? (
                        <View style={styles.cartStepperRow}>
                          <TouchableOpacity
                            onPress={() => dispatch(removeAddonFromCart(item.id))}
                            style={[styles.miniBtn, { backgroundColor: isDark ? colors.surface : '#F1F5F9' }]}
                          >
                            <Text style={{ color: colors.textPrimary, fontWeight: '700' }}>−</Text>
                          </TouchableOpacity>
                          <Text style={{ fontWeight: '700', marginHorizontal: 8, color: colors.textPrimary }}>
                            {inCart.quantity}
                          </Text>
                          <TouchableOpacity
                            onPress={() => handleAddToCart(item)}
                            style={[styles.miniBtn, { backgroundColor: colors.primary }]}
                          >
                            <Text style={{ color: '#FFFFFF', fontWeight: '700' }}>+</Text>
                          </TouchableOpacity>
                        </View>
                      ) : (
                        <Button
                          title="+ Add"
                          variant="outline"
                          size="sm"
                          onPress={() => handleAddToCart(item)}
                          style={{ minWidth: 70 }}
                        />
                      )}
                    </View>
                  </View>
                </Card>
              );
            })}
          </View>
        </View>
      </ScrollView>

      {/* Floating Cart Bar if items added */}
      {cartAddons.length > 0 && (
        <View
          style={[
            styles.floatingCart,
            {
              backgroundColor: colors.card,
              bottom: insets.bottom + 65,
              borderColor: colors.cardBorder,
            },
          ]}
        >
          <View>
            <Text style={{ fontSize: 12, color: colors.textSecondary }}>
              {cartAddons.reduce((s, i) => s + i.quantity, 0)} item(s) for tomorrow
            </Text>
            <Text style={{ fontSize: 18, fontWeight: '800', color: colors.textPrimary }}>
              {formatCurrency(cartTotalAmount)}
            </Text>
          </View>

          <Button
            title="Order with Delivery ›"
            variant="primary"
            size="md"
            onPress={handleCheckoutCart}
          />
        </View>
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
    gap: 24,
  },
  section: {
    gap: 12,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '800',
    letterSpacing: -0.3,
  },
  sectionSubtitle: {
    fontSize: 13,
  },
  dailyPlansList: {
    gap: 12,
    marginTop: 4,
  },
  dailyPlanCard: {
    padding: 16,
    gap: 14,
  },
  planCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
  },
  planName: {
    fontSize: 16,
    fontWeight: '700',
  },
  planDesc: {
    fontSize: 12,
    marginTop: 4,
    lineHeight: 16,
  },
  planPriceCol: {
    alignItems: 'flex-end',
  },
  planPrice: {
    fontSize: 18,
    fontWeight: '800',
  },
  planActionRow: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(0,0,0,0.06)',
    paddingTop: 12,
  },
  selectedRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  dailyStepper: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  addonSectionHeader: {
    marginBottom: 4,
  },
  catScroll: {
    gap: 8,
    paddingVertical: 4,
  },
  catTab: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 20,
    backgroundColor: 'rgba(0,0,0,0.05)',
  },
  catTabText: {
    fontSize: 13,
    fontWeight: '600',
  },
  addonGrid: {
    gap: 12,
    marginTop: 8,
  },
  addonCard: {
    padding: 14,
  },
  addonContent: {
    gap: 6,
  },
  addonName: {
    fontSize: 15,
    fontWeight: '700',
  },
  addonDesc: {
    fontSize: 12,
    lineHeight: 16,
  },
  addonBottom: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 8,
  },
  addonPrice: {
    fontSize: 16,
    fontWeight: '800',
  },
  cartStepperRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  miniBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  floatingCart: {
    position: 'absolute',
    left: 16,
    right: 16,
    padding: 14,
    borderRadius: 18,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderWidth: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 10,
    elevation: 8,
  },
});
