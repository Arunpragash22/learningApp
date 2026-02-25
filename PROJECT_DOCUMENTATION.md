# ClassPulse — Real-Time Student Engagement Analytics Platform

## Complete Project Documentation

---

## Table of Contents

1. [Project Overview](#1-project-overview)
2. [System Architecture](#2-system-architecture)
3. [Technology Stack](#3-technology-stack)
4. [Project Structure](#4-project-structure)
5. [Backend — FastAPI Server](#5-backend--fastapi-server)
   - 5.1 [Application Setup & Lifespan](#51-application-setup--lifespan)
   - 5.2 [Database Layer](#52-database-layer)
   - 5.3 [Authentication & Authorization](#53-authentication--authorization)
   - 5.4 [API Routers (Endpoints)](#54-api-routers-endpoints)
   - 5.5 [Services Layer](#55-services-layer)
   - 5.6 [Data Models](#56-data-models)
6. [Machine Learning Pipeline](#6-machine-learning-pipeline)
   - 6.1 [Preprocessing](#61-preprocessing)
   - 6.2 [KMeans Clustering (Model Training)](#62-kmeans-clustering-model-training)
   - 6.3 [Prediction & Label Mapping](#63-prediction--label-mapping)
   - 6.4 [Engagement Score Computation](#64-engagement-score-computation)
7. [Real-Time Data Flow](#7-real-time-data-flow)
   - 7.1 [WebSocket Architecture](#71-websocket-architecture)
   - 7.2 [Quiz Delivery Pipeline](#72-quiz-delivery-pipeline)
   - 7.3 [Answer → Clustering → Feedback Pipeline](#73-answer--clustering--feedback-pipeline)
8. [Feedback Generation System](#8-feedback-generation-system)
9. [Frontend — React Application](#9-frontend--react-application)
   - 9.1 [Routing & Layout](#91-routing--layout)
   - 9.2 [Context Providers (State Management)](#92-context-providers-state-management)
   - 9.3 [Student-Facing Pages](#93-student-facing-pages)
   - 9.4 [Instructor-Facing Pages](#94-instructor-facing-pages)
   - 9.5 [Shared Components](#95-shared-components)
10. [Session & Report System](#10-session--report-system)
11. [Zoom Integration](#11-zoom-integration)
12. [Network Latency Monitoring](#12-network-latency-monitoring)
13. [Email Service](#13-email-service)
14. [Dark Theme & Responsive Design](#14-dark-theme--responsive-design)
15. [Sample Execution Flow](#15-sample-execution-flow)
16. [Deployment](#16-deployment)
17. [MongoDB Collections Reference](#17-mongodb-collections-reference)

---

## 1. Project Overview

**ClassPulse** is a full-stack real-time learning analytics platform built for live online classrooms. It integrates with Zoom meetings to deliver quizzes to students in real time, analyze their engagement using machine learning (KMeans clustering), and provide personalized feedback — all while a class is in session.

### Core Goals

- **Real-time quiz delivery** during live Zoom sessions via WebSocket
- **Automatic student engagement classification** using KMeans (k=3) clustering into Active, Moderate, and Passive/At-Risk groups
- **Personalized feedback** for each student with accuracy stats, response times, and actionable suggestions
- **Instructor analytics dashboard** with live participant counts, cluster distributions, and per-student breakdowns
- **Session reports** with downloadable PDF/HTML reports containing performance graphs
- **Network-aware analysis** — students with poor connections are not unfairly penalized

### Key Features

| Feature | Description |
|---------|-------------|
| Live Quiz Delivery | Questions sent to students via WebSocket during Zoom meetings |
| Smart Question Selection | First question is always generic; subsequent questions are cluster-specific |
| KMeans Engagement Clustering | Students grouped into Active / Moderate / Passive using ML |
| Personalized Feedback | Curated encouragement pool + accurate stats per student |
| Real-Time Analytics | Live student counts, cluster distribution, quiz performance |
| Session Reports | Auto-generated reports with graphs (accuracy, response time, cluster level) |
| Latency Monitoring | WebRTC-aware RTT/jitter tracking per student |
| Zoom Integration | Automatic session management via Zoom webhooks |
| Role-Based Access | Student, Instructor, and Admin dashboards |
| Dark Theme | Full dark mode support across all pages |
| Responsive Design | Mobile and tablet optimized UI |
| Contact & Feedback | Contact form with email delivery, website feedback with star ratings |

---

## 2. System Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                        FRONTEND (React + Vite)                       │
│                                                                       │
│  ┌──────────┐  ┌──────────────┐  ┌───────────────┐  ┌────────────┐ │
│  │ Student   │  │ Instructor   │  │ Admin          │  │ Auth Pages │ │
│  │ Dashboard │  │ Dashboard    │  │ Dashboard      │  │ Login/Reg  │ │
│  │ Engagement│  │ Analytics    │  │ User Mgmt      │  │            │ │
│  │ Reports   │  │ Questions    │  │                │  │            │ │
│  └─────┬─────┘  └──────┬───────┘  └───────┬────────┘  └─────┬──────┘ │
│        │               │                  │                 │        │
│        └───────────────┼──────────────────┼─────────────────┘        │
│                        │                  │                          │
│              ┌─────────▼──────────────────▼─────────┐                │
│              │   SessionConnectionContext (WebSocket) │                │
│              │   AuthContext (JWT)                    │                │
│              │   ThemeContext (Dark/Light)             │                │
│              └─────────────────┬──────────────────────┘                │
└────────────────────────────────┼──────────────────────────────────────┘
                                 │
                    HTTP REST API + WebSocket
                                 │
┌────────────────────────────────▼──────────────────────────────────────┐
│                      BACKEND (FastAPI + Python)                        │
│                                                                        │
│  ┌────────────────────────────────────────────────────────────────┐   │
│  │                      API ROUTERS                                │   │
│  │  auth | session | live | quiz | feedback | clustering |         │   │
│  │  preprocessing | question | reports | latency | contact         │   │
│  └──────────┬────────────────────┬────────────────────┬───────────┘   │
│             │                    │                    │               │
│  ┌──────────▼─────┐  ┌──────────▼──────┐  ┌─────────▼──────────┐   │
│  │   SERVICES      │  │  ML PIPELINE     │  │  WEBSOCKET MANAGER │   │
│  │ quiz_service    │  │  Preprocessing   │  │  Session Rooms     │   │
│  │ feedback_service│  │  KMeans Predict  │  │  Global Broadcast  │   │
│  │ email_service   │  │  Clustering Svc  │  │  Quiz Delivery     │   │
│  │ quiz_scheduler  │  │                  │  │  Feedback Push     │   │
│  │ zoom_service    │  │                  │  │                    │   │
│  └──────────┬──────┘  └──────────┬───────┘  └────────────────────┘   │
│             │                    │                                    │
│  ┌──────────▼────────────────────▼───────────────────────────────┐   │
│  │                    DATA MODELS (MongoDB)                       │   │
│  │  users | sessions | quiz_answers | questions |                 │   │
│  │  clusters | preprocessed_engagement | session_participants |   │   │
│  │  latency_metrics | question_assignments | session_reports      │   │
│  └──────────┬────────────────────────────────────────────────────┘   │
└─────────────┼────────────────────────────────────────────────────────┘
              │
   ┌──────────▼──────────┐     ┌────────────────────┐
   │   MongoDB (Primary)  │     │  MySQL (Backup)     │
   │   Source of Truth     │     │  Read-Only Audit    │
   └──────────────────────┘     └────────────────────┘
```

---

## 3. Technology Stack

### Backend

| Technology | Purpose |
|-----------|---------|
| **Python 3.11+** | Server-side programming language |
| **FastAPI 0.104** | Async web framework with automatic OpenAPI docs |
| **Motor 3.3** | Async MongoDB driver for Python |
| **PyMongo 4.6** | MongoDB driver (used by Motor internally) |
| **Pandas 2.0+** | Data manipulation for preprocessing and feedback |
| **NumPy 1.24+** | Numerical computations |
| **scikit-learn 1.3+** | KMeans clustering model |
| **joblib 1.3+** | Model serialization (.pkl files) |
| **PyJWT 2.8** | JSON Web Token authentication |
| **Resend 2.0** | Transactional email delivery API |
| **httpx 0.27** | Async HTTP client (Zoom API calls) |
| **Uvicorn** | ASGI server for FastAPI |

### Frontend

| Technology | Purpose |
|-----------|---------|
| **React 18.3** | UI component library |
| **TypeScript 5.5** | Type-safe JavaScript |
| **Vite 7.1** | Build tool and dev server |
| **React Router DOM 6.30** | Client-side routing |
| **Tailwind CSS 3.4** | Utility-first CSS framework |
| **Recharts 3.7** | Charting library for analytics graphs |
| **Lucide React** | Icon library |
| **Sonner 2.0** | Toast notification library |
| **html2pdf.js** | PDF report generation from HTML |

### Infrastructure

| Technology | Purpose |
|-----------|---------|
| **MongoDB Atlas** | Cloud-hosted primary database |
| **MySQL** | Optional backup database for auditing |
| **Railway** | Deployment platform (backend + frontend) |
| **Zoom API** | Video conferencing integration |
| **Zoom Webhooks** | Real-time meeting event notifications |
| **WebSocket** | Bidirectional real-time communication |

---

## 4. Project Structure

```
project_fyp-main/
├── backend/
│   ├── requirements.txt              # Python dependencies
│   └── src/
│       ├── main.py                   # FastAPI app entry point
│       ├── database/
│       │   ├── connection.py         # MongoDB + MySQL connection management
│       │   ├── mysql_connection.py   # MySQL backup connection
│       │   └── seed.py              # Database seeding utilities
│       ├── middleware/
│       │   └── auth.py              # JWT authentication middleware
│       ├── ml_models/
│       │   ├── kmeans_predictor.py   # KMeans model wrapper (load + predict)
│       │   └── kmeans_k3.pkl        # Pre-trained KMeans (k=3) model file
│       ├── models/
│       │   ├── user.py              # User data model
│       │   ├── course.py            # Course model with enrollment
│       │   ├── question.py          # Quiz question model
│       │   ├── quiz_answer.py       # Quiz answer schema
│       │   ├── quiz_answer_model.py # Quiz answer DB operations
│       │   ├── cluster.py           # StudentCluster Pydantic model
│       │   ├── cluster_model.py     # Cluster DB operations
│       │   ├── preprocessing.py     # PreprocessingService (engagement computation)
│       │   ├── session_participant_model.py  # Session participant tracking
│       │   ├── session_report_model.py       # Report generation + persistence
│       │   ├── question_assignment_model.py  # Per-student question assignments
│       │   ├── question_session_model.py     # Session-level question state
│       │   └── latency_metrics.py   # Latency data model
│       ├── routers/
│       │   ├── auth.py              # Login, register, verify email, reset password
│       │   ├── session.py           # CRUD sessions, start/end/join
│       │   ├── live.py              # Trigger questions to students
│       │   ├── quiz.py              # Submit answers, get stats
│       │   ├── question.py          # CRUD quiz questions
│       │   ├── feedback.py          # Personalized student feedback API
│       │   ├── clustering.py        # Get/update clusters, engagement data
│       │   ├── preprocessing.py     # Trigger preprocessing pipeline
│       │   ├── session_report.py    # Generate + download reports
│       │   ├── student_reports.py   # Student-specific report endpoints
│       │   ├── instructor_reports.py # Instructor analytics endpoints
│       │   ├── latency.py           # Network latency monitoring
│       │   ├── course.py            # Course management
│       │   ├── contact.py           # Contact form + email
│       │   ├── profile.py           # User profile management
│       │   ├── push_notification.py # Web push notifications
│       │   ├── zoom_webhook.py      # Zoom event webhooks
│       │   ├── zoom_chatbot.py      # Zoom chatbot integration
│       │   └── mysql_sync.py        # MongoDB → MySQL sync
│       ├── services/
│       │   ├── quiz_service.py      # Quiz logic, answer processing, auto-clustering
│       │   ├── feedback_service.py  # Feedback generation with encouragement pool
│       │   ├── ws_manager.py        # WebSocket connection manager
│       │   ├── quiz_scheduler.py    # Automated quiz delivery scheduler
│       │   ├── clustering_service.py # KMeans clustering orchestration
│       │   ├── email_service.py     # Resend email delivery
│       │   ├── zoom_service.py      # Zoom API integration
│       │   ├── zoom_webhook_service.py # Zoom webhook event processing
│       │   ├── zoom_chat_service.py # Zoom chat integration
│       │   ├── push_service.py      # Push notification service
│       │   └── mysql_backup_service.py # MySQL backup operations
│       └── utils/
│           └── jwt_utils.py         # JWT token encode/decode
│
├── frontend/
│   ├── package.json                 # Node.js dependencies
│   ├── tailwind.config.js           # Tailwind CSS configuration
│   ├── vite.config.ts               # Vite build configuration
│   └── src/
│       ├── App.tsx                   # Root component with all routes
│       ├── main.tsx                  # React entry point
│       ├── context/
│       │   ├── AuthContext.tsx       # Authentication state (JWT, user info)
│       │   ├── SessionConnectionContext.tsx  # WebSocket + quiz state
│       │   └── ThemeContext.tsx      # Dark/light theme toggle
│       ├── components/
│       │   ├── layout/
│       │   │   ├── DashboardLayout.tsx  # Main app shell (sidebar, header, footer)
│       │   │   ├── AuthLayout.tsx       # Auth pages layout
│       │   │   ├── Footer.tsx           # Footer with policies, feedback, contact
│       │   │   └── ThemeToggle.tsx      # Dark mode toggle button
│       │   ├── feedback/
│       │   │   ├── PersonalizedFeedback.tsx  # Feedback cards (color-coded by cluster)
│       │   │   └── FeedbackGraphs.tsx       # Performance trend charts
│       │   ├── engagement/
│       │   │   └── ConnectionQualityIndicator.tsx  # Network quality badge
│       │   ├── quiz/
│       │   │   └── QuizPopup.tsx        # Quiz question popup (global)
│       │   └── ui/                     # Reusable UI components (Button, Card, Badge, etc.)
│       ├── pages/
│       │   ├── auth/                   # Login, Register, ForgotPassword, ResetPassword
│       │   ├── dashboard/
│       │   │   ├── StudentDashboard.tsx      # Student home (learning summary)
│       │   │   ├── InstructorDashboard.tsx   # Instructor home (session overview)
│       │   │   ├── AdminDashboard.tsx        # Admin home (user stats)
│       │   │   ├── StudentEngagement.tsx     # Student engagement dashboard
│       │   │   └── InstructorAnalytics.tsx   # Live analytics (clusters, stats)
│       │   ├── sessions/               # Session list, live session, create/edit
│       │   ├── questions/              # Question management (CRUD)
│       │   ├── courses/                # Course management and enrollment
│       │   ├── reports/                # Session reports
│       │   ├── profile/               # User profile page
│       │   ├── ContactUs.tsx          # Contact form page
│       │   ├── student/               # Student-specific reports
│       │   └── instructor/            # Instructor-specific reports
│       ├── services/
│       │   ├── authService.ts         # Auth API calls
│       │   ├── sessionService.ts      # Session API calls
│       │   └── quizService.ts         # Quiz API calls
│       └── hooks/
│           ├── useLatencyMonitor.ts   # RTT/jitter ping hook
│           ├── useSessionSocket.ts    # WebSocket connection hook
│           └── useNotifications.ts    # Push notification hook
│
└── PROJECT_DOCUMENTATION.md          # This file
```

---

## 5. Backend — FastAPI Server

### 5.1 Application Setup & Lifespan

**File: `backend/src/main.py`**

The FastAPI application uses an async lifespan context manager that:

1. **Connects to MongoDB** (primary database — required)
2. **Connects to MySQL** (backup database — optional, non-blocking)
3. **Loads the KMeans model** from `ml_models/kmeans_k3.pkl` (optional, non-blocking)
4. On shutdown, cleanly closes all database connections

```python
@asynccontextmanager
async def lifespan(app: FastAPI):
    await connect_to_mongo()
    await connect_to_mysql_backup()
    # Load KMeans ML model
    predictor = KMeansPredictor()
    predictor.load()
    yield
    await close_mysql_backup()
    await close_mongo_connection()
```

**Middleware**: CORS is configured to allow all origins for development. The `AuthMiddleware` extracts JWT tokens from every request and attaches the user to `request.state`.

**WebSocket Endpoints** (defined in `main.py`):
- `/ws/session/{session_id}/{student_id}` — Per-session student connection for quiz delivery and feedback
- `/ws/global/{user_id}` — Global connection for announcements (session started, meeting ended)

### 5.2 Database Layer

**File: `backend/src/database/connection.py`**

**Hybrid Architecture:**
- **MongoDB (Primary)**: Source of truth for all data — users, sessions, quiz answers, clusters, reports
- **MySQL (Backup)**: Read-only backup for auditing and reporting. Sync is optional.

The connection module provides:
- `connect_to_mongo()` — Connects using `MONGODB_URL` environment variable via Motor (async driver)
- `get_database()` — Returns the MongoDB database instance
- MongoDB Atlas is used in production with TLS/SSL enabled

### 5.3 Authentication & Authorization

**File: `backend/src/middleware/auth.py`**

Authentication uses **JWT (JSON Web Tokens)**:

1. **Registration** (`POST /api/auth/register`):
   - User provides name, email, password, role (student/instructor)
   - Password is hashed (bcrypt)
   - Verification email sent via Resend
   - Account must be activated via email link

2. **Login** (`POST /api/auth/login`):
   - Validates credentials
   - Returns JWT access token with user ID, email, and role
   - Token stored in browser's `sessionStorage`

3. **Request Authentication**:
   - Every request passes through `AuthMiddleware`
   - Extracts `Bearer` token from `Authorization` header
   - Decodes JWT and attaches user to `request.state.user`
   - `get_current_user` dependency checks authentication
   - `require_instructor` dependency enforces instructor/admin role

**Roles:**
| Role | Access |
|------|--------|
| `student` | Student dashboard, engagement, own reports, quiz answering |
| `instructor` | Instructor dashboard, analytics, question management, session control |
| `admin` | All instructor capabilities + user management |

### 5.4 API Routers (Endpoints)

#### Authentication Router (`/api/auth`)
| Endpoint | Method | Description |
|----------|--------|-------------|
| `/register` | POST | Create new user account |
| `/login` | POST | Authenticate and get JWT token |
| `/verify-email/{token}` | GET | Activate account via email link |
| `/forgot-password` | POST | Send password reset email |
| `/reset-password` | POST | Reset password with token |

#### Session Router (`/api/sessions`)
| Endpoint | Method | Description |
|----------|--------|-------------|
| `/` | GET | List sessions (filtered by role/enrollment) |
| `/` | POST | Create session + Zoom meeting |
| `/{id}` | GET | Get session details |
| `/{id}` | PUT | Update session |
| `/{id}/start` | POST | Mark session as live, start quiz automation |
| `/{id}/end` | POST | End session, generate report, send emails, broadcast meeting_ended |
| `/{id}/join` | POST | Student joins session |
| `/{id}/leave` | POST | Student leaves session |
| `/enroll-by-key` | POST | Enroll in standalone session with key |

#### Live Question Router (`/api/live`)
| Endpoint | Method | Description |
|----------|--------|-------------|
| `/trigger/{session_id}` | POST | Send individual question to each student |
| `/trigger-same/{session_id}` | POST | Send same question to all students |
| `/latest-quiz/{session_id}` | GET | Get latest quiz for reconnecting students |

#### Quiz Router (`/api/quiz`)
| Endpoint | Method | Description |
|----------|--------|-------------|
| `/submit` | POST | Submit quiz answer |
| `/session-stats/{session_id}` | GET | Get student's session quiz stats |
| `/performance/{session_id}` | GET | Get quiz performance breakdown |

#### Feedback Router (`/api/feedback`)
| Endpoint | Method | Description |
|----------|--------|-------------|
| `/session/{session_id}` | GET | Get all student feedback for a session |
| `/student/{student_id}` | GET | Get individual student feedback |

#### Clustering Router (`/api/clustering`)
| Endpoint | Method | Description |
|----------|--------|-------------|
| `/session/{session_id}` | GET | Get cluster assignments + real-time stats |
| `/update` | POST | Re-run KMeans clustering |
| `/student/{id}/engagement` | GET | Get student's engagement data |
| `/session/{id}/realtime-stats` | GET | Live student count, question count |

#### Preprocessing Router (`/api/preprocessing`)
| Endpoint | Method | Description |
|----------|--------|-------------|
| `/run` | POST | Trigger preprocessing + clustering pipeline |
| `/session/{session_id}` | GET | Get preprocessed engagement data |

#### Question Router (`/api/questions`)
| Endpoint | Method | Description |
|----------|--------|-------------|
| `/` | GET | List all questions (with filters) |
| `/` | POST | Create new question |
| `/{id}` | PUT | Update question |
| `/{id}` | DELETE | Delete question |

#### Contact Router (`/api/contact`)
| Endpoint | Method | Description |
|----------|--------|-------------|
| `/` | POST | Send contact message (email + save to DB) |

### 5.5 Services Layer

#### QuizService (`quiz_service.py`)
The central orchestrator for quiz logic:

- **`submit_answer()`** — Stores the answer, checks correctness, marks assignment as answered, then fires a background task for preprocessing + clustering
- **`_run_preprocessing_and_clustering()`** — Background async task that:
  1. Runs `PreprocessingService.run()` to compute engagement scores
  2. Runs `ClusteringService.update_clusters()` for KMeans prediction
  3. Calls `_stamp_cluster_on_latest_answer()` to record the cluster on the quiz answer document
  4. Calls `_push_post_clustering_feedback()` to send corrected feedback via WebSocket
- **`get_assignment_for_student()`** — Gets the next question for a student (generic if first question, cluster-specific otherwise)

#### WebSocketManager (`ws_manager.py`)
Manages all real-time connections:

- **Session Rooms** (`session_rooms`): `{sessionId: {studentId: {websocket, status, name, email}}}`
- **Global Connections** (`global_connections`): Set of all connected WebSockets
- **Key methods:**
  - `join_session_room()` — Student joins, saved to MongoDB, broadcast to others
  - `leave_session_room()` — Student leaves with grace period for reconnection
  - `broadcast_to_session()` — Send message to all students in a session (parallel sends)
  - `send_to_student_in_session()` — Send to specific student
  - `broadcast_global()` — Send to all connected clients
  - `start_disconnect_grace_period()` — 60-second grace period before removing disconnected students

#### QuizScheduler (`quiz_scheduler.py`)
Automated question delivery for live sessions:

- Configurable: first delay, interval between questions, max questions, stagger window
- Staggered delivery: each student receives the question at a random time within a window
- First question is always generic; subsequent questions are cluster-specific
- Automatically stopped when session ends

#### FeedbackService (`feedback_service.py`)
Generates personalized feedback (detailed in [Section 8](#8-feedback-generation-system)).

#### EmailService (`email_service.py`)
Uses the **Resend API** for transactional emails:
- Account verification emails
- Password reset emails
- Session report notification emails
- Contact form message delivery

### 5.6 Data Models

#### User Model
```
{
  _id: ObjectId,
  firstName: string,
  lastName: string,
  email: string,
  password: string (hashed),
  role: "student" | "instructor" | "admin",
  status: 0 (inactive) | 1 (active),
  verificationToken: string,
  createdAt: datetime
}
```

#### Session Model
```
{
  _id: ObjectId,
  title: string,
  course: string,
  courseCode: string,
  courseId: string (ref: Course),
  instructor: string,
  instructorId: string (ref: User),
  date: string ("YYYY-MM-DD"),
  time: string ("HH:MM"),
  duration: string,
  status: "upcoming" | "live" | "completed",
  zoomMeetingId: string,
  join_url: string,
  start_url: string,
  isStandalone: boolean,
  enrollmentKey: string,
  enrolledStudents: [string],
  participants: number,
  automationEnabled: boolean,
  automationConfig: { firstDelaySeconds, intervalSeconds, maxQuestions }
}
```

#### Quiz Answer Model
```
{
  _id: ObjectId,
  studentId: string,
  questionId: string,
  sessionId: string,
  answerIndex: number,
  isCorrect: boolean,
  timeTaken: number (seconds),
  networkStrength: { rttMs: number, jitterMs: number },
  clusterAtAnswer: string ("Active" | "Moderate" | "Passive"),
  timestamp: datetime
}
```

#### Cluster Model
```
{
  _id: ObjectId,
  sessionId: string,
  name: string ("Active Participants" | "Moderate Participants" | "At-Risk Students"),
  engagementLevel: "active" | "moderate" | "passive",
  students: [string (studentIds)],
  studentCount: number,
  color: string (hex),
  prediction: "stable" | "improving" | "declining",
  updatedAt: datetime
}
```

---

## 6. Machine Learning Pipeline

### 6.1 Preprocessing

**File: `backend/src/models/preprocessing.py` — `PreprocessingService`**

The preprocessing pipeline transforms raw quiz answer data into engagement scores suitable for KMeans clustering.

**Step-by-step flow:**

1. **Fetch Raw Data** from MongoDB:
   - `quiz_answers` — All answers for the session
   - `session_participants` — All students who joined
   - `latency_metrics` — Network RTT and jitter per student

2. **Build Rows** — One row per (student × question):
   - If student answered: `attempt_status=1`, `is_correct`, `response_time_sec`, `rtt_ms`, `jitter_ms`
   - If student did NOT answer: `attempt_status=0`, all zeros

3. **Compute Engagement Score** (mirrors the Colab training notebook):

```python
# For students who attempted:
engagement_score = is_correct * 0.6 + (1 / (response_time_sec + 1)) * 0.4

# For students who did NOT attempt:
# If poor network (RTT > 3000ms or Jitter > 1500ms): 0.45 (benefit of doubt)
# If good network: 0.0 (truly disengaged)

# Network penalty for non-attempted with data:
engagement_score -= 0.1
```

4. **Scale Engagement Score** using fixed StandardScaler parameters:
```python
engagement_score_scaled = (engagement_score - 0.40) / 0.30
```
   Fixed parameters (mean=0.40, std=0.30) ensure consistency regardless of session size.

5. **Store** preprocessed rows in `preprocessed_engagement` MongoDB collection.

### 6.2 KMeans Clustering (Model Training)

**File: `backend/src/ml_models/kmeans_predictor.py`**

The KMeans model was trained offline (Jupyter/Colab notebook) with **k=3** clusters on `engagement_score_scaled` features.

**Training Process (Colab notebook — not included in repo):**
1. Collected sample student engagement data
2. Computed engagement scores using the same formula
3. Applied StandardScaler (mean=0.40, std=0.30)
4. Trained KMeans with k=3 on `engagement_score_scaled`
5. Saved model as `kmeans_k3.pkl` using joblib

**The saved model file (`kmeans_k3.pkl`) contains:**
- 3 cluster centers
- Trained on 1 feature: `engagement_score_scaled`

### 6.3 Prediction & Label Mapping

**`KMeansPredictor` class:**

```python
class KMeansPredictor:
    MODEL_FEATURES = ["engagement_score_scaled"]

    def predict(self, df):
        """Predict cluster labels (0, 1, 2) for each student."""
        X = df[MODEL_FEATURES].values
        return self._model.predict(X)

    def get_label_mapping(self):
        """Map numeric labels to engagement levels based on cluster centers."""
        centers = self._model.cluster_centers_
        sorted_indices = np.argsort(centers.mean(axis=1))
        return {
            sorted_indices[0]: "passive",   # Lowest center
            sorted_indices[1]: "moderate",  # Middle center
            sorted_indices[2]: "active",    # Highest center
        }
```

**Label mapping is automatic**: The cluster with the highest center (highest engagement) → "active", middle → "moderate", lowest → "passive". This ensures labels are always correct regardless of how KMeans assigns numeric labels (0, 1, 2).

**`predict_students()` pipeline:**
1. Takes preprocessed documents (one per student × question)
2. Aggregates per student (mean of `engagement_score_scaled` across all questions)
3. Runs KMeans prediction
4. Maps numeric labels to "active"/"moderate"/"passive"
5. Returns: `{studentId: label}` and `{"active": [ids], "moderate": [ids], "passive": [ids]}`

### 6.4 Engagement Score Computation

The engagement score formula captures multiple dimensions:

| Dimension | Weight | Logic |
|-----------|--------|-------|
| **Correctness** | 60% | `is_correct * 0.6` |
| **Speed** | 40% | `(1 / (response_time + 1)) * 0.4` — faster = higher |
| **Participation** | Binary | Not attempted with good network = 0.0 (disengaged) |
| **Network Fairness** | Special | Not attempted with poor network = 0.45 (benefit of doubt) |

**Cluster Interpretation:**

| Cluster | Engagement Level | Typical Engagement Score | Description |
|---------|-----------------|-------------------------|-------------|
| **Active** | High | > 0.62 | Consistently answers correctly and quickly |
| **Moderate** | Medium | 0.28 – 0.62 | Answers with moderate accuracy/speed |
| **Passive/At-Risk** | Low | < 0.28 | Rarely answers or answers incorrectly |

---

## 7. Real-Time Data Flow

### 7.1 WebSocket Architecture

ClassPulse uses two types of WebSocket connections:

**1. Session WebSocket** (`/ws/session/{session_id}/{student_id}`):
- Established when a student joins a live session
- Used for: quiz delivery, feedback updates, participant events
- Managed by `WebSocketManager.session_rooms`
- 60-second grace period on disconnect (reconnect without re-joining)
- Stores last quiz per session for reconnecting students

**2. Global WebSocket** (`/ws/global/{user_id}`):
- Established when the student dashboard loads
- Used for: session started/ended announcements
- Managed by `WebSocketManager.global_connections`

**Message Types:**

| Type | Direction | Description |
|------|-----------|-------------|
| `quiz` | Server → Student | New quiz question delivered |
| `feedback_update` | Server → Student | Personalized feedback after answering |
| `meeting_ended` | Server → All | Session has ended |
| `session_started` | Server → All | Session is now live |
| `participant_joined` | Server → All | Student joined the session |
| `participant_left` | Server → All | Student left the session |
| `ping`/`pong` | Bidirectional | Keep-alive heartbeat (every 15s) |

### 7.2 Quiz Delivery Pipeline

```
Instructor clicks "Send Question"
        │
        ▼
POST /api/live/trigger/{session_id}
        │
        ▼
┌─────────────────────────────────┐
│  Determine: is_first_question?   │
│  (Check quiz_answers count = 0)  │
└──────────┬──────────────────────┘
           │
    ┌──────┴──────┐
    │             │
    ▼             ▼
First Question    Subsequent Questions
(Generic)         (Cluster-Specific)
    │             │
    ▼             ▼
Pick from ALL     Pick from questions
questions         matching student's
(any category)    cluster level
    │             │
    └──────┬──────┘
           │
           ▼
┌──────────────────────────────┐
│  WebSocketManager              │
│  send_to_student_in_session()  │
│  (individual question per      │
│   student, delivered via WS)   │
└──────────────────────────────┘
           │
           ▼
    Student receives quiz popup
    on any dashboard page
```

### 7.3 Answer → Clustering → Feedback Pipeline

This is the core data pipeline that runs every time a student submits an answer:

```
Student submits answer (QuizPopup)
        │
        ▼
POST /api/quiz/submit
        │
        ▼
QuizService.submit_answer()
  ├── Store answer in quiz_answers collection
  ├── Check correctness against question
  ├── Mark question_assignment as answered
  │
  └── asyncio.create_task(  ◄── Background task (non-blocking)
        _run_preprocessing_and_clustering()
      )
        │
        ▼
┌── Step 1: PreprocessingService.run() ──┐
│  • Fetch all quiz_answers for session   │
│  • Build (student × question) matrix    │
│  • Compute engagement_score             │
│  • Scale with fixed StandardScaler      │
│  • Store in preprocessed_engagement     │
└─────────────┬───────────────────────────┘
              │
              ▼
┌── Step 2: ClusteringService.update_clusters() ──┐
│  • Fetch preprocessed data                       │
│  • Aggregate per student (mean engagement)       │
│  • KMeansPredictor.predict_students()            │
│  • Map labels: Active / Moderate / Passive       │
│  • Save to clusters collection                   │
└─────────────┬────────────────────────────────────┘
              │
              ▼
┌── Step 3: _stamp_cluster_on_latest_answer() ──┐
│  • Find student's most recent quiz_answer      │
│  • Set clusterAtAnswer = current cluster       │
│  • Powers per-question cluster timeline graph  │
└─────────────┬──────────────────────────────────┘
              │
              ▼
┌── Step 4: _push_post_clustering_feedback() ──┐
│  • Call feedback_service.get_student_feedback │
│  • Build feedback_update WebSocket message    │
│  • Send via ws_manager to student             │
│  • Student dashboard updates immediately      │
└──────────────────────────────────────────────┘
```

**Why this pipeline matters:**
- The initial feedback sent immediately after answer submission may have a **stale cluster** (clustering hasn't finished yet)
- Step 4 sends a **corrected** feedback update after clustering completes
- The frontend's `SessionConnectionContext` replaces `latestFeedback` with the updated data
- This solves the race condition between immediate response and background clustering

---

## 8. Feedback Generation System

**File: `backend/src/services/feedback_service.py`**

The feedback system generates personalized messages for each student based on their performance data.

### Data Fetching (`_fetch_raw_data`)

Pulls data from multiple MongoDB collections:
- `quiz_answers` — Student answers with correctness and timing
- `latency_metrics` — Network quality data
- `clusters` — Current cluster assignments
- `users` — Student names

Resolves session ID variants (MongoDB `_id` ↔ Zoom `meetingId`) to ensure all data is found.

### Student Summary (`_build_student_summaries`)

Aggregates per-student metrics:
- `accuracy` — Fraction of correct answers
- `total_attempts` — Number of questions answered
- `correct_sum` — Number of correct answers
- `median_rt_sec` — Median response time in seconds
- `cluster_label` — Current cluster assignment (Active/Moderate/Passive)

### Feedback Generation (`_generate_feedback`)

Uses a **curated encouragement pool** with 30+ varied sentences:

```python
_ENCOURAGEMENTS = {
    "Active": {
        "high": ["great job staying consistently engaged!", ...],
        "mid":  ["solid engagement! A little more accuracy...", ...],
        "low":  ["love your engagement! Let's focus on boosting accuracy...", ...],
    },
    "Moderate": {
        "high": ["nice accuracy! Stay more consistent...", ...],
        "mid":  ["you're making progress — keep pushing forward!", ...],
        "low":  ["every question you attempt builds your skills...", ...],
    },
    "Passive": {
        "high": ["your accuracy is great when you participate...", ...],
        "mid":  ["every small step counts...", ...],
        "low":  ["it's okay to struggle — what matters is that you keep trying!", ...],
    },
}
```

**Selection logic:**
1. Determine accuracy tier: `high` (≥75%), `mid` (50-74%), `low` (<50%)
2. Look up the student's cluster (Active/Moderate/Passive)
3. Randomly pick one encouragement sentence from the matching pool

**Message structure:**
```
"Hi {name}, {encouragement} Your accuracy is {pct}% ({correct}/{total} correct).
Your typical response time is about {median_rt} seconds."
```

**Suggestions** are dynamically generated based on accuracy and cluster:
- Low accuracy → "Review wrong answers and redo them slowly"
- Mid accuracy → "Focus on most-missed topics to push higher"
- High accuracy → "Try harder questions to challenge yourself"
- Passive students → "Aim for at least 3 questions daily"
- Moderate students → "Answer quizzes promptly to move into Active group"

### Question History (`_build_question_history`)

Builds per-question data for the frontend graphs:
- Accuracy at each question
- Response time at each question
- Cluster assignment at each question (using `clusterAtAnswer` field)

This enables the three performance trend graphs: Accuracy Over Time, Response Time, and Cluster Level.

### Feedback Return Structure

```python
return {
    "type": "achievement" | "encouragement" | "improvement" | "warning",
    "message": "Hi Student, great job! Your accuracy is 85%...",
    "clusterContext": "Active Participants",
    "suggestions": ["Try harder questions...", "Maintain performance..."],
    "cluster_label": "Active",
}
```

---

## 9. Frontend — React Application

### 9.1 Routing & Layout

**File: `frontend/src/App.tsx`**

All routes are wrapped in `<BrowserRouter>`:

- **Auth routes** (`/login`, `/register`, `/forgot-password`, `/reset-password/:token`, `/activate/:token`)
- **Dashboard routes** (`/dashboard/*`) — Wrapped in `<DashboardLayout>`:
  - Student: `/dashboard/student`, `/dashboard/student/engagement`, `/dashboard/student/reports`
  - Instructor: `/dashboard/instructor`, `/dashboard/instructor/analytics`, `/dashboard/instructor/questions`, `/dashboard/instructor/reports`
  - Admin: `/dashboard/admin`, `/dashboard/admin/users`
  - Common: `/dashboard/courses`, `/dashboard/sessions`, `/dashboard/profile`, `/dashboard/reports`, `/dashboard/contact`

### 9.2 Context Providers (State Management)

#### AuthContext (`AuthContext.tsx`)
- Manages user authentication state (user object, JWT token, loading state)
- Provides `login()`, `register()`, `logout()` functions
- Persists token in `sessionStorage`
- Auto-hydrates user on app load

#### SessionConnectionContext (`SessionConnectionContext.tsx`)
- Manages the WebSocket connection to the current live session
- Provides:
  - `connectedSessionId` — Currently connected session
  - `incomingQuiz` — Latest quiz question received
  - `latestFeedback` — Most recent personalized feedback
  - `joinSession()` — Opens Zoom + establishes WebSocket
  - `leaveSession()` — Closes WebSocket, clears state
  - `markQuestionAnswered()` — Prevents re-showing answered questions
- Handles reconnection: checks if session is still live, reconnects WebSocket
- Deduplication: tracks answered question IDs to prevent duplicate popups

#### ThemeContext (`ThemeContext.tsx`)
- Manages dark/light mode toggle
- Persists preference in `localStorage`
- Uses Tailwind's `darkMode: 'class'` strategy
- Adds/removes `dark` class on `<html>` element

### 9.3 Student-Facing Pages

#### Student Dashboard (`StudentDashboard.tsx`)
- Welcome banner with connection status badge (RTT, jitter)
- **Learning Summary card**: cluster assignment, connection quality, questions given, correct answers
- Upcoming meetings list (next 24 hours, grouped by standalone vs course)
- Global WebSocket listener for session start/end events
- Quiz poll every 15 seconds as fallback

#### Student Engagement (`StudentEngagement.tsx`)
- Personalized feedback display (color-coded by cluster)
- Performance graphs: Accuracy Over Time, Response Time, Cluster Level
- Cluster badge with color: green (Active), yellow (Moderate), red (At-Risk)
- Session reports dropdown for past sessions

#### Quiz Popup (`QuizPopup.tsx`)
- Global component rendered in `DashboardLayout` (works on any page)
- Shows question text, multiple-choice options, timer
- Captures answer selection, response time, network strength
- Submits via `POST /api/quiz/submit`
- Shows correct/incorrect feedback after submission

### 9.4 Instructor-Facing Pages

#### Instructor Dashboard (`InstructorDashboard.tsx`)
- Session overview with live/upcoming/completed counts
- Quick actions: create session, manage questions
- Recent session activity

#### Instructor Analytics (`InstructorAnalytics.tsx`)
- Live session selector
- Real-time stats: total students, active students, questions sent, answers received
- **Cluster distribution**: Active / Moderate / At-Risk student lists with names
- Per-student engagement details
- Auto-refresh polling for live data

#### Question Management (`QuestionManagement.tsx`)
- CRUD interface for quiz questions
- Fields: question text, options (4), correct answer, difficulty, category, cluster level
- Categories: generic (available to all) vs cluster-specific (Active/Moderate/Passive)
- Bulk operations support

### 9.5 Shared Components

#### PersonalizedFeedback (`PersonalizedFeedback.tsx`)
- Renders feedback cards with cluster-based styling:
  - **Active**: Green border, green background, bold text
  - **Moderate**: Yellow border, yellow background, medium text
  - **At-Risk**: Red border, red background, pulsing red alert banner ("You are At-Risk — Participate more actively!")
- Suggestion bullets color-coded by cluster
- Dark theme support

#### FeedbackGraphs (`FeedbackGraphs.tsx`)
- Three Recharts area charts:
  1. **Accuracy Over Time** — Percentage correct at each question
  2. **Response Time** — Seconds per question
  3. **Cluster Level** — Active(3)/Moderate(2)/Passive(1) at each question
- Theme-aware colors (dark mode compatible)

#### Footer (`Footer.tsx`)
- Contact banner (phone, address, email)
- Quick Links (courses, meetings, profile, feedback, contact)
- Features links (sessions, quizzes, analytics, reports)
- Social media icons
- **Privacy Policy** popup modal (ClassPulse-specific policy)
- **Cookie Policy** popup modal (authentication, session, theme storage)
- **Feedback** popup modal (star rating, category selector, text comment)

---

## 10. Session & Report System

### Session Lifecycle

```
1. CREATE SESSION
   Instructor creates session → Zoom meeting auto-created
   Status: "upcoming"

2. START SESSION
   Instructor clicks "Start" → Status: "live"
   → Quiz automation starts (if enabled)
   → broadcast "session_started" to all students

3. DURING SESSION
   → Questions delivered via WebSocket
   → Students answer quizzes
   → Background: preprocessing → clustering → feedback
   → Instructor sees live analytics

4. END SESSION
   Instructor clicks "End" (or Zoom meeting ends via webhook)
   → Status: "completed"
   → Quiz automation stopped
   → broadcast "meeting_ended" to all students + global
   → Master report auto-generated
   → Email notifications sent to all participants
```

### Report Generation (`session_report_model.py`)

When a session ends, `SessionReportModel.generate_master_report()`:

1. Fetches all quiz answers, participants, cluster data, latency metrics
2. Compiles per-student performance summaries
3. Generates quiz-by-quiz breakdown with correct/incorrect/unanswered
4. Includes cluster distribution history
5. Saves report to `session_reports` MongoDB collection

### Report Download (`session_report.py`)

- HTML report with inline SVG performance graphs (Accuracy, Response Time, Cluster Level)
- PDF download via browser's `html2pdf.js` conversion
- Per-student reports with individual performance data

---

## 11. Zoom Integration

### Zoom API (`zoom_service.py`)
- Creates Zoom meetings programmatically when sessions are created
- Provides `join_url` (for students) and `start_url` (for instructors)

### Zoom Webhooks (`zoom_webhook.py`)
Receives real-time events from Zoom:

| Event | Action |
|-------|--------|
| `meeting.started` | Update session status to "live" |
| `meeting.ended` | Auto-end session, generate report, broadcast meeting_ended |
| `participant.joined` | Track participant in session |
| `participant.left` | Update participant status |

**Session ID Resolution**: Sessions have two identifiers:
- MongoDB `_id` (e.g., `698236d3a02b8cac27617bfe`) — used by frontend
- `zoomMeetingId` (e.g., `82970220279`) — used by Zoom/students

All services resolve between these IDs to ensure data consistency.

---

## 12. Network Latency Monitoring

### Backend (`latency.py` + `latency_metrics.py`)
- Students send periodic ping measurements (RTT, jitter) via REST API
- Stored in `latency_metrics` collection per session per student
- Used to:
  - Contextualize engagement (poor network ≠ disengaged)
  - Display connection quality on student dashboard
  - Adjust engagement scores (latency-adjusted engagement)

### Frontend (`useLatencyMonitor.ts`)
- Measures RTT by sending timed pings every 3 seconds
- Computes jitter from RTT variance
- Reports to backend every 5 seconds
- Displays quality badge: Excellent / Good / Fair / Poor

---

## 13. Email Service

**File: `backend/src/services/email_service.py`**

Uses the **Resend API** for email delivery:

| Email Type | Trigger | Content |
|-----------|---------|---------|
| Verification | User registration | "Verify your email" with activation link |
| Password Reset | Forgot password request | "Reset your password" with reset link |
| Session Report | Session ends | "Session Report Available" with link to report |
| Contact Message | Contact form submission | Formatted message forwarded to team email |

All emails use responsive HTML templates with the ClassPulse branding.

---

## 14. Dark Theme & Responsive Design

### Dark Theme
- Tailwind CSS `darkMode: 'class'` configuration
- `ThemeContext` provider manages the `dark` class on `<html>`
- Preference saved in `localStorage`
- Every component uses `dark:` utility classes for backgrounds, text, borders
- Charts (Recharts) dynamically adjust colors based on theme

### Responsive Design
- Tailwind responsive breakpoints (`sm:`, `md:`, `lg:`)
- Mobile-first approach with touch-friendly button sizes (`min-h-[48px]`)
- Flexible grid layouts that stack on smaller screens
- Quiz popup optimized for phone screens

---

## 15. Sample Execution Flow

### Scenario: Student answers a quiz during a live session

```
1. STUDENT OPENS DASHBOARD
   → AuthContext loads JWT from sessionStorage
   → SessionConnectionContext restores connectedSessionId from localStorage
   → WebSocket reconnects to /ws/session/{sessionId}/{studentId}
   → Global WS connects to /ws/global/{userId}

2. INSTRUCTOR TRIGGERS QUESTION
   → POST /api/live/trigger/{sessionId}
   → Backend checks: is this the student's first question? (query quiz_answers)
   → YES → Pick a generic question (available to all clusters)
   → Sends quiz message via WebSocket to each student individually

3. STUDENT RECEIVES QUIZ
   → SessionConnectionContext.onmessage receives type="quiz"
   → QuizPopup component renders with question and options
   → Toast notification + sound alert

4. STUDENT ANSWERS
   → Selects option B, clicks Submit
   → POST /api/quiz/submit with { studentId, questionId, sessionId, answerIndex: 1, timeTaken: 3.2 }
   → QuizService.submit_answer():
     a. Check correctness: answerIndex(1) === correctAnswer(1) → isCorrect: true
     b. Store in quiz_answers collection
     c. Mark question_assignment as answered
     d. Fire background task: _run_preprocessing_and_clustering()

5. BACKGROUND PIPELINE (async)
   → Step 1: PreprocessingService.run()
     • Fetch all quiz_answers for this session
     • Build matrix: 1 student × 1 question = 1 row
     • engagement_score = 1*0.6 + (1/(3.2+1))*0.4 = 0.695
     • engagement_score_scaled = (0.695 - 0.40) / 0.30 = 0.983
     • Save to preprocessed_engagement

   → Step 2: ClusteringService.update_clusters()
     • Load preprocessed data
     • KMeansPredictor.predict([0.983]) → cluster 2 (highest center)
     • Label mapping: cluster 2 = "active"
     • Save: { "active": [studentId], "moderate": [], "passive": [] }

   → Step 3: _stamp_cluster_on_latest_answer()
     • Update quiz_answer: { clusterAtAnswer: "Active" }

   → Step 4: _push_post_clustering_feedback()
     • Generate feedback: "Hi Student, great job staying consistently engaged!
       Your accuracy is 100% (1/1 correct). Your typical response time is about 3.2 seconds."
     • Send via WebSocket: { type: "feedback_update", feedback: {...}, stats: {...} }

6. STUDENT DASHBOARD UPDATES
   → SessionConnectionContext receives feedback_update
   → latestFeedback state updates
   → StudentEngagement page re-renders:
     • Feedback card: GREEN border, bold text, "Active Participants" badge
     • Graphs update: accuracy=100%, response_time=3.2s, cluster=Active
     • Suggestions: "Try harder questions to challenge yourself"

7. INSTRUCTOR SEES ANALYTICS
   → InstructorAnalytics polls /api/clustering/session/{id}
   → Cluster distribution: Active: 1 student, Moderate: 0, Passive: 0
   → Real-time stats: 1 student, 1 question sent, 1 answer received
```

---

## 16. Deployment

### Railway Deployment

The project is deployed on **Railway** with:

**Backend:**
- Python runtime with `requirements.txt`
- Environment variables: `MONGODB_URL`, `RESEND_API_KEY`, `JWT_SECRET`, `ZOOM_*` credentials
- Start command: `uvicorn src.main:app --host 0.0.0.0 --port $PORT`

**Frontend:**
- Node.js runtime with Vite build
- Environment variables: `VITE_API_URL`, `VITE_WS_URL`
- Build: `npm run build` → serves from `dist/`

### Environment Variables

| Variable | Description |
|----------|-------------|
| `MONGODB_URL` | MongoDB Atlas connection string |
| `JWT_SECRET` | Secret key for JWT signing |
| `RESEND_API_KEY` | Resend email API key |
| `FROM_EMAIL` | Sender email address |
| `FRONTEND_URL` | Frontend URL for email links |
| `ZOOM_ACCOUNT_ID` | Zoom Server-to-Server OAuth Account ID |
| `ZOOM_CLIENT_ID` | Zoom OAuth Client ID |
| `ZOOM_CLIENT_SECRET` | Zoom OAuth Client Secret |
| `ZOOM_WEBHOOK_SECRET_TOKEN` | Zoom webhook verification token |

---

## 17. MongoDB Collections Reference

| Collection | Purpose | Key Fields |
|-----------|---------|------------|
| `users` | User accounts | email, password, role, status |
| `sessions` | Class sessions | title, status, zoomMeetingId, instructorId |
| `courses` | Courses with enrollment | courseCode, instructorId, enrolledStudents |
| `questions` | Quiz question bank | question, options, correctAnswer, difficulty, category |
| `quiz_answers` | Student answers | studentId, questionId, isCorrect, timeTaken, clusterAtAnswer |
| `question_assignments` | Per-student question delivery | studentId, questionId, status |
| `session_participants` | Session attendance | sessionId, studentId, joinedAt, status |
| `clusters` | KMeans cluster results | sessionId, engagementLevel, students[] |
| `preprocessed_engagement` | Computed engagement scores | studentId, engagement_score, engagement_score_scaled |
| `latency_metrics` | Network quality data | student_id, avg_rtt_ms, avg_jitter_ms |
| `session_reports` | Generated reports | sessionId, participants, quizDetails, clusters |
| `contact_messages` | Contact form submissions | name, email, message, createdAt |

---

*ClassPulse — Built by TechSnatchers. Empowering education through real-time engagement and analytics.*
