import { createApi } from '@reduxjs/toolkit/query/react';
import { appBaseQuery } from './baseQuery';
import type {
  Bill,
  CalendarMonth,
  CustomerBills,
  CustomerDashboard,
  CustomerProfile,
  DairyCustomer,
  DairyCustomerDetail,
  DairyDashboard,
  DairyProfile,
  DairyReport,
  DeliveryChange,
  DeliveryStatus,
  Delivery,
  Gawali,
  GawaliRoute,
  Manifest,
  NewDairyCustomer,
  Order,
  OrderStatus,
  Paginated,
  PlanStatus,
  Product,
  ProductKind,
  PublicDairy,
  ReportPreset,
  Route,
  Subscription,
  SyncResult,
  TimeSlot,
  Vacation,
} from './types';

export interface PlanChange {
  product_id?: string;
  default_quantity?: string;
  delivery_time_slot?: TimeSlot;
  status?: PlanStatus;
}

export interface ProductInput {
  name: string;
  unit: string;
  price_per_unit: string;
  kind: ProductKind;
  is_available: boolean;
  description?: string;
}

export interface CustomerSetupInput {
  dairy_id: string;
  product_id: string;
  default_quantity: string;
  delivery_time_slot: TimeSlot;
  address: string;
  flat_or_house_number?: string;
  landmark?: string;
  delivery_instructions?: string;
}

export interface NewCustomerInput {
  full_name: string;
  email: string;
  phone: string;
  address: string;
  flat_or_house_number?: string;
  landmark?: string;
  delivery_instructions?: string;
  delivery_route?: string | null;
  product_id: string;
  default_quantity: string;
  delivery_time_slot: TimeSlot;
}

export interface CustomerDeliveryDetails {
  address?: string;
  flat_or_house_number?: string;
  landmark?: string;
  delivery_instructions?: string;
  delivery_route?: string | null;
  route_stop_order?: number;
}

/** Fetch every page of a paginated list (lists here are bounded: one dairy's customers). */
const PAGE_SIZE = 100;

