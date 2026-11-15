/**
 * Response shapes of the Gawali API (backend `apps/*` serializers and views).
 * Decimal fields arrive as strings (e.g. "1.50"); convert with `toNumber` before arithmetic.
 */
export type Dec = string;
export type ISODate = string; // YYYY-MM-DD
export type ISODateTime = string;

export const toNumber = (v: Dec | number | null | undefined): number => {
  if (v === null || v === undefined || v === '') return 0;
  const n = typeof v === 'number' ? v : parseFloat(v);
  return Number.isFinite(n) ? n : 0;
};

export interface Paginated<T> {
  count: number;
  total_pages: number;
  current_page: number;
  next: string | null;
  previous: string | null;
  results: T[];
}

// --- Catalogue ----------------------------------------------------------------

export type ProductKind = 'subscription' | 'one_time';

export interface Product {
  id: string;
  dairy: string;
  name: string;
  unit: string;
  price_per_unit: Dec;
  kind: ProductKind;
  is_available: boolean;
  description: string;
  image_url: string | null;
  created_at: ISODateTime;
}

export interface PublicDairy {
  id: string;
  business_name: string;
  phone: string;
  city: string;
  cutoff_time: string;
}

// --- Customer -------------------------------------------------------------------

export interface CustomerProfile {
  id: string;
  full_name: string;
  phone: string | null;
  email: string;
  dairy: string | null;
  dairy_name: string | null;
  delivery_route: string | null;
  route_name: string | null;
  address: string;
  flat_or_house_number: string;
  landmark: string;
  latitude: Dec | null;
  longitude: Dec | null;
  delivery_instructions: string;
  preferred_language: 'en' | 'hi' | 'mr';
  dark_mode_enabled: boolean;
  route_stop_order: number;
  is_active: boolean;
  needs_onboarding: boolean;
  created_at: ISODateTime;
}

export type PlanStatus = 'active' | 'paused' | 'cancelled';
export type TimeSlot = 'morning' | 'evening';

export interface PlanSummary {
  id: string;
  product_id: string;
  product_name: string;
  default_quantity: Dec;
  unit: string;
  price_per_unit: Dec;
  status: PlanStatus;
  delivery_time_slot: TimeSlot;
  start_date: ISODate;
}

export type DeliveryStatus = 'pending' | 'delivered' | 'skipped' | 'missed';

export interface CustomerDashboard {
  customer_name: string;
  today: ISODate;
  needs_onboarding: boolean;
  dairy: { id: string; name: string; phone: string; cutoff_time: string; upi_id: string } | null;
  earliest_changeable_date: ISODate;
  subscription: PlanSummary | null;
  today_delivery: {
    id: string;
    status: DeliveryStatus;
    scheduled_quantity: Dec;
    delivered_quantity: Dec;
    delivered_at: ISODateTime | null;
  } | null;
  this_month_so_far: { delivered_quantity: Dec; delivered_days: number; estimated_amount: Dec };
  upcoming_orders: number;
  unpaid_bill: { bill_id: string; month: string; due_amount: Dec; due_date: ISODate | null } | null;
}

export interface Subscription {
  id: string;
  customer: string;
  product: Product;
  default_quantity: Dec;
  delivery_time_slot: TimeSlot;
  status: PlanStatus;
  start_date: ISODate;
  end_date: ISODate | null;
  created_at: ISODateTime;
}

export type CalendarDayStatus =
  | DeliveryStatus
  | 'scheduled'
  | 'vacation'
  | 'none'
  | 'no_record';

export interface CalendarDay {
  date: ISODate;
  day: number;
  weekday: string;
  scheduled_quantity: Dec | number;
  actual_quantity: Dec | number;
  status: CalendarDayStatus;
  override_id: string | null;
  override_type: 'skip' | 'double' | 'custom' | null;
  is_vacation: boolean;
  can_modify: boolean;
  is_today: boolean;
  is_past: boolean;
  extras: { id: string; product_name: string; quantity: Dec; status: OrderStatus }[];
}

export interface Vacation {
  id: string;
  start_date: ISODate;
  end_date: ISODate;
  reason: string;
  is_active: boolean;
  created_at: ISODateTime;
}

export interface CalendarMonth {
  year: number;
  month: number;
  has_subscription: boolean;
  default_quantity: Dec | number;
  unit: string;
  cutoff_time: string | null;
  earliest_changeable_date: ISODate;
  days: CalendarDay[];
  vacations: Vacation[];
}

export type OrderStatus = 'pending' | 'delivered' | 'cancelled';

export interface Order {
  id: string;
  customer: string;
  customer_name: string;
  customer_address: string;
  dairy: string;
  product: string;
  product_name: string;
  product_unit: string;
  quantity: Dec;
  unit_price: Dec;
  total_price: Dec;
  delivery_date: ISODate;
  status: OrderStatus;
  created_at: ISODateTime;
}

export type BillStatus = 'generated' | 'partially_paid' | 'paid' | 'overdue';

export interface BillItem {
  id: string;
  date: ISODate;
  item_name: string;
  quantity: Dec;
  unit_price: Dec;
  total_amount: Dec;
}

