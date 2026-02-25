# ClassPulse — Integration & CI/CD Documentation

## Table of Contents

1. [Component Integration Plan](#1-component-integration-plan)
   - [Model 1: KMeans Engagement Clustering](#model-1-kmeans-engagement-clustering-integration)
   - [Model 2: Personalized Feedback Engine](#model-2-personalized-feedback-engine-integration)
2. [System-Wide Integration Architecture](#2-system-wide-integration-architecture)
   - [Backend ↔ Frontend Integration](#21-backend--frontend-integration)
   - [Backend ↔ Database Integration](#22-backend--database-integration)
   - [Real-Time WebSocket Integration](#23-real-time-websocket-integration)
   - [External Service Integration](#24-external-service-integration)
3. [CI/CD Pipeline](#3-cicd-pipeline)
   - [Source Control (Git + GitHub)](#31-source-control-git--github)
   - [Railway Deployment Pipeline](#32-railway-deployment-pipeline)
   - [Deployment Architecture](#33-deployment-architecture)
   - [Environment Configuration](#34-environment-configuration)
4. [Integration Testing Strategy](#4-integration-testing-strategy)
5. [Deployment Flow Diagram](#5-deployment-flow-diagram)

---

## 1. Component Integration Plan

ClassPulse consists of two core ML/analytical models integrated into a full-stack web application. Below is the detailed integration plan for each model.

---

### Model 1: KMeans Engagement Clustering — Integration

#### What It Does

The KMeans model clusters students into three engagement levels — **Active**, **Moderate**, and **Passive/At-Risk** — based on real-time behavioral metrics collected during a live session.

#### Integration Points

| Component | Role | File(s) |
|-----------|------|---------|
| **ML Model (Scikit-learn)** | Trains and persists the KMeans model (k=3) | `backend/src/ml_models/kmeans_predictor.py` |
| **Preprocessing Service** | Computes engagement scores from raw quiz data (accuracy, response time, attempt count) | `backend/src/services/preprocessing_service.py` |
| **Clustering Router** | Exposes `/api/clustering/` REST endpoints for triggering clustering and retrieving results | `backend/src/routers/clustering.py` |
| **Feedback Service** | Consumes cluster labels as input for generating per-student feedback | `backend/src/services/feedback_service.py` |
| **MongoDB** | Stores raw quiz answers, computed engagement scores, and cluster assignments | `quiz_answers`, `engagement_scores`, `cluster_results` collections |
| **MySQL (Backup)** | Receives a read-only copy of session reports containing cluster summaries | `session_reports_backup` table |
| **Frontend — Instructor Analytics** | Displays cluster distribution charts, per-student cluster badges | `frontend/src/pages/dashboard/instructor/Analytics.tsx` |
| **Frontend — Student Dashboard** | Shows the student's own cluster level and trend over time | `frontend/src/pages/dashboard/StudentEngagement.tsx` |
| **WebSocket** | Broadcasts cluster updates to connected students in real time | `backend/src/services/ws_manager.py` |

#### Integration Flow

```
┌──────────────────────────────────────────────────────────────────────┐
│                     MODEL 1: CLUSTERING PIPELINE                     │
└──────────────────────────────────────────────────────────────────────┘

  Student answers quiz via WebSocket
         │
         ▼
  ┌─────────────────────┐
  │  Quiz Answer Saved   │  → MongoDB `quiz_answers` collection
  │  to MongoDB          │
  └──────────┬──────────┘
             │
             ▼
  ┌─────────────────────┐
  │  Preprocessing       │  → Compute engagement score:
  │  Service             │     score = 0.5×accuracy + 0.3×(1/response_time) + 0.2×attempt_ratio
  └──────────┬──────────┘
             │
             ▼
  ┌─────────────────────┐
  │  KMeans Predictor    │  → Load persisted model → predict cluster (0, 1, or 2)
  │  (Scikit-learn)      │  → Map to label: active / moderate / passive
  └──────────┬──────────┘
             │
             ▼
  ┌─────────────────────┐
  │  Cluster Results     │  → Save to MongoDB `cluster_results`
  │  Stored in MongoDB   │  → Broadcast via WebSocket to frontend
  └──────────┬──────────┘
             │
    ┌────────┴────────┐
    ▼                 ▼
 Instructor        Student
 Analytics         Dashboard
 (charts,          (personal cluster
  badges)           level, trend graph)
```

#### How Integration Was Done

1. **Model Training**: The KMeans model is trained offline on historical engagement data using scikit-learn. The trained model is serialized to a `.pkl` file using `joblib`.

2. **Model Loading at Startup**: During FastAPI application startup (`main.py` lifespan), the KMeans predictor is loaded into memory:
   ```python
   from src.ml_models.kmeans_predictor import KMeansPredictor
   predictor = KMeansPredictor()
   predictor.load()
   ```

3. **Background Clustering After Each Answer**: When a student submits a quiz answer, the feedback service triggers clustering as a **background task** (`asyncio.create_task`). This ensures the API response to the student is not delayed:
   ```python
   asyncio.create_task(_run_background_clustering(session_id))
   ```

4. **REST + WebSocket Dual Delivery**: Cluster results are stored in MongoDB and simultaneously broadcast to the frontend via WebSocket, enabling real-time UI updates without page refresh.

5. **MySQL Backup Sync**: When a session report is generated, cluster summary counts (highly_engaged, moderately_engaged, at_risk) are included in the report and backed up to MySQL via the `MySQLBackupService`.

---

### Model 2: Personalized Feedback Engine — Integration

#### What It Does

The feedback engine generates **personalized, actionable feedback messages** for each student based on their cluster level, quiz accuracy, response time, and historical performance within a session.

#### Integration Points

| Component | Role | File(s) |
|-----------|------|---------|
| **Feedback Service** | Core engine — aggregates per-student stats, selects encouragement from curated pool, generates suggestions | `backend/src/services/feedback_service.py` |
| **Feedback Router** | Exposes `/api/feedback/{session_id}` endpoint | `backend/src/routers/feedback.py` |
| **Clustering (Model 1)** | Provides cluster labels as input to the feedback engine | `backend/src/routers/clustering.py` |
| **MongoDB** | Source for quiz answers, cluster results, and engagement scores | Multiple collections |
| **Frontend — PersonalizedFeedback** | Renders color-coded feedback cards with cluster badges, at-risk alerts, and suggestion lists | `frontend/src/components/feedback/PersonalizedFeedback.tsx` |
| **Session Report (PDF/HTML)** | Includes feedback data in downloadable reports | `backend/src/routers/session_report.py` |

#### Integration Flow

```
┌──────────────────────────────────────────────────────────────────────┐
│                   MODEL 2: FEEDBACK PIPELINE                         │
└──────────────────────────────────────────────────────────────────────┘

  Instructor requests feedback (or auto-triggered after clustering)
         │
         ▼
  ┌─────────────────────┐
  │  Feedback Router     │  → GET /api/feedback/{session_id}
  │                      │  → Accepts optional ?student_id= filter
  └──────────┬──────────┘
             │
             ▼
  ┌─────────────────────┐
  │  Aggregate Data      │  → Fetch from MongoDB:
  │  from MongoDB        │     • quiz_answers (per student, per session)
  │                      │     • cluster_results (latest cluster label)
  │                      │     • engagement_scores (historical trend)
  └──────────┬──────────┘
             │
             ▼
  ┌─────────────────────┐
  │  Compute Stats       │  → Per student:
  │                      │     • accuracy = correct / total × 100
  │                      │     • avg response time
  │                      │     • cluster label (active/moderate/passive)
  └──────────┬──────────┘
             │
             ▼
  ┌─────────────────────┐
  │  Generate Feedback   │  → Curated encouragement pool (cluster-aware)
  │  Message             │  → Programmatic stats (accuracy %, response time)
  │                      │  → Actionable suggestions based on performance
  └──────────┬──────────┘
             │
             ▼
  ┌─────────────────────┐
  │  Return JSON         │  → { student, cluster, message, suggestions }
  │  Response            │  → Frontend renders color-coded cards
  └──────────┬──────────┘
             │
    ┌────────┴────────┐
    ▼                 ▼
 Student           Session
 Dashboard         Report
 (live feedback    (PDF/HTML
  cards)            export)
```

#### How Integration Was Done

1. **Dependency on Model 1**: The feedback engine depends on cluster labels produced by the KMeans model. If clustering hasn't run yet, the feedback service assigns a default label based on raw accuracy.

2. **Hybrid Feedback Generation**: The feedback engine uses a **curated pool approach**:
   - A pool of encouragement sentences categorized by cluster level (`active`, `moderate`, `at-risk`) and performance band (high/medium/low accuracy).
   - Programmatic content generation for factual details (e.g., "Your accuracy is 85% (17/20 correct)").
   - Actionable suggestions generated based on specific performance gaps.

3. **Frontend Color-Coding**: The `PersonalizedFeedback.tsx` component detects the cluster level and applies:
   - **Green** (bold, larger text) for Active students
   - **Yellow** (medium weight) for Moderate students
   - **Red** (with animated at-risk alert banner) for Passive/At-Risk students

4. **Report Integration**: Feedback data is included in session reports, allowing instructors to download PDF/HTML reports that contain each student's personalized feedback alongside their quiz performance.

---

## 2. System-Wide Integration Architecture

### 2.1 Backend ↔ Frontend Integration

| Integration Layer | Technology | Description |
|-------------------|-----------|-------------|
| **REST API** | FastAPI ↔ Axios | Frontend makes HTTP requests to backend endpoints. All API routes are prefixed with `/api/`. |
| **WebSocket** | FastAPI WebSocket ↔ Browser WebSocket API | Real-time bidirectional communication for quiz delivery, cluster updates, and session events. |
| **Authentication** | JWT Tokens | Frontend stores JWT in localStorage. Every API request includes `Authorization: Bearer <token>` header. Backend middleware validates the token before processing. |
| **CORS** | FastAPI CORSMiddleware | Backend allows cross-origin requests from the frontend domain. |

### 2.2 Backend ↔ Database Integration

| Database | Connection | Purpose |
|----------|-----------|---------|
| **MongoDB (Primary)** | `motor` async driver via `backend/src/database/connection.py` | Source of truth for all data — users, sessions, quiz answers, cluster results, courses, questions |
| **MySQL (Backup)** | `aiomysql` async driver via `backend/src/database/mysql_connection.py` | Read-only backup for auditing and SQL-based reporting. Non-blocking — failures never crash the app. |

**Connection Lifecycle** (managed in `main.py` lifespan):

```
App Start → Connect MongoDB → Connect MySQL (optional) → Load KMeans Model
                                                              │
App Run   → [Serve Requests] ←───────────────────────────────┘
                                                              │
App Stop  → Close MySQL → Close MongoDB ←─────────────────────┘
```

### 2.3 Real-Time WebSocket Integration

| WebSocket Route | Purpose |
|----------------|---------|
| `/ws/global/{student_id}` | Global notifications (session start/end, meeting ended) |
| `/ws/session/{session_id}/{student_id}` | Session-specific room for quiz delivery and cluster updates |

**Integration with Models:**
- After Model 1 (clustering) runs, results are broadcast via WebSocket to the instructor's analytics page and each student's dashboard.
- Quiz questions are delivered via WebSocket, and student answers are submitted back over WebSocket-triggered REST calls.

### 2.4 External Service Integration

| Service | Purpose | Integration Point |
|---------|---------|-------------------|
| **Zoom** | Video conferencing for live sessions | Webhook (`/api/zoom/events`) receives meeting start/end events. Chatbot for in-meeting commands. |
| **Resend** | Email delivery | Contact form submissions and notification emails via `backend/src/services/email_service.py` |
| **MongoDB Atlas** | Cloud-hosted primary database | Connected via `MONGODB_URL` environment variable |
| **Railway MySQL** | Cloud-hosted backup database | Connected via `MYSQL_HOST`, `MYSQL_PORT`, etc. |

---

## 3. CI/CD Pipeline

### 3.1 Source Control (Git + GitHub)

| Aspect | Detail |
|--------|--------|
| **Repository** | GitHub (`Arunpragash22/learningApp`) |
| **Branch Strategy** | Single `master` branch for production deployments |
| **Commit Convention** | Descriptive commit messages summarizing changes |
| **Push-to-Deploy** | Every `git push origin master` triggers automatic deployment on Railway |

### 3.2 Railway Deployment Pipeline

Railway provides a **built-in CI/CD pipeline** that automatically detects, builds, and deploys changes when code is pushed to the connected GitHub repository.

#### CI/CD Flow

```
┌──────────────────────────────────────────────────────────────────────┐
│                     CI/CD PIPELINE (RAILWAY)                         │
└──────────────────────────────────────────────────────────────────────┘

  Developer pushes code to GitHub (master branch)
         │
         ▼
  ┌─────────────────────┐
  │  1. SOURCE           │  Railway detects new commit on GitHub
  │     (GitHub Webhook) │  via connected repository
  └──────────┬──────────┘
             │
             ▼
  ┌─────────────────────┐
  │  2. BUILD            │  Railway auto-detects project type:
  │     (Auto-detect)    │  • Backend: Python → installs requirements.txt
  │                      │  • Frontend: Node.js → runs npm install + npm run build
  │                      │  • MySQL: Docker image (mysql:9.4)
  └──────────┬──────────┘
             │
             ▼
  ┌─────────────────────┐
  │  3. DEPLOY           │  Railway deploys each service:
  │     (Rolling)        │  • Backend: uvicorn main:app on assigned port
  │                      │  • Frontend: serves built static files
  │                      │  • MySQL: starts container with persistent volume
  └──────────┬──────────┘
             │
             ▼
  ┌─────────────────────┐
  │  4. HEALTH CHECK     │  Railway monitors:
  │     (Automatic)      │  • GET /health endpoint (backend)
  │                      │  • Service uptime and resource usage
  │                      │  • Automatic restart on crash
  └──────────┬──────────┘
             │
             ▼
  ┌─────────────────────┐
  │  5. LIVE             │  Application is live at Railway-assigned URLs
  │     (Production)     │  • Backend: https://<backend>.up.railway.app
  │                      │  • Frontend: https://<frontend>.up.railway.app
  └─────────────────────┘
```

#### Railway CI/CD Features Used

| Feature | Description |
|---------|-------------|
| **Auto-Build** | Railway detects `requirements.txt` (Python) and `package.json` (Node.js) and runs the appropriate install/build commands automatically |
| **Auto-Deploy** | On every push to `master`, Railway rebuilds and redeploys all affected services |
| **Environment Variables** | Secrets (DB credentials, API keys) are stored in Railway's secure variable store, injected at runtime |
| **Persistent Volumes** | MySQL data persists across redeployments via `mysql-volume` mounted at `/var/lib/mysql` |
| **Rolling Deployments** | New deployments replace old ones with zero-downtime (Railway keeps the old instance running until the new one is healthy) |
| **Deploy Logs** | Build and deploy logs are accessible from the Railway dashboard for debugging |
| **Health Monitoring** | Railway monitors service health and auto-restarts crashed services |

### 3.3 Deployment Architecture

```
┌──────────────────────────────────────────────────────────────────────┐
│                    RAILWAY PROJECT ARCHITECTURE                       │
└──────────────────────────────────────────────────────────────────────┘

  GitHub Repository (master)
         │
         │  git push triggers auto-deploy
         │
         ▼
  ┌──────────────────── Railway Project ────────────────────┐
  │                                                         │
  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐     │
  │  │  Frontend    │  │  Backend    │  │  MySQL       │     │
  │  │  (React +   │  │  (FastAPI + │  │  (Docker     │     │
  │  │   Vite)     │  │   Python)   │  │   mysql:9.4) │     │
  │  │             │  │             │  │              │     │
  │  │  npm build  │  │  uvicorn    │  │  Persistent  │     │
  │  │  → static   │  │  → ASGI     │  │  Volume      │     │
  │  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘     │
  │         │                │                │             │
  │         │     REST API   │   aiomysql     │             │
  │         │◄──────────────►│◄──────────────►│             │
  │         │    WebSocket   │                │             │
  │         │◄──────────────►│                │             │
  │         │                │                │             │
  │         │                │   motor async  │             │
  │         │                │◄──────────────►│             │
  │         │                │  MongoDB Atlas  │             │
  │                                                         │
  └─────────────────────────────────────────────────────────┘
                               │
                               ▼
                      MongoDB Atlas (Cloud)
                      (Primary Database)
```

### 3.4 Environment Configuration

Environment variables are managed per service in Railway:

#### Backend Service Variables

| Variable | Purpose |
|----------|---------|
| `MONGODB_URL` | MongoDB Atlas connection string |
| `JWT_SECRET` | Secret key for JWT token signing |
| `MYSQL_HOST` | MySQL server hostname |
| `MYSQL_PORT` | MySQL server port |
| `MYSQL_USER` | MySQL username |
| `MYSQL_PASSWORD` | MySQL password |
| `MYSQL_DATABASE` | MySQL database name |
| `RESEND_API_KEY` | API key for email service |
| `ZOOM_CLIENT_ID` | Zoom OAuth client ID |
| `ZOOM_CLIENT_SECRET` | Zoom OAuth client secret |
| `ZOOM_WEBHOOK_SECRET` | Zoom webhook verification token |

#### MySQL Service Variables (Auto-generated by Railway)

| Variable | Purpose |
|----------|---------|
| `MYSQL_DATABASE` | Database name |
| `MYSQL_PUBLIC_URL` | Public connection URL |
| `MYSQL_ROOT_PASSWORD` | Root password |
| `MYSQL_URL` | Internal connection URL |
| `MYSQLDATABASE` | Database name (Railway format) |
| `MYSQLHOST` | Hostname (Railway format) |
| `MYSQLPASSWORD` | Password (Railway format) |
| `MYSQLPORT` | Port (Railway format) |

---

## 4. Integration Testing Strategy

| Test Type | What Is Tested | How |
|-----------|---------------|-----|
| **Health Check** | Backend connectivity to MongoDB and MySQL | `GET /health` returns status of both databases |
| **Sync Status** | MongoDB ↔ MySQL data consistency | `GET /api/admin/mysql-sync/status` compares record counts |
| **WebSocket Test** | Real-time message delivery | `GET /test-ws` broadcasts a test message to all connected clients |
| **End-to-End Flow** | Complete quiz → cluster → feedback pipeline | Instructor triggers quiz → Student answers → Clustering runs → Feedback generated → Displayed on dashboard |
| **Manual Sync** | Bulk data migration from MongoDB to MySQL | `POST /api/admin/mysql-sync/sync-all` syncs all collections |

---

## 5. Deployment Flow Diagram

```
┌──────────────────────────────────────────────────────────────────────┐
│               COMPLETE DEPLOYMENT WORKFLOW                            │
└──────────────────────────────────────────────────────────────────────┘

  Developer Machine
  ─────────────────
  1. Code changes in VS Code / Cursor IDE
  2. Test locally (npm run dev + uvicorn)
  3. git add → git commit → git push origin master
         │
         ▼
  GitHub Repository
  ─────────────────
  4. Commit received on master branch
  5. Webhook notifies Railway
         │
         ▼
  Railway CI/CD
  ─────────────
  6. Pull latest code from GitHub
  7. Detect service type (Python / Node.js / Docker)
  8. Install dependencies:
     • Backend: pip install -r requirements.txt
     • Frontend: npm install && npm run build
  9. Build application artifacts
  10. Deploy new version (rolling update)
  11. Inject environment variables from Railway vault
  12. Start services:
      • Backend: uvicorn src.main:app --host 0.0.0.0 --port $PORT
      • Frontend: serve static build output
      • MySQL: start Docker container
         │
         ▼
  Production (Live)
  ─────────────────
  13. Backend starts → connects MongoDB → connects MySQL → loads KMeans model
  14. Frontend served → users access the web application
  15. Health check passes → deployment marked as successful
  16. Old deployment instance removed
```

---

*ClassPulse — Integration & CI/CD Documentation*
*Two Models: KMeans Engagement Clustering + Personalized Feedback Engine*
