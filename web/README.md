# Gawali — web app

React + TypeScript + Tailwind + Framer Motion front end for the three roles:
customer (`/app`), gawali / dairy owner (`/console`) and delivery partner (`/route`).
It talks to the Django API in `../backend` (`/api/v2/…`).

## Run locally

```bash
# 1. Backend (from backend/)
./venv/Scripts/python.exe manage.py migrate
./venv/Scripts/python.exe manage.py seed_demo      # demo data, safe to re-run
./venv/Scripts/python.exe manage.py runserver 0.0.0.0:8000   # uses Neon from ../.env.local

# 2. Front end (from web/)
npm install
npm run dev                                          # http://localhost:5173
```

Vite proxies `/api` and `/media` to `http://127.0.0.1:8000` (override with `GAWALI_API`).

## Demo accounts (password `Gawali@2026`)

| Role | Email |
| --- | --- |
| Customer | customer@gawali.demo |
| Gawali (dairy) | gawali@gawali.demo |
| Delivery partner | delivery@gawali.demo |

The login page has one-tap buttons for each. New customers and dairies can sign up;
delivery partners are invited from the dairy console (Routes & team).

## Database & files

Neon (Singapore): Lakebase Postgres for data, Neon Object Storage for photos. `neon deploy` writes the
connection variables to the repo-root `.env.local`; the backend uses the pooled `DATABASE_URL` for traffic
and `DATABASE_URL_UNPOOLED` for migrations. Tests always use a local SQLite file and never touch Neon.

## AI (NVIDIA NIM) — one model per job

| Job | Model | Where |
| --- | --- | --- |
| Customer support chat | `minimaxai/minimax-m3.1-flash` | Ask Gawali assistant |
| Refund photo verification | `nvidia/nemotron-3.5-super-vl-120b-a12b` | Issue with today’s milk |
| Insights, recommendations, route briefs | `nvidia/nemotron-3.5-lightning-30b-a3b` | Dairy overview, Shop, Partner app |
| Lab-report reading | `nvidia/nemotron-parse` | Quality lab → Scan lab report |

Configured in `backend/.env` (`NVIDIA_API_KEY`, optional failover `NVIDIA_API_KEY_ALT`,
`NVIDIA_CHAT_MODEL`, `NVIDIA_VISION_MODEL`, `NVIDIA_INSIGHT_MODEL`, `NVIDIA_PARSE_MODEL`).
Model "thinking" is switched off so every job answers in about 1–4 s. Without a key every feature falls
back to deterministic rules, labelled "Smart rules" in the UI.

**Grounding & training data.** Hosted NIM models can't be fine-tuned through this API, so each job is
grounded with domain instructions and worked examples (Hinglish/Marathi phrasing, refund criteria, route
semantics). Every call is logged in the `AIInteraction` table; when a dairy approves or rejects a flagged
refund, that decision labels the vision call. Export labelled data for evaluation or a future fine-tune:

```bash
./venv/Scripts/python.exe manage.py export_ai_dataset --task vision --labelled > vision.jsonl
```

## Payments

`PAYMENTS_ENABLED=False` (default): UPI top-up, withdrawal and Autopay are hidden and refused by the API.
Deliveries are still recorded in each household’s ledger (a negative balance is the amount due), and the
dairy records cash/UPI it collects from the household drawer (**Households → Record a payment**).
Set `PAYMENTS_ENABLED=True` to bring the gateway screens back once a real gateway is connected.

## Scripts

- `npm run dev` — dev server
- `npm run build` — typecheck + production build to `dist/`
- `npm run typecheck`