export interface Bill {
  id: string;
  customer: string;
  customer_name: string;
  dairy: string;
  dairy_name: string;
  billing_month: ISODate;
  month_name: string;
  total_quantity: Dec;
  total_amount: Dec;
  paid_amount: Dec;
  due_amount: Dec;
  status: BillStatus;
  due_date: ISODate | null;
  paid_at: ISODateTime | null;
  pdf_url: string | null;
  is_paid: boolean;
  items: BillItem[];
  created_at: ISODateTime;
}

export interface CustomerBills {
  summary: { total_billed: number; total_paid: number; total_due: number };
  bills: Bill[];
}

// --- Dairy -------------------------------------------------------------------

export interface Route {
  id: string;
  dairy: string;
  name: string;
  description: string;
  sort_order: number;
  created_at: ISODateTime;
}

export interface DairyProfile {
  id: string;
  user: string;
  owner_name: string;
  owner_email: string;
  business_name: string;
  phone: string;
  address: string;
  city: string;
  state: string;
  pincode: string;
  cutoff_time: string;
  billing_cycle: 'monthly' | 'weekly' | 'fortnightly';
  is_verified: boolean;
  is_active: boolean;
  bank_upi_id: string;
  routes: Route[];
  created_at: ISODateTime;
}

export interface DairyDashboard {
  business_name: string;
  today: ISODate;
  today_volume_litres: number;
  today_delivered_count: number;
  today_total_deliveries: number;
  total_active_customers: number;
  this_month_earned: number;
  total_outstanding_dues: number;
  cutoff_time: string;
  overdue_customers: {
    bill_id: string;
    customer_id: string;
    customer_name: string;
    phone: string;
    address: string;
    due_amount: number;
    billing_month: string;
    whatsapp_url: string | null;
    call_phone: string;
  }[];
}

export interface Gawali {
  id: string;
  full_name: string;
  phone: string | null;
  email: string;
  account_active: boolean;
  dairy: string;
  vehicle_number: string;
  assigned_route: string | null;
  route_name: string | null;
  is_active: boolean;
  created_at: ISODateTime;
}

export interface DairyCustomer extends CustomerProfile {
  plan: {
    subscription_id: string;
    product_name: string;
    unit: string;
    default_quantity: Dec;
    status: PlanStatus;
  } | null;
  outstanding: Dec;
}

export interface NewDairyCustomer extends DairyCustomer {
  temporary_password: string | null;
  linked_existing_account: boolean;
}

export interface DairyCustomerDetail {
  customer: DairyCustomer;
  metrics: {
    outstanding: Dec;
    this_month_delivered: Dec;
    this_month_amount: Dec;
    lifetime_delivered: Dec;
    lifetime_paid: Dec;
  };
  subscription: (Omit<PlanSummary, 'unit'> & { unit: string }) | null;
  recent_deliveries: { id: string; date: ISODate; scheduled_quantity: Dec; delivered_quantity: Dec; status: DeliveryStatus }[];
  bills: {
    id: string;
    month: string;
    billing_month: ISODate;
    total_amount: Dec;
    paid_amount: Dec;
    due_amount: Dec;
    status: BillStatus;
    is_paid: boolean;
  }[];
}

export interface Delivery {
  id: string;
  delivery_date: ISODate;
  scheduled_quantity: Dec;
  delivered_quantity: Dec;
  status: DeliveryStatus;
  delivered_at: ISODateTime | null;
  status_updated_at: ISODateTime | null;
  notes: string;
  customer_id: string;
  customer_name: string;
  customer_phone: string | null;
  customer_address: string;
  flat_or_house: string;
  landmark: string;
  delivery_instructions: string;
  latitude: Dec | null;
  longitude: Dec | null;
  route_id: string | null;
  route_name: string | null;
  product_name: string;
  product_unit: string;
  stop_order: number;
}

export interface Manifest {
  date: ISODate;
  summary: {
    total: number;
    delivered: number;
    pending: number;
    skipped: number;
    missed: number;
    scheduled_litres: number;
    delivered_litres: number;
  };
  deliveries: Delivery[];
}

export interface GawaliRoute {
  date: ISODate;
  dairy_name: string;
  route_name: string | null;
  progress: { delivered: number; pending: number; total: number };
  stops: Delivery[];
}

export interface DeliveryChange {
  id: string;
  status?: DeliveryStatus;
  delivered_quantity?: string | null;
  notes?: string;
  client_updated_at: ISODateTime;
}

export interface SyncResult {
  results: {
    id: string;
    result: 'applied' | 'superseded' | 'rejected';
    delivery?: Delivery;
    detail?: string;
    code?: string;
  }[];
}

export type ReportPreset = 'this_month' | 'last_month' | 'last_7d' | 'last_30d';

export interface DairyReport {
  from: ISODate;
  to: ISODate;
  summary: { delivered_litres: number; revenue_earned: number; total_billed: number; total_collected: number };
  by_product: { name: string; quantity: number; amount: number; unit: string }[];
  top_customers: { customer_id: string; name: string; quantity: number; amount: number }[];
  daily_breakdown: { date: ISODate; quantity: number; amount: number }[];
}
