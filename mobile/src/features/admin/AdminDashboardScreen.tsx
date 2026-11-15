import React, { useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { Store, Users, Truck, UserRound, Plus, Search, UserPlus, Check, Ban, RefreshCw } from 'lucide-react-native';
import { useTheme } from '../../shared/theme/ThemeContext';
import { Header, Card, StatCard, Badge, Button, Input, BottomSheetModal } from '../../shared/ui';
import { useAppDispatch, useAppSelector } from '../../app/store';
import {
  AdminAccount,
  createAccount,
  fetchAccounts,
  NewAccountInput,
  setAccountActive,
  setActiveAdminTab,
} from '../../app/store/adminSlice';
import type { UserRole } from '../../app/store/authSlice';
import { SettingsHeaderButton } from '../settings/SettingsHeaderButton';

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_PATTERN = /^\+?[0-9]{10,15}$/;

type UserFilter = 'all' | 'delivery_boy' | 'customer' | 'admin';

const ROLE_BADGE: Record<UserRole, { label: string; variant: 'emerald' | 'info' | 'warning' | 'error' }> = {
  customer: { label: 'Customer', variant: 'emerald' },
  dairy: { label: 'Dairy', variant: 'info' },
  delivery_boy: { label: 'Gawali', variant: 'warning' },
  admin: { label: 'Admin', variant: 'error' },
};

const emptyDairyForm = { businessName: '', fullName: '', email: '', phone: '', city: '' };
const emptyGawaliForm = { fullName: '', email: '', phone: '', dairyId: '', vehicleNumber: '' };

export const AdminDashboardScreen: React.FC<{ navigation: any }> = ({ navigation }) => {
  const insets = useSafeAreaInsets();
  const { colors, isDark } = useTheme();
  const { t } = useTranslation();
  const dispatch = useAppDispatch();
  const { user } = useAppSelector((state) => state.auth);
  const { accounts, status, error, activeTab } = useAppSelector((state) => state.admin);

  const [searchQuery, setSearchQuery] = useState('');
  const [userFilter, setUserFilter] = useState<UserFilter>('all');

  const [dairyModalVisible, setDairyModalVisible] = useState(false);
  const [dairyForm, setDairyForm] = useState(emptyDairyForm);
  const [gawaliModalVisible, setGawaliModalVisible] = useState(false);
  const [gawaliForm, setGawaliForm] = useState(emptyGawaliForm);
  const [formSubmitted, setFormSubmitted] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    dispatch(fetchAccounts());
  }, [dispatch]);

  const dairies = useMemo(() => accounts.filter((a) => a.role === 'dairy'), [accounts]);
  const activeDairies = dairies.filter((d) => d.isActive && d.dairyId);
  const stats = {
    dairies: dairies.length,
    activeDairies: activeDairies.length,
    gawalis: accounts.filter((a) => a.role === 'delivery_boy').length,
    customers: accounts.filter((a) => a.role === 'customer').length,
    suspended: accounts.filter((a) => !a.isActive).length,
  };

  const matchesSearch = (a: AdminAccount) => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return true;
    return [a.fullName, a.email, a.phone, a.dairyName ?? ''].some((v) => v.toLowerCase().includes(q));
  };
  const visibleAccounts =
    activeTab === 'dairies'
      ? dairies.filter(matchesSearch)
      : accounts
          .filter((a) => a.role !== 'dairy')
          .filter((a) => userFilter === 'all' || a.role === userFilter)
          .filter(matchesSearch);

  const handleToggleActive = (account: AdminAccount) => {
    const suspending = account.isActive;
    const name = account.role === 'dairy' ? account.dairyName ?? account.fullName : account.fullName;
    Alert.alert(
      suspending ? t('admin.suspend_title', 'Suspend account?') : t('admin.activate_title', 'Reactivate account?'),
      suspending
        ? t('admin.suspend_body', '{{name}} will be signed out and cannot log in until reactivated.', { name })
        : t('admin.activate_body', '{{name}} will be able to log in again.', { name }),
      [
        { text: t('common.cancel', 'Cancel'), style: 'cancel' },
        {
          text: suspending ? t('admin_dashboard.suspend_btn', 'Suspend') : t('admin_dashboard.activate_btn', 'Activate'),
          style: suspending ? 'destructive' : 'default',
          onPress: async () => {
            const result = await dispatch(setAccountActive({ id: account.id, isActive: !suspending }));
            if (setAccountActive.rejected.match(result)) {
              Alert.alert(t('settings.error_title', 'Something went wrong'), result.payload ?? '');
            }
          },
        },
      ]
    );
  };

  const openDairyModal = () => {
    setDairyForm(emptyDairyForm);
    setFormSubmitted(false);
    setFormError(null);
    setDairyModalVisible(true);
  };

  const openGawaliModal = () => {
    setGawaliForm({ ...emptyGawaliForm, dairyId: activeDairies.length === 1 ? activeDairies[0].dairyId! : '' });
    setFormSubmitted(false);
    setFormError(null);
    setGawaliModalVisible(true);
  };

  const contactErrors = (f: { fullName: string; email: string; phone: string }) => ({
    fullName: f.fullName.trim() ? undefined : t('admin.err_name', 'Enter the full name'),
    email: EMAIL_PATTERN.test(f.email.trim()) ? undefined : t('admin.err_email', 'Enter a valid email'),
    phone: PHONE_PATTERN.test(f.phone.replace(/[\s-]/g, '')) ? undefined : t('admin.err_phone', 'Enter a valid mobile number'),
  });

  const dairyErrors = {
    ...contactErrors(dairyForm),
    businessName: dairyForm.businessName.trim() ? undefined : t('admin.err_business', 'Enter the dairy name'),
  };
  const gawaliErrors = {
    ...contactErrors(gawaliForm),
    dairyId: gawaliForm.dairyId ? undefined : t('admin.err_dairy', 'Choose the dairy this gawali delivers for'),
  };

  const submitAccount = async (input: NewAccountInput, close: () => void) => {
    setSubmitting(true);
    setFormError(null);
    const result = await dispatch(createAccount(input));
    setSubmitting(false);
    if (createAccount.rejected.match(result)) {
      setFormError(result.payload ?? t('settings.error_title', 'Something went wrong'));
      return;
    }
    close();
    const { account, temporaryPassword } = result.payload;
    Alert.alert(
      t('admin.created_title', 'Account created'),
      t(
        'admin.created_body',
        'Share these sign-in details with {{name}} privately. This password is shown only once; they should change it in Settings after signing in.\n\nEmail: {{email}}\nTemporary password: {{password}}',
        { name: account.fullName, email: account.email, password: temporaryPassword }
      )
    );
  };

  const handleCreateDairy = () => {
    setFormSubmitted(true);
    if (Object.values(dairyErrors).some(Boolean)) return;
    submitAccount(
      {
        role: 'dairy',
        businessName: dairyForm.businessName,
        fullName: dairyForm.fullName,
        email: dairyForm.email,
        phone: dairyForm.phone.replace(/[\s-]/g, ''),
        city: dairyForm.city,
      },
      () => setDairyModalVisible(false)
    );
  };

  const handleCreateGawali = () => {
    setFormSubmitted(true);
    if (Object.values(gawaliErrors).some(Boolean)) return;
    submitAccount(
      {
        role: 'delivery_boy',
        fullName: gawaliForm.fullName,
        email: gawaliForm.email,
        phone: gawaliForm.phone.replace(/[\s-]/g, ''),
        dairyId: gawaliForm.dairyId,
        vehicleNumber: gawaliForm.vehicleNumber,
      },
      () => setGawaliModalVisible(false)
    );
  };

  const shownError = (errors: Record<string, string | undefined>, field: string) =>
    formSubmitted ? errors[field] : undefined;

  const renderAccount = (a: AdminAccount) => {
    const isDairy = a.role === 'dairy';
    const manageable = a.role === 'dairy' || a.role === 'delivery_boy';
    const badge = ROLE_BADGE[a.role];
    return (
      <Card key={a.id} style={styles.accountCard}>
        <View style={styles.cardTop}>
          <View style={{ flex: 1 }}>
            <View style={styles.nameRow}>
              <Text style={[styles.accountName, { color: colors.textPrimary }]} numberOfLines={1}>
                {isDairy ? a.dairyName ?? a.fullName : a.fullName}
              </Text>
              {!isDairy && <Badge label={badge.label} variant={badge.variant} size="sm" />}
            </View>
            <Text style={[styles.accountMeta, { color: colors.textSecondary }]} numberOfLines={1}>
              {isDairy
                ? `${t('admin.owner', 'Owner')}: ${a.fullName}`
                : a.role === 'delivery_boy' && a.dairyName
                  ? `${t('admin.delivers_for', 'Delivers for')} ${a.dairyName}`
                  : a.email}
            </Text>
            <Text style={[styles.accountContact, { color: colors.textMuted }]} numberOfLines={1}>
              {isDairy || a.role === 'delivery_boy' ? `${a.phone} • ${a.email}` : a.phone}
            </Text>
          </View>
          <Badge
            label={a.isActive ? t('admin_dashboard.active_badge', 'Active') : t('admin_dashboard.suspended_badge', 'Suspended')}
            variant={a.isActive ? 'success' : 'error'}
          />
        </View>

        <View style={styles.cardFooter}>
          <Text style={{ fontSize: 11, color: colors.textMuted }}>
            {t('admin.added_on', 'Added')} {a.createdAt}
          </Text>
          {manageable ? (
            <TouchableOpacity
              onPress={() => handleToggleActive(a)}
              style={[
                styles.toggleBtn,
                { backgroundColor: a.isActive ? (isDark ? colors.surface : '#FEE2E2') : isDark ? colors.surface : '#ECFDF5' },
              ]}
              accessibilityRole="button"
            >
              {a.isActive ? <Ban size={13} color="#EF4444" /> : <Check size={13} color={colors.primary} />}
              <Text style={{ fontSize: 12, fontWeight: '700', color: a.isActive ? '#EF4444' : colors.primary }}>
                {a.isActive ? t('admin_dashboard.suspend_btn', 'Suspend') : t('admin_dashboard.activate_btn', 'Activate')}
              </Text>
            </TouchableOpacity>
          ) : null}
        </View>
      </Card>
    );
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <Header
        title={t('admin_dashboard.title', 'Admin Console')}
        subtitle={`${t('admin_dashboard.logged_in_as', 'Logged in as')} ${user?.fullName ?? ''}`}
        rightAction={<SettingsHeaderButton onPress={() => navigation.navigate('AdminSettings')} />}
      />

      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <ScrollView
          contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 32 }]}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.statGrid}>
            <View style={styles.statRow}>
              <StatCard
                title={t('admin.stat_dairies', 'Dairies')}
                value={`${stats.activeDairies} / ${stats.dairies}`}
                subtitle={t('admin.stat_dairies_sub', 'active / total')}
                icon={<Store size={18} color={colors.primary} />}
                style={{ marginRight: 8 }}
              />
              <StatCard
                title={t('admin.stat_gawalis', 'Gawalis')}
                value={`${stats.gawalis}`}
                subtitle={t('admin.stat_gawalis_sub', 'delivery staff')}
                icon={<Truck size={18} color={colors.primary} />}
                style={{ marginLeft: 8 }}
              />
            </View>
            <View style={styles.statRow}>
              <StatCard
                title={t('admin.stat_customers', 'Customers')}
                value={`${stats.customers}`}
                subtitle={t('admin.stat_customers_sub', 'households')}
                icon={<Users size={18} color={colors.primary} />}
                style={{ marginRight: 8 }}
              />
              <StatCard
                title={t('admin.stat_suspended', 'Suspended')}
                value={`${stats.suspended}`}
                subtitle={t('admin.stat_suspended_sub', 'accounts')}
                icon={<Ban size={18} color={colors.primary} />}
                style={{ marginLeft: 8 }}
              />
            </View>
          </View>

          <View style={[styles.tabBar, { backgroundColor: isDark ? colors.surface : 'rgba(0,0,0,0.05)' }]}>
            {(['dairies', 'users'] as const).map((tab) => {
              const active = activeTab === tab;
              const Icon = tab === 'dairies' ? Store : UserRound;
              return (
                <TouchableOpacity
                  key={tab}
                  onPress={() => dispatch(setActiveAdminTab(tab))}
                  style={[styles.tabItem, active && { backgroundColor: colors.primary }]}
                  accessibilityRole="tab"
                  accessibilityState={{ selected: active }}
                >
                  <View style={styles.tabInner}>
                    <Icon size={14} color={active ? '#FFFFFF' : colors.textSecondary} />
                    <Text style={[styles.tabText, { color: active ? '#FFFFFF' : colors.textSecondary }]}>
                      {tab === 'dairies'
                        ? `${t('admin_dashboard.tab_dairies', 'Dairies')} (${dairies.length})`
                        : `${t('admin_dashboard.tab_users', 'Users')} (${accounts.length - dairies.length})`}
                    </Text>
                  </View>
                </TouchableOpacity>
              );
            })}
          </View>

          <View style={styles.actionBar}>
            <View style={[styles.searchBox, { backgroundColor: isDark ? colors.surface : '#FFFFFF', borderColor: colors.border }]}>
              <Search size={16} color={colors.textMuted} style={{ marginRight: 8 }} />
              <TextInput
                placeholder={t('admin.search', 'Search name, email, phone')}
                placeholderTextColor={colors.textMuted}
                value={searchQuery}
                onChangeText={setSearchQuery}
                style={[styles.searchInput, { color: colors.textPrimary }]}
              />
            </View>
            {activeTab === 'dairies' ? (
              <Button
                title={t('admin.onboard_dairy', 'Onboard dairy')}
                icon={<Plus size={15} color="#FFFFFF" />}
                size="sm"
                onPress={openDairyModal}
              />
            ) : (
              <Button
                title={t('admin.add_gawali', 'Add gawali')}
                icon={<UserPlus size={15} color="#FFFFFF" />}
                size="sm"
                onPress={openGawaliModal}
              />
            )}
          </View>

          {activeTab === 'users' && (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
              {(['all', 'delivery_boy', 'customer', 'admin'] as const).map((f) => {
                const active = userFilter === f;
                const label =
                  f === 'all'
                    ? t('admin.filter_all', 'All')
                    : f === 'delivery_boy'
                      ? t('admin.filter_gawalis', 'Gawalis')
                      : f === 'customer'
                        ? t('admin.filter_customers', 'Customers')
                        : t('admin.filter_admins', 'Admins');
                return (
                  <TouchableOpacity
                    key={f}
                    onPress={() => setUserFilter(f)}
                    style={[styles.chip, { backgroundColor: active ? colors.primary : isDark ? colors.surface : 'rgba(0,0,0,0.05)' }]}
                  >
                    <Text style={[styles.chipText, { color: active ? '#FFFFFF' : colors.textSecondary }]}>{label}</Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          )}

          {status === 'loading' && accounts.length === 0 ? (
            <ActivityIndicator color={colors.primary} style={{ marginVertical: 24 }} />
          ) : status === 'failed' ? (
            <Card style={styles.messageCard}>
              <Text style={[styles.messageText, { color: colors.textSecondary }]}>{error}</Text>
              <Button
                title={t('admin.retry', 'Try again')}
                icon={<RefreshCw size={14} color={colors.primary} />}
                variant="outline"
                size="sm"
                onPress={() => dispatch(fetchAccounts())}
              />
            </Card>
          ) : visibleAccounts.length === 0 ? (
            <Card style={styles.messageCard}>
              <Text style={[styles.messageText, { color: colors.textSecondary }]}>
                {searchQuery.trim()
                  ? t('admin.no_matches', 'No accounts match your search.')
                  : activeTab === 'dairies'
                    ? t('admin.no_dairies', 'No dairies yet. Onboard the first one.')
                    : t('admin.no_users', 'No users in this category yet.')}
              </Text>
            </Card>
          ) : (
            <View style={styles.list}>{visibleAccounts.map(renderAccount)}</View>
          )}
        </ScrollView>
      </KeyboardAvoidingView>

      {/* Onboard dairy */}
      <BottomSheetModal
        visible={dairyModalVisible}
        onClose={() => !submitting && setDairyModalVisible(false)}
        title={t('admin.onboard_dairy_title', 'Onboard a dairy')}
        subtitle={t('admin.onboard_dairy_sub', 'Creates the dairy and its owner’s sign-in')}
      >
        <ScrollView style={{ maxHeight: 460 }} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
          <View style={styles.form}>
            <Input
              label={t('admin_dashboard.dairy_name_label', 'Dairy name')}
              placeholder="e.g. Govind Milk & Dairy Farm"
              value={dairyForm.businessName}
              onChangeText={(v) => setDairyForm((f) => ({ ...f, businessName: v }))}
              error={shownError(dairyErrors, 'businessName')}
            />
            <Input
              label={t('admin_dashboard.owner_name_label', 'Owner name')}
              placeholder="e.g. Govind Sanas"
              value={dairyForm.fullName}
              onChangeText={(v) => setDairyForm((f) => ({ ...f, fullName: v }))}
              error={shownError(dairyErrors, 'fullName')}
              autoCapitalize="words"
            />
            <Input
              label={t('admin.owner_email', 'Owner email (sign-in ID)')}
              placeholder="e.g. govind@dairy.com"
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
              value={dairyForm.email}
              onChangeText={(v) => setDairyForm((f) => ({ ...f, email: v }))}
              error={shownError(dairyErrors, 'email')}
            />
            <Input
              label={t('admin_dashboard.phone_label', 'Mobile number')}
              placeholder="e.g. +919876500112"
              keyboardType="phone-pad"
              value={dairyForm.phone}
              onChangeText={(v) => setDairyForm((f) => ({ ...f, phone: v }))}
              error={shownError(dairyErrors, 'phone')}
            />
            <Input
              label={t('admin_dashboard.city_label', 'City')}
              placeholder="e.g. Kothrud, Pune"
              value={dairyForm.city}
              onChangeText={(v) => setDairyForm((f) => ({ ...f, city: v }))}
            />
            {formError ? <Text style={[styles.formError, { color: colors.error }]}>{formError}</Text> : null}
            <Button
              title={t('admin.create_dairy', 'Create dairy account')}
              icon={<Check size={16} color="#FFFFFF" />}
              onPress={handleCreateDairy}
              loading={submitting}
            />
          </View>
        </ScrollView>
      </BottomSheetModal>

      {/* Add gawali */}
      <BottomSheetModal
        visible={gawaliModalVisible}
        onClose={() => !submitting && setGawaliModalVisible(false)}
        title={t('admin.add_gawali_title', 'Add a gawali')}
        subtitle={t('admin.add_gawali_sub', 'Creates a delivery account linked to a dairy')}
      >
        <ScrollView style={{ maxHeight: 460 }} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
          <View style={styles.form}>
            <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>
              {t('admin.assigned_dairy', 'Delivers for')}
            </Text>
            {activeDairies.length === 0 ? (
              <Text style={[styles.messageText, { color: colors.textMuted }]}>
                {t('admin.no_active_dairy', 'Onboard or reactivate a dairy first.')}
              </Text>
            ) : (
              <View style={styles.dairyPicker}>
                {activeDairies.map((d) => {
                  const selected = gawaliForm.dairyId === d.dairyId;
                  return (
                    <TouchableOpacity
                      key={d.id}
                      onPress={() => setGawaliForm((f) => ({ ...f, dairyId: d.dairyId! }))}
                      style={[
                        styles.dairyOption,
                        { borderColor: selected ? colors.primary : colors.border },
                        selected && { backgroundColor: isDark ? colors.surface : '#ECFDF5' },
                      ]}
                      accessibilityRole="radio"
                      accessibilityState={{ selected }}
                    >
                      <Store size={14} color={selected ? colors.primary : colors.textMuted} />
                      <Text style={[styles.dairyOptionText, { color: colors.textPrimary }]} numberOfLines={1}>
                        {d.dairyName}
                      </Text>
                      {selected && <Check size={14} color={colors.primary} />}
                    </TouchableOpacity>
                  );
                })}
              </View>
            )}
            {shownError(gawaliErrors, 'dairyId') ? (
              <Text style={[styles.formError, { color: colors.error }]}>{gawaliErrors.dairyId}</Text>
            ) : null}
            <Input
              label={t('admin_dashboard.user_fullname_label', 'Full name')}
              placeholder="e.g. Vikram Shinde"
              value={gawaliForm.fullName}
              onChangeText={(v) => setGawaliForm((f) => ({ ...f, fullName: v }))}
              error={shownError(gawaliErrors, 'fullName')}
              autoCapitalize="words"
            />
            <Input
              label={t('admin.gawali_email', 'Email (sign-in ID)')}
              placeholder="e.g. vikram@example.com"
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
              value={gawaliForm.email}
              onChangeText={(v) => setGawaliForm((f) => ({ ...f, email: v }))}
              error={shownError(gawaliErrors, 'email')}
            />
            <Input
              label={t('admin_dashboard.phone_label', 'Mobile number')}
              placeholder="e.g. +919822334455"
              keyboardType="phone-pad"
              value={gawaliForm.phone}
              onChangeText={(v) => setGawaliForm((f) => ({ ...f, phone: v }))}
              error={shownError(gawaliErrors, 'phone')}
            />
            <Input
              label={t('admin.vehicle', 'Vehicle number (optional)')}
              placeholder="e.g. MH12 AB 1234"
              autoCapitalize="characters"
              value={gawaliForm.vehicleNumber}
              onChangeText={(v) => setGawaliForm((f) => ({ ...f, vehicleNumber: v }))}
            />
            {formError ? <Text style={[styles.formError, { color: colors.error }]}>{formError}</Text> : null}
            <Button
              title={t('admin.create_gawali', 'Create gawali account')}
              icon={<Check size={16} color="#FFFFFF" />}
              onPress={handleCreateGawali}
              loading={submitting}
              disabled={activeDairies.length === 0}
            />
          </View>
        </ScrollView>
      </BottomSheetModal>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
    gap: 16,
  },
  statGrid: {
    gap: 12,
  },
  statRow: {
    flexDirection: 'row',
  },
  tabBar: {
    flexDirection: 'row',
    borderRadius: 14,
    padding: 4,
  },
  tabItem: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 10,
    alignItems: 'center',
  },
  tabInner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  tabText: {
    fontSize: 13,
    fontWeight: '700',
  },
  actionBar: {
    flexDirection: 'row',
    gap: 10,
    alignItems: 'center',
  },
  searchBox: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    height: 40,
  },
  searchInput: {
    flex: 1,
    fontSize: 13,
    paddingVertical: 4,
  },
  chips: {
    gap: 8,
  },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
  },
  chipText: {
    fontSize: 12,
    fontWeight: '600',
  },
  list: {
    gap: 12,
  },
  accountCard: {
    padding: 16,
    gap: 12,
  },
  cardTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 8,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  accountName: {
    fontSize: 16,
    fontWeight: '700',
    flexShrink: 1,
  },
  accountMeta: {
    fontSize: 12,
    marginTop: 2,
  },
  accountContact: {
    fontSize: 11,
    marginTop: 1,
  },
  cardFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(0,0,0,0.06)',
  },
  toggleBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
  },
  messageCard: {
    padding: 20,
    gap: 12,
    alignItems: 'center',
  },
  messageText: {
    fontSize: 13,
    textAlign: 'center',
  },
  form: {
    gap: 10,
    paddingVertical: 10,
  },
  fieldLabel: {
    fontSize: 13,
    fontWeight: '600',
  },
  formError: {
    fontSize: 13,
    fontWeight: '600',
  },
  dairyPicker: {
    gap: 8,
  },
  dairyOption: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
  },
  dairyOptionText: {
    flex: 1,
    fontSize: 14,
    fontWeight: '600',
  },
});
