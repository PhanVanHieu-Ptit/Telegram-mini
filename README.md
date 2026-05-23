# 3HChat — Backend API

A production-ready REST + WebSocket API powering a Telegram-like real-time messaging and calling platform. Built with Fastify for high-throughput performance, it handles authentication, chat, WebRTC call lifecycle, MQTT-based presence, media uploads, and push notifications — all in a single, well-structured TypeScript service.


---

## Tech Stack

| Technology | Why it was chosen |
|---|---|
| **Fastify 5** | 3–4× faster than Express; built-in JSON schema validation reduces boilerplate |
| **TypeScript 5** | End-to-end type safety across routes, services, and database models |
| **MongoDB 9** | Flexible document schema for messages, reactions, edit history, and nested attachments |
| **PostgreSQL 8** | Relational integrity for users, conversation membership, and read receipts |
| **Socket.IO 4** | Bidirectional WebSocket with room-based event routing for real-time chat |
| **MQTT 5** | Lightweight pub/sub for presence heartbeats and typing indicators |
| **JWT + bcrypt** | Stateless sessions with hashed credentials — no server-side session store needed |
| **Google & Facebook OAuth2** | Social login via `@fastify/oauth2` — offloads credential management |
| **Cloudinary** | CDN-backed media processing for images, video, and audio attachments |
| **AWS S3** | Direct presigned uploads for larger file attachments, bypassing the API server |
| **Firebase Admin SDK** | Server-side Firebase Cloud Messaging for cross-platform push notifications |
| **Swagger / @fastify/swagger** | Auto-generated OpenAPI docs from route schemas — always in sync |
| **Docker** | Multi-stage build image deployable to HuggingFace Spaces on port 7860 |

---

## Key Features

- **Multi-provider authentication** — email/password, Google OAuth 2.0, Facebook OAuth 2.0, all issuing JWT cookies
- **Full-featured messaging** — send, edit (with history), soft-delete, pin, hide/unhide, react with emoji, reply, forward
- **Media messages** — images, video, audio, and files via Cloudinary or S3 presigned URLs
- **Full-text message search** via MongoDB text index
- **AI message summarization** — `POST /api/v2/summarize` endpoint
- **WebRTC call lifecycle** — `start → ringing → ongoing → ended/missed/rejected`, persisted to MongoDB
- **METERED TURN/STUN servers** — `GET /calls/get-ice-servers` returns ready-to-use ICE config
- **MQTT presence system** — online/offline tracking and typing indicators over pub/sub
- **Socket.IO real-time events** — typing start/stop, message seen, conversation updates
- **Firebase push notifications** — per-user FCM token management and multi-cast delivery
- **Internal API** — secure `POST /internal/call-event` endpoint consumed by the CallWebRTC service
- **Swagger UI** — interactive API docs available at `/docs`

---

## Installation & Setup

### Prerequisites

- Node.js 20+
- MongoDB instance
- PostgreSQL instance
- MQTT broker (e.g. Mosquitto on `localhost:1883`)
- Redis (optional, for CallWebRTC scaling)
- Cloudinary account, AWS S3 bucket, Firebase project, Metered account

### Steps

```bash
# 1. Enter the directory
cd Telegram-mini

# 2. Install dependencies
npm install

# 3. Configure environment
cp .env.example .env
# Edit .env — fill in Mongo URI, PG credentials, JWT secret, OAuth keys, etc.

# 4. Start in development mode
npm run dev
# Server starts on http://localhost:3000
# Swagger UI at http://localhost:3000/docs
```

### Docker (production / HuggingFace Spaces)

```bash
docker build -t 3hchat-api .
docker run -p 7860:7860 --env-file .env 3hchat-api
```

### Key environment variables

```env
MONGO_URI=mongodb://...
MONGO_DB_NAME=chat_app
PG_HOST=localhost
PG_PORT=5432
PG_DATABASE=chat_app
PG_USER=postgres
PG_PASSWORD=secret

JWT_SECRET=your_jwt_secret          # must match CallWebRTC service
COOKIE_SECRET=your_cookie_secret

MQTT_BROKER_URL=mqtt://localhost:1883
RTC_SERVICE_URL=http://localhost:4000
INTERNAL_API_KEY=shared_secret      # must match CallWebRTC service

CORS_ORIGIN=http://localhost:5173

GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
FACEBOOK_APP_ID=...
FACEBOOK_APP_SECRET=...

CLOUDINARY_CLOUD_NAME=...
AWS_S3_BUCKET=...
FIREBASE_PROJECT_ID=...
METERED_APP_HOST=...
METERED_API_KEY=...
```

---

## API Overview

| Area | Endpoints |
|---|---|
| Auth | `POST /auth/register`, `/auth/login`, `/auth/logout`, `/auth/me` |
| OAuth | `GET /auth/google`, `/auth/facebook` (+ callbacks) |
| Messages | `POST /messages`, `GET /messages/:convId`, reactions, pin, edit, delete, search, summarize |
| Calls | `POST /calls/start`, `/accept`, `/reject`, `/end`, `GET /calls/history`, `/get-ice-servers` |
| Users | `GET /users/:id`, `GET /users/search` |
| Upload | `POST /upload/presigned-url` (S3), `POST /messages/upload-attachments` (Cloudinary) |
| Presence | `GET /presence/:userId` |
| Notifications | FCM token registration |
| Internal | `POST /internal/call-event` (RTC service only) |

---

## What I Learned

1. **Fastify schema-first routing** forces you to define request/response shapes up front — this alone eliminated an entire class of runtime type errors and auto-generated the Swagger docs for free, with zero extra work.

2. **Running MongoDB and PostgreSQL side by side** is not overkill when the data models genuinely differ. Messages are deeply nested, schema-flexible documents; users and conversation membership are inherently relational. Forcing one model onto the other would have introduced the real complexity.

3. **MQTT and Socket.IO serve different real-time roles**: MQTT's pub/sub model is a natural fit for broadcast presence (many clients subscribed to a topic), while Socket.IO's room model is better for targeted bidirectional events like typing indicators and seen receipts. Using both means each protocol does what it excels at.

4. **Separating WebRTC signaling into its own microservice** keeps this API stateless — no socket rooms for call state here, just REST persistence. That made horizontal scaling straightforward and kept this codebase focused on business logic.

5. **Deploying to HuggingFace Spaces via Docker** (port 7860) is a zero-cost production hosting path during early development. The multi-stage Dockerfile keeps the final image lean, and Spaces handles TLS and domain routing automatically.