export const gawaliApi = createApi({
  reducerPath: 'api',
  baseQuery: appBaseQuery,
  refetchOnFocus: true,
  refetchOnReconnect: true,
  keepUnusedDataFor: 300,
  tagTypes: [
    'CustomerDashboard',
    'CustomerProfile',
    'Calendar',
    'Plan',
    'Vacations',
    'ShopProducts',
    'Orders',
    'Bills',
    'DairyDashboard',
    'DairyProfile',
    'Routes',
    'Gawalis',
    'DairyCustomers',
    'DairyCustomer',
    'Manifest',
    'Products',
    'Reports',
    'GawaliRoute',
  ],
  endpoints: (build) => ({
    // --- Onboarding (public) ------------------------------------------------
    getPublicDairies: build.query<PublicDairy[], { search?: string } | void>({
      query: (args) => ({ url: '/dairies/public-list/', params: { search: args?.search, page_size: PAGE_SIZE } }),
      transformResponse: (res: Paginated<PublicDairy> | PublicDairy[]) => (Array.isArray(res) ? res : res.results),
    }),
    getPublicDairyProducts: build.query<Product[], string>({
      query: (dairyId) => ({ url: `/products/dairy/${dairyId}/` }),
    }),

    // --- Customer --------------------------------------------------------------
    getCustomerDashboard: build.query<CustomerDashboard, void>({
      query: () => ({ url: '/customers/dashboard/' }),
      providesTags: ['CustomerDashboard'],
    }),
    getCustomerProfile: build.query<CustomerProfile, void>({
      query: () => ({ url: '/customers/profile/' }),
      providesTags: ['CustomerProfile'],
    }),
    updateCustomerProfile: build.mutation<CustomerProfile, Partial<CustomerProfile>>({
      query: (body) => ({ url: '/customers/profile/', method: 'PATCH', body }),
      invalidatesTags: ['CustomerProfile'],
    }),
    setupCustomer: build.mutation<{ message: string; profile: CustomerProfile }, CustomerSetupInput>({
      query: (body) => ({ url: '/customers/setup/', method: 'POST', body }),
      invalidatesTags: ['CustomerProfile', 'CustomerDashboard', 'Calendar', 'Plan', 'ShopProducts'],
    }),
    getPlan: build.query<{ subscription: Subscription | null }, void>({
      query: () => ({ url: '/subscriptions/plan/' }),
      providesTags: ['Plan'],
    }),
    updatePlan: build.mutation<{ message: string; subscription: Subscription }, PlanChange>({
      query: (body) => ({ url: '/subscriptions/plan/', method: 'PATCH', body }),
      invalidatesTags: ['Plan', 'CustomerDashboard', 'Calendar'],
    }),
    getCalendar: build.query<CalendarMonth, { year: number; month: number }>({
      query: (params) => ({ url: '/subscriptions/calendar/', params }),
      providesTags: (_r, _e, a) => [{ type: 'Calendar', id: `${a.year}-${a.month}` }, 'Calendar'],
    }),
    setDayQuantity: build.mutation<{ message: string }, { date: string; quantity: string; reason?: string }>({
      query: (body) => ({ url: '/subscriptions/override/', method: 'POST', body }),
      invalidatesTags: ['Calendar', 'CustomerDashboard'],
    }),
    removeDayChange: build.mutation<{ message: string }, string>({
      query: (overrideId) => ({ url: `/subscriptions/override/${overrideId}/`, method: 'DELETE' }),
      invalidatesTags: ['Calendar', 'CustomerDashboard'],
    }),
    getVacations: build.query<Vacation[], void>({
      query: () => ({ url: '/subscriptions/vacations/' }),
      providesTags: ['Vacations'],
    }),
    createVacation: build.mutation<Vacation, { start_date: string; end_date: string; reason?: string }>({
      query: (body) => ({ url: '/subscriptions/vacations/', method: 'POST', body }),
      invalidatesTags: ['Vacations', 'Calendar', 'CustomerDashboard'],
    }),
    cancelVacation: build.mutation<{ message: string }, string>({
      query: (id) => ({ url: `/subscriptions/vacations/${id}/`, method: 'DELETE' }),
      invalidatesTags: ['Vacations', 'Calendar', 'CustomerDashboard'],
    }),
    getShopProducts: build.query<Product[], void>({
      query: () => ({ url: '/products/shop/' }),
      providesTags: ['ShopProducts'],
    }),
    getMyOrders: build.query<Order[], { upcoming?: boolean } | void>({
      query: (args) => ({ url: '/subscriptions/orders/', params: { upcoming: args?.upcoming ? 'true' : undefined, page_size: PAGE_SIZE } }),
      transformResponse: (res: Paginated<Order>) => res.results,
      providesTags: ['Orders'],
    }),
    createOrder: build.mutation<Order, { product: string; quantity: string; delivery_date: string }>({
      query: (body) => ({ url: '/subscriptions/orders/', method: 'POST', body }),
      invalidatesTags: ['Orders', 'Calendar', 'CustomerDashboard'],
    }),
    cancelOrder: build.mutation<Order, string>({
      query: (id) => ({ url: `/subscriptions/orders/${id}/cancel/`, method: 'POST' }),
      invalidatesTags: ['Orders', 'Calendar', 'CustomerDashboard'],
    }),
    getMyBills: build.query<CustomerBills, void>({
      query: () => ({ url: '/billing/my-bills/' }),
      providesTags: ['Bills'],
    }),
    getBill: build.query<Bill, string>({
      query: (id) => ({ url: `/billing/my-bills/${id}/` }),
      providesTags: (_r, _e, id) => [{ type: 'Bills', id }],
    }),

    // --- Dairy: business --------------------------------------------------------
    getDairyDashboard: build.query<DairyDashboard, void>({
      query: () => ({ url: '/dairies/dashboard/' }),
      providesTags: ['DairyDashboard'],
    }),
    getDairyProfile: build.query<DairyProfile, void>({
      query: () => ({ url: '/dairies/profile/' }),
      providesTags: ['DairyProfile'],
    }),
    updateDairyProfile: build.mutation<DairyProfile, Partial<DairyProfile>>({
      query: (body) => ({ url: '/dairies/profile/', method: 'PATCH', body }),
      invalidatesTags: ['DairyProfile', 'DairyDashboard'],
    }),
    getReports: build.query<DairyReport, ReportPreset>({
      query: (preset) => ({ url: '/reports/vendor/', params: { preset } }),
      providesTags: ['Reports'],
    }),

    // --- Dairy: routes & gawalis --------------------------------------------------
    getRoutes: build.query<Route[], void>({
      query: () => ({ url: '/dairies/routes/' }),
      providesTags: ['Routes'],
    }),
    createRoute: build.mutation<Route, { name: string; description?: string }>({
      query: (body) => ({ url: '/dairies/routes/', method: 'POST', body }),
      invalidatesTags: ['Routes', 'DairyProfile'],
    }),
    updateRoute: build.mutation<Route, { id: string; name?: string; description?: string }>({
      query: ({ id, ...body }) => ({ url: `/dairies/routes/${id}/`, method: 'PATCH', body }),
      invalidatesTags: ['Routes', 'Gawalis', 'DairyCustomers', 'Manifest'],
    }),
    deleteRoute: build.mutation<void, string>({
      query: (id) => ({ url: `/dairies/routes/${id}/`, method: 'DELETE' }),
      invalidatesTags: ['Routes', 'Gawalis', 'DairyCustomers', 'DairyCustomer', 'Manifest', 'DairyProfile'],
    }),
    getGawalis: build.query<Gawali[], void>({
      query: () => ({ url: '/deliveries/delivery-boys/' }),
      providesTags: ['Gawalis'],
    }),
    updateGawali: build.mutation<Gawali, { id: string; assigned_route?: string | null; vehicle_number?: string }>({
      query: ({ id, ...body }) => ({ url: `/deliveries/delivery-boys/${id}/`, method: 'PATCH', body }),
      invalidatesTags: ['Gawalis'],
    }),

    // --- Dairy: customers & plans ---------------------------------------------------
    getDairyCustomers: build.query<DairyCustomer[], { search?: string; route_id?: string; has_dues?: boolean } | void>({
      query: (args) => ({
        url: '/customers/vendor/list/',
        params: {
          search: args?.search,
          route_id: args?.route_id,
          has_dues: args?.has_dues ? 'true' : undefined,
          page_size: PAGE_SIZE,
        },
      }),
      transformResponse: (res: Paginated<DairyCustomer>) => res.results,
      providesTags: ['DairyCustomers'],
    }),
    addDairyCustomer: build.mutation<NewDairyCustomer, NewCustomerInput>({
      query: (body) => ({ url: '/customers/vendor/list/', method: 'POST', body }),
      invalidatesTags: ['DairyCustomers', 'DairyDashboard', 'Manifest'],
    }),
    getDairyCustomer: build.query<DairyCustomerDetail, string>({
      query: (id) => ({ url: `/customers/vendor/${id}/` }),
      providesTags: (_r, _e, id) => [{ type: 'DairyCustomer', id }],
    }),
    updateDairyCustomer: build.mutation<DairyCustomer, { id: string } & CustomerDeliveryDetails>({
      query: ({ id, ...body }) => ({ url: `/customers/vendor/${id}/`, method: 'PATCH', body }),
      invalidatesTags: (_r, _e, a) => [{ type: 'DairyCustomer', id: a.id }, 'DairyCustomers', 'Manifest'],
    }),
    startCustomerPlan: build.mutation<Subscription, { customerId: string; product_id: string; default_quantity: string; delivery_time_slot: TimeSlot }>({
      query: ({ customerId, ...body }) => ({ url: `/subscriptions/vendor/customers/${customerId}/plan/`, method: 'POST', body }),
      invalidatesTags: (_r, _e, a) => [{ type: 'DairyCustomer', id: a.customerId }, 'DairyCustomers', 'Manifest', 'DairyDashboard'],
    }),
    updateCustomerPlan: build.mutation<Subscription, { customerId: string } & PlanChange>({
      query: ({ customerId, ...body }) => ({ url: `/subscriptions/vendor/customers/${customerId}/plan/`, method: 'PATCH', body }),
      invalidatesTags: (_r, _e, a) => [{ type: 'DairyCustomer', id: a.customerId }, 'DairyCustomers', 'Manifest', 'DairyDashboard'],
    }),
    reorderRoute: build.mutation<void, { route_id: string | null; customer_ids: string[] }>({
      query: (body) => ({ url: '/customers/vendor/reorder/', method: 'POST', body }),
      invalidatesTags: ['DairyCustomers', 'Manifest'],
    }),
    generateBill: build.mutation<{ message: string; bill: Bill }, { customerId: string; month?: string }>({
      query: ({ customerId, month }) => ({ url: `/billing/vendor/generate/${customerId}/`, method: 'POST', body: { month } }),
      invalidatesTags: (_r, _e, a) => [{ type: 'DairyCustomer', id: a.customerId }, 'DairyCustomers', 'DairyDashboard', 'Reports'],
    }),
    recordPayment: build.mutation<{ message: string; bill: Bill }, { billId: string; customerId: string; amount?: string; mark_full?: boolean }>({
      query: ({ billId, amount, mark_full }) => ({ url: `/billing/vendor/mark-paid/${billId}/`, method: 'POST', body: { amount, mark_full } }),
      invalidatesTags: (_r, _e, a) => [{ type: 'DairyCustomer', id: a.customerId }, 'DairyCustomers', 'DairyDashboard', 'Reports'],
    }),

    // --- Dairy: deliveries, products, orders -------------------------------------------
    getManifest: build.query<Manifest, { date?: string; route_id?: string } | void>({
      query: (args) => ({ url: '/deliveries/today/', params: { date: args?.date, route_id: args?.route_id } }),
      providesTags: ['Manifest'],
    }),
    setDeliveryStatus: build.mutation<{ delivery: Delivery; applied: boolean }, { id: string; status: DeliveryStatus; delivered_quantity?: string }>({
      query: ({ id, ...body }) => ({
        url: `/deliveries/${id}/status/`,
        method: 'PATCH',
        body: { ...body, client_updated_at: new Date().toISOString() },
      }),
      invalidatesTags: ['Manifest', 'DairyDashboard'],
    }),
    getProducts: build.query<Product[], void>({
      query: () => ({ url: '/products/vendor/' }),
      providesTags: ['Products'],
    }),
    createProduct: build.mutation<Product, ProductInput>({
      query: (body) => ({ url: '/products/vendor/', method: 'POST', body }),
      invalidatesTags: ['Products'],
    }),
    updateProduct: build.mutation<Product, { id: string } & Partial<ProductInput>>({
      query: ({ id, ...body }) => ({ url: `/products/vendor/${id}/`, method: 'PATCH', body }),
      invalidatesTags: ['Products'],
    }),
    deleteProduct: build.mutation<void, string>({
      query: (id) => ({ url: `/products/vendor/${id}/`, method: 'DELETE' }),
      invalidatesTags: ['Products'],
    }),
    getDairyOrders: build.query<Order[], { date?: string; status?: OrderStatus } | void>({
      query: (args) => ({ url: '/subscriptions/orders/', params: { date: args?.date, status: args?.status, page_size: PAGE_SIZE } }),
      transformResponse: (res: Paginated<Order>) => res.results,
      providesTags: ['Orders'],
    }),
    setOrderStatus: build.mutation<Order, { id: string; status: 'delivered' | 'cancelled' }>({
      query: ({ id, status }) => ({ url: `/subscriptions/orders/${id}/set-status/`, method: 'POST', body: { status } }),
      invalidatesTags: ['Orders'],
    }),

    // --- Gawali ---------------------------------------------------------------------------
    getGawaliRoute: build.query<GawaliRoute, void>({
      query: () => ({ url: '/deliveries/boy/route/' }),
      providesTags: ['GawaliRoute'],
    }),
    syncDeliveries: build.mutation<SyncResult, DeliveryChange[]>({
      query: (updates) => ({ url: '/deliveries/sync/', method: 'POST', body: { updates } }),
    }),
  }),
});

