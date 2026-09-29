import { createSlice, PayloadAction } from '@reduxjs/toolkit';

export interface BillItem {
  id: number;
  invoiceNumber: string;
  month: string; // 'August 2026'
  startDate: string;
  endDate: string;
  totalLitres: number;
  ratePerLitre: number;
  deliveredDaysCount: number;
  skippedDaysCount: number;
  addonsAmount: number;
  grossAmount: number;
  discount: number;
  tax: number;
  netPayable: number;
  status: 'paid' | 'unpaid' | 'overdue' | 'partially_paid';
  dueDate: string;
  paidAt?: string;
  pdfUrl?: string;
}

export interface LedgerTransaction {
  id: number;
  date: string;
  description: string;
  type: 'debit' | 'credit';
  amount: number;
  balanceAfter: number;
}

interface BillingState {
  currentAccrued: {
    month: string;
    litresDeliveredSoFar: number;
    amountAccrued: number;
    daysCompleted: number;
    daysSkipped: number;
  };
  bills: BillItem[];
  ledger: LedgerTransaction[];
  isPaymentInProgress: boolean;
  selectedBill: BillItem | null;
}

const INITIAL_BILLS: BillItem[] = [
  {
    id: 201,
    invoiceNumber: 'GWL-202609-001',
    month: 'September 2026',
    startDate: '2026-09-01',
    endDate: '2026-09-30',
    totalLitres: 43.5,
    ratePerLitre: 68.0,
    deliveredDaysCount: 29,
    skippedDaysCount: 1,
    addonsAmount: 0,
    grossAmount: 2958.0,
    discount: 0,
    tax: 0,
    netPayable: 2958.0,
    status: 'unpaid',
    dueDate: '2026-10-05',
    pdfUrl: 'https://gawali.lovable.app/invoices/GWL-202609-001.pdf',
  },
  {
    id: 189,
    invoiceNumber: 'GWL-202608-001',
    month: 'August 2026',
    startDate: '2026-08-01',
    endDate: '2026-08-31',
    totalLitres: 46.5,
    ratePerLitre: 68.0,
    deliveredDaysCount: 31,
    skippedDaysCount: 0,
    addonsAmount: 850, // 1 jar of A2 Ghee
    grossAmount: 4012.0,
    discount: 0,
    tax: 0,
    netPayable: 4012.0,
    status: 'paid',
    dueDate: '2026-09-05',
    paidAt: '2026-09-03 11:24 AM',
    pdfUrl: 'https://gawali.lovable.app/invoices/GWL-202608-001.pdf',
  },
];

const INITIAL_LEDGER: LedgerTransaction[] = [
  {
    id: 1,
    date: '2026-09-25',
    description: 'Milk Delivery - 1.5 L Pure Desi Cow Milk',
    type: 'debit',
    amount: 102.0,
    balanceAfter: 2958.0,
  },
  {
    id: 2,
    date: '2026-09-24',
    description: 'Milk Delivery - 1.5 L Pure Desi Cow Milk',
    type: 'debit',
    amount: 102.0,
    balanceAfter: 2856.0,
  },
  {
    id: 3,
    date: '2026-09-03',
    description: 'UPI Payment Received (Ref: UPI/26090387612)',
    type: 'credit',
    amount: 4012.0,
    balanceAfter: 0.0,
  },
  {
    id: 4,
    date: '2026-08-31',
    description: 'August 2026 Bill Generated',
    type: 'debit',
    amount: 4012.0,
    balanceAfter: 4012.0,
  },
];

const initialState: BillingState = {
  currentAccrued: {
    month: 'September 2026',
    litresDeliveredSoFar: 37.5,
    amountAccrued: 2550.0,
    daysCompleted: 25,
    daysSkipped: 1,
  },
  bills: INITIAL_BILLS,
  ledger: INITIAL_LEDGER,
  isPaymentInProgress: false,
  selectedBill: null,
};

export const billingSlice = createSlice({
  name: 'billing',
  initialState,
  reducers: {
    setSelectedBill: (state, action: PayloadAction<BillItem | null>) => {
      state.selectedBill = action.payload;
    },
    startPayment: (state) => {
      state.isPaymentInProgress = true;
    },
    paymentSuccess: (state, action: PayloadAction<number>) => {
      const billId = action.payload;
      const b = state.bills.find((x) => x.id === billId);
      if (b) {
        b.status = 'paid';
        b.paidAt = new Date().toLocaleString();
      }
      state.isPaymentInProgress = false;
    },
    paymentFailure: (state) => {
      state.isPaymentInProgress = false;
    },
  },
});

export const { setSelectedBill, startPayment, paymentSuccess, paymentFailure } =
  billingSlice.actions;

export default billingSlice.reducer;
