# 🥛 Gawali — Enterprise-Grade Milk Subscription Platform for India

> *"Your milkman, in your pocket. Skip a day, add extra, pay later."*  
> Reference Web Architecture: [gawali.lovable.app](https://gawali.lovable.app/)

Gawali is an enterprise-grade milk subscription and vendor delivery management platform designed for the Indian dairy ecosystem. It unifies milkmen/dairies, daily consumers, delivery boys, and platform administrators in a seamless, high-performance ecosystem with automated daily route planning, strict 10:00 PM cutoff locking, postpaid monthly billing, GST tax invoice generation via ReportLab, and instant UPI/Razorpay payment processing.

---

## 🌟 Key Product Features

### 👤 Customer App
- **Daily Milk Plan**: Configure recurring cow milk (A2) or buffalo milk subscriptions with flexible daily quantities (e.g., 1.5 L/day).
- **Daily Delivery Calendar & Skip Rules**: Full month visual grid. Easily toggle **Skip (0L)**, **Double (3L)**, or **Custom Quantity** on any upcoming date before the 10:00 PM cutoff. Past days and today's delivered records remain immutably locked.
- **Store & Add-ons**: Order farm-fresh artisanal dairy items (Vedic Bilona Gir Cow Ghee, fresh Malai Paneer, set buffalo curd, white table butter) delivered right with your morning milk and billed post-paid at month end.
- **Postpaid Monthly Billing**: Consolidated monthly invoices generated on the 1st of each month. Itemized breakdown showing exact delivered vs skipped dates. 1-tap UPI payment and downloadable PDF receipts.
- **Direct Milkman Communication**: 1-tap WhatsApp and phone support with the assigned dairy vendor.
- **Multilingual & Appearance**: Native Marathi (मराठी), Hindi (हिंदी), and English (EN) with Dark Mode and Light Mode support.

### 🥛 Dairy / Vendor Portal (e.g., Badhale Dairy)
- **Live Morning Delivery Run**: Progress bar tracking delivered vs pending stops (e.g., 42/50 delivered, 84%).
- **Route Checklist**: Sequenced customer list by flat and wing (A-402, A-201, B-503...) with delivery notes, turn-by-turn Google Maps navigation, and 1-tap "Mark Delivered".
- **Customer Directory & Ledger**: Comprehensive subscriber roster with real-time balance tracking, credit/debit transaction log, and offline cash payment recording.
- **Automated Collection Reminders**: 1-tap WhatsApp payment reminders with deep links for overdue balances.
- **Product & Rate Management**: Configure selling prices per litre, manage catalog availability.
- **Reports & Analytics**: Monthly volume tallies, collection rates, and 1-tap CSV export of delivery registers.

### 🚚 Delivery Partner (e.g., Suresh Kadam)
- **Morning Shift Checklist**: High-contrast, tactile interface built for rapid delivery on two-wheelers.
- **Sequential Stops & GPS**: Stop-by-stop navigation to customer flat numbers with special drop notes (e.g., "Leave in door pouch, ring bell once").
- **1-Tap Status Updates**: Real-time status sync to customer and dairy portals.

### 👑 Platform Admin (e.g., Mahesh Garade)
- **Platform Analytics**: Gross Merchandise Value (GMV), active dairies, consumer count, and city-wide daily delivery volume.
- **Dairy Onboarding**: Vendor approvals, suspension toggles, and commission audit logs.

---

## 🔑 Pre-Seeded Demo Accounts (1-Tap Login Available)

| Role | Name | Email | Password | Phone |
| :--- | :--- | :--- | :--- | :--- |
| **Admin** | Mahesh Garade | `mahesh.garade@gawali.app` | `Admin@12345` | `+919876543210` |
| **Dairy / Vendor** | Shailesh Badhale (*Badhale Dairy*) | `shailesh.badhale@gawali.app` | `Gawali@12345` | `+919876543211` |
| **Customer** | Rahul Patil | `rahul.patil@example.com` | `Customer@12345` | `+919876543212` |
| **Delivery Boy** | Suresh Kadam | `suresh.kadam@gawali.app` | `Delivery@12345` | `+919876543213` |

> ⚡ **Tip**: The mobile app includes **1-Tap Instant Demo Login** buttons on the login screen and profile screens for frictionless evaluation without typing credentials.

---

## 🏗️ Architecture Overview

```
                      ┌──────────────────────────────────────────────┐
                      │            GAWALI MOBILE CLIENT              │
                      │  React Native CLI (Fabric + TurboModules)    │
                      │   Redux Toolkit + i18next + Reanimated       │
                      └──────────────────────┬───────────────────────┘
                                             │ REST API / JWT
                                             ▼
                      ┌──────────────────────────────────────────────┐
                      │             DJANGO REST BACKEND              │
                      │       Python 3.12 • Django 5.1 • DRF        │
                      └──────────────┬────────────────┬──────────────┘
                                     │                │
            ┌────────────────────────┴───┐       ┌────┴─────────────────────────┐
            │       PostgreSQL 16        │       │       Redis 7 + Celery       │
            │   ACID Transaction Store   │       │  Daily Route Gen & Reminders │
            └────────────────────────────┘       └──────────────────────────────┘
```

---

## 🚀 Getting Started

### 1. Backend Setup (Django REST Framework)

```bash
cd backend

# Create and activate virtual environment
python -m venv venv
# On Windows:
.\venv\Scripts\activate
# On Linux/macOS:
source venv/bin/activate

# Install dependencies
pip install -r requirements.txt

# Run migrations
python manage.py migrate

# Seed complete demo data (Badhale Dairy, products, subscriptions, 30 days of deliveries, bills)
python manage.py seed_gawali

# Start development API server
python manage.py runserver 0.0.0.0:8000
```

The API will be live at `http://127.0.0.1:8000/`.
- **OpenAPI Schema / Swagger**: `http://127.0.0.1:8000/api/docs/`
- **Django Admin**: `http://127.0.0.1:8000/admin/`

#### Run Backend Tests
```bash
pytest -v
# 20 tests pass with full model, subscription, cutoff, and invoice coverage!
```

---

### 2. Mobile App Setup (React Native CLI)

```bash
cd mobile

# Install dependencies
npm install --legacy-peer-deps

# Run TypeScript type check
npm run typecheck

# Run unit tests
npm test

# Start Metro Bundler
npm start

# Run on Android Emulator / Device (New Architecture Fabric enabled)
npm run android

# Run on iOS Simulator (macOS only)
cd ios && pod install && cd ..
npm run ios
```

---

### 3. Docker Compose (Full Stack Orchestration)

To spin up the entire backend stack with PostgreSQL, Redis, Django API, Celery worker, and Celery beat:

```bash
cd backend
docker-compose up -d --build
```

---

## 📦 Directory Structure

```
gawali/
├── backend/
│   ├── apps/
│   │   ├── accounts/         # Custom User model, JWT authentication, roles
│   │   ├── dairies/          # Vendor business profiles, bank accounts
│   │   ├── customers/        # Customer delivery addresses, GPS coordinates
│   │   ├── products/         # Milk & dairy product catalog, unit rates
│   │   ├── subscriptions/    # Recurring plans, day overrides (skips/extras)
│   │   ├── deliveries/       # Daily route generation, status updates
│   │   ├── billing/          # Monthly bills, ReportLab PDF invoices, ledger
│   │   ├── payments/         # UPI / Razorpay integration
│   │   ├── complaints/       # Customer dispute ticketing
│   │   ├── reports/          # Vendor CSV/PDF volume exports
│   │   ├── notifications/    # WhatsApp / Push / SMS queues
│   │   └── core/             # Base models, cutoff utilities, seed scripts
│   ├── tests/                # 20 automated Pytest test cases
│   ├── schema.yml            # OpenAPI 3.0 specification (92 KB)
│   ├── Dockerfile
│   └── docker-compose.yml
│
├── mobile/
│   ├── android/              # Native Android (Fabric newArchEnabled=true, Hermes)
│   ├── ios/                  # Native iOS (Fabric enabled, Hermes)
│   ├── src/
│   │   ├── app/
│   │   │   ├── store/        # Redux Toolkit (auth, subscription, delivery, billing)
│   │   │   ├── navigation/   # Role-based RootNavigator, Tabs, Stacks
│   │   │   └── App.tsx       # Root Provider composition
│   │   ├── features/
│   │   │   ├── auth/         # Login (with 1-tap demo switch), Signup, OTP
│   │   │   ├── customer/     # Home, Calendar (Day override sheet), Shop, Bills, Profile
│   │   │   ├── dairy/        # Dashboard, Deliveries Checklist, Customers, Products, Reports
│   │   │   ├── delivery/     # Morning Route Runner with GPS & Turn-by-Turn
│   │   │   └── admin/        # Platform GMV & Dairy Onboarding
│   │   └── shared/
│   │       ├── api/          # Axios client with auto-refresh interceptors
│   │       ├── theme/        # Emerald green palette, dark/light ThemeContext
│   │       ├── i18n/         # English, मराठी, हिंदी translation dictionaries
│   │       ├── ui/           # Card, Badge, Input, QuantityStepper, Header, CalendarStrip
│   │       └── utils/        # 10 PM cutoff calculation, INR formatters
│   ├── fastlane/             # Fastfile build lanes for Android & iOS
│   └── __tests__/            # Jest unit tests
│
└── .github/
    └── workflows/
        └── ci.yml            # Automated GitHub Actions test & build pipeline
```

---

## 🔒 Business Logic & Rules

1. **Daily Cutoff Rule**:
   - Next-day delivery changes (e.g. skip tomorrow, add +1L) lock strictly at the dairy's configured cutoff time (default `22:00:00` / 10:00 PM).
   - Past days and the current date cannot be modified by the customer.
2. **Postpaid Billing Calculation**:
   $$\text{Monthly Bill} = \sum (\text{Delivered Quantity} \times \text{Locked Rate}) + \sum \text{Add-on Orders} - \text{Discount}$$
   - Skipped days ($\text{Qty} = 0$) are billed at ₹0.
3. **Receipt Generation**:
   - Every invoice generates an itemized PDF using ReportLab containing dairy GSTIN, customer address, delivery date breakdown, and UPI QR code.

---

## 📄 License
Proprietary & Confidential — Built for Gawali Technologies.