export const {
  useGetPublicDairiesQuery,
  useGetPublicDairyProductsQuery,
  useGetCustomerDashboardQuery,
  useGetCustomerProfileQuery,
  useUpdateCustomerProfileMutation,
  useSetupCustomerMutation,
  useGetPlanQuery,
  useUpdatePlanMutation,
  useGetCalendarQuery,
  useSetDayQuantityMutation,
  useRemoveDayChangeMutation,
  useGetVacationsQuery,
  useCreateVacationMutation,
  useCancelVacationMutation,
  useGetShopProductsQuery,
  useGetMyOrdersQuery,
  useCreateOrderMutation,
  useCancelOrderMutation,
  useGetMyBillsQuery,
  useGetBillQuery,
  useGetDairyDashboardQuery,
  useGetDairyProfileQuery,
  useUpdateDairyProfileMutation,
  useGetReportsQuery,
  useGetRoutesQuery,
  useCreateRouteMutation,
  useUpdateRouteMutation,
  useDeleteRouteMutation,
  useGetGawalisQuery,
  useUpdateGawaliMutation,
  useGetDairyCustomersQuery,
  useAddDairyCustomerMutation,
  useGetDairyCustomerQuery,
  useUpdateDairyCustomerMutation,
  useStartCustomerPlanMutation,
  useUpdateCustomerPlanMutation,
  useReorderRouteMutation,
  useGenerateBillMutation,
  useRecordPaymentMutation,
  useGetManifestQuery,
  useSetDeliveryStatusMutation,
  useGetProductsQuery,
  useCreateProductMutation,
  useUpdateProductMutation,
  useDeleteProductMutation,
  useGetDairyOrdersQuery,
  useSetOrderStatusMutation,
  useGetGawaliRouteQuery,
  useSyncDeliveriesMutation,
} = gawaliApi;
