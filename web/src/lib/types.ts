export type Role = 'customer' | 'dairy' | 'delivery_boy' | 'admin';

export interface User {
  id: string;
  email: string;
  phone: string | null;
  full_name: string;
  role: Role;
  business_name?: string;
}

export type Category = 'milk' | 'curd' | 'paneer' | 'ghee' | 'bakery' | 'eggs' | 'other';
export type Container = 'glass_bottle' | 'pouch' | 'tub' | 'pack';

export interface ProductBrief {
  id: string;
  name: string;
  unit: string;
  price: number;
  category: Category;
  container: Container;
  animal: 'cow' | 'a2_cow' | 'buffalo' | 'none';
  step: number;
  image_url: string | null;
}

export interface ShopProduct extends ProductBrief {
  description: string;
  is_new: boolean;
  is_featured: boolean;
  kind: 'subscription' | 'one_time';
  fat_percent: number | null;
  subscribed: boolean;
  popularity: number;
  reason?: string;
  times_ordered?: number;
  last_ordered?: string;
}

export interface DayItem {
  subscription_id: string;
  product: ProductBrief;
  quantity: number;
  default_quantity: number;
  is_override: boolean;
  line_amount: number;
  subscription_status: string;
  delivery_id?: string;
  delivery_status?: string;
}

export interface DayOrder {
  id: string;
  product: ProductBrief;
  quantity: number;
  amount: number;
  status: 'pending' | 'delivered' | 'cancelled';
  is_express: boolean;
  source: string;
}

export type DayStatus = 'none' | 'scheduled' | 'skipped' | 'vacation' | 'delivered' | 'missed' | 'paused';

export interface DayPlan {
  date: string;
  status: DayStatus;
  locked: boolean;
  items: DayItem[];
  orders: DayOrder[];
  amount: number;
  bottles: number;
  proof_photo: string | null;
  delivered_at: string | null;
  batch_id: string | null;
  refund_claims?: Record<string, string>;
}

export interface Cutoff {
  server_now: string;
  cutoff_time: string;
  cutoff_label: string;
  next_cutoff_at: string;
  governs_date: string;
  tomorrow: string;
  tomorrow_locked: boolean;
}

export interface Burn {
  daily_average: number;
  next_7_days: number;
  covers_until: string | null;
  days_covered: number;
  covers_horizon: boolean;
}

export interface WalletInfo {
  balance: number;
  billing_mode: 'wallet' | 'autopay';
  auto_topup_enabled: boolean;
  auto_topup_threshold: number;
  auto_topup_amount: number;
  autopay_upi_id: string;
  autopay_status: 'inactive' | 'active' | 'paused';
  autopay_max_daily: number;
  default_withdraw_upi: string;
  burn: Burn;
  payments_enabled: boolean;
}

export interface Txn {
  id: string;
  kind: string;
  kind_label: string;
  direction: 'credit' | 'debit';
  channel: 'wallet' | 'autopay';
  amount: number;
  balance_after: number;
  description: string;
  reference: string;
  for_date: string | null;
  created_at: string;
  customer_name?: string;
}

export interface Bottles {
  with_you: number;
  deposit_each: number;
  deposit_held: number;
  pouches_returned: number;
  pouches_to_next_credit: number;
  eco_credit_each: number;
}

export interface Doorstep {
  silent_delivery: boolean;
  use_gate_hook: boolean;
  photo_proof: boolean;
  society_name: string;
  society_gate_pass: boolean;
  delivery_instructions: string;
}

export interface Vacation {
  id: string;
  start_date: string;
  end_date: string;
  reason: string;
  days: number;
}

export interface Home {
  needs_onboarding: boolean;
  customer_name: string;
  first_name: string;
  dairy: { id: string; name: string; phone: string; hub_name: string; slot: string };
  cutoff: Cutoff;
  today: DayPlan;
  tomorrow: DayPlan;
  week: DayPlan[];
  wallet: WalletInfo;
  bottles: Bottles;
  doorstep: Doorstep;
  gate_token: string | null;
  vacations: Vacation[];
  unread_notifications: number;
  ai_engine: string;
  payments_enabled: boolean;
  passport_enabled: boolean;
  dues: { due: number; credit_limit: number; available_credit: number; over_limit: boolean; near_limit: boolean; hold_enabled: boolean };
}

export interface Passport {
  id: string;
  code: string;
  animal: string;
  delivery_date: string;
  hub_name: string;
  milked_at: string;
  milked_label: string;
  chilled_at: string;
  minutes_to_chill: number;
  chill_temp: number | null;
  temperature_log: { t: string; c: number; phase: string }[];
  temp_min: number | null;
  temp_max: number | null;
  safe_min: number;
  safe_max: number;
  cold_chain_ok: boolean;
  lab: {
    fat: number;
    snf: number;
    water: number;
    detergent: number;
    starch: number;
    urea: number;
    adulteration_free: boolean;
    lab_name: string;
    certified_by: string;
  };
  status: 'passed' | 'failed' | 'testing';
  product_name?: string | null;
  deliveries?: number;
}

export interface RefundClaim {
  id: string;
  issue: 'leaked' | 'curdled';
  issue_label: string;
  amount: number;
  status: 'credited' | 'under_review' | 'rejected';
  ai_verdict: 'verified' | 'unclear' | 'mismatch';
  ai_confidence: number;
  ai_observation: string;
  ai_engine: string;
  processing_ms: number;
  photo: string | null;
  delivery_id: string;
  delivery_date: string;
  product_name: string;
  customer_name: string;
  reviewed_note: string;
  created_at: string;
  backup_order_id: string | null;
}

export interface Subscription {
  id: string;
  product: ProductBrief;
  default_quantity: number;
  status: 'active' | 'paused' | 'cancelled';
  start_date: string;
  end_date: string | null;
  daily_amount: number;
}

export interface Stop {
  customer_id: string;
  name: string;
  phone: string | null;
  address: string;
  flat: string;
  landmark: string;
  society_name: string;
  instructions: string;
  stop_order: number;
  route_id: string | null;
  route_name: string;
  doorstep: Doorstep;
  gate_token: string | null;
  items: { delivery_id: string; product: ProductBrief; quantity: number; delivered_quantity: number; status: string }[];
  orders: { id: string; product: ProductBrief; quantity: number; status: string; is_express: boolean }[];
  status: 'pending' | 'delivered' | 'missed' | 'skipped' | 'partial';
  is_express: boolean;
  proof_photo: string | null;
  delivered_at: string | null;
  bottles_with_customer: number;
  glass_bottles_today: number;
  latitude: number | null;
  longitude: number | null;
}

export interface LoadLine {
  product: ProductBrief;
  quantity: number;
  households: number;
}

export interface Notification {
  id: string;
  title: string;
  body: string;
  notification_type: string;
  data: Record<string, any>;
  is_read: boolean;
  created_at: string;
}
