# AI-Powered Real-Time Student Engagement Monitoring Platform

A full-stack learning platform with **Zoom integration**, **real-time quiz delivery**, **student engagement clustering**, **live network monitoring**, and **comprehensive reporting**. Built for instructors to monitor and improve student engagement during live sessions.

---

## Table of Contents

- [Project Overview](#project-overview)
- [Tech Stack](#tech-stack)
- [Project Structure](#project-structure)
- [Frontend](#frontend)
  - [Entry Points & Configuration](#entry-points--configuration)
  - [Context Providers](#context-providers)
  - [Hooks](#hooks)
  - [Services](#services)
  - [Utilities](#utilities)
  - [UI Components](#ui-components)
  - [Auth Components](#auth-components)
  - [Layout Components](#layout-components)
  - [Engagement Components](#engagement-components)
  - [Quiz Components](#quiz-components)
  - [Question Components](#question-components)
  - [Session Components](#session-components)
  - [Notification Components](#notification-components)
  - [Clustering Components](#clustering-components)
  - [Feedback Components](#feedback-components)
  - [Privacy Components](#privacy-components)
  - [Pages - Authentication](#pages---authentication)
  - [Pages - Dashboards](#pages---dashboards)
  - [Pages - Sessions](#pages---sessions)
  - [Pages - Courses](#pages---courses)
  - [Pages - Questions](#pages---questions)
  - [Pages - Reports](#pages---reports)
  - [Pages - Student](#pages---student)
  - [Pages - Instructor](#pages---instructor)
  - [Pages - Admin](#pages---admin)
  - [Pages - Profile](#pages---profile)
- [Backend](#backend)
  - [Entry Point & Configuration](#entry-point--configuration)
  - [API Routers](#api-routers)
  - [Models](#models)
  - [Services](#backend-services)
  - [Database Layer](#database-layer)
  - [Middleware](#middleware)
  - [Utilities](#backend-utilities)
  - [Scripts & Testing](#scripts--testing)
- [AWS Infrastructure](#aws-infrastructure)
- [Deployment](#deployment)
- [API Endpoints Reference](#api-endpoints-reference)
- [WebSocket Endpoints](#websocket-endpoints)
- [Database Architecture](#database-architecture)
- [Key Features Explained](#key-features-explained)
- [Environment Variables](#environment-variables)
- [Getting Started](#getting-started)

---

## Project Overview

This platform enables instructors to:

1. **Create and manage live sessions** integrated with Zoom meetings
2. **Monitor student engagement** in real-time using AI-powered clustering
3. **Deliver quizzes instantly** to all connected students via WebSocket
4. **Track network quality** of each student with live animated progress bars
5. **Generate comprehensive reports** with attendance, quiz performance, and engagement data
6. **Manage courses and enrollment** with enrollment key system

Students can:

1. **Join live sessions** and receive real-time quiz questions
2. **View personalized engagement feedback** based on their participation
3. **Track their performance** across sessions and courses
4. **Receive network quality warnings** when connectivity degrades

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| **Frontend** | React 18, TypeScript, Vite, TailwindCSS |
| **Backend** | FastAPI (Python), Express.js (TypeScript - alternative) |
| **Database** | MongoDB (primary), MySQL (backup/sync) |
| **Real-time** | FastAPI WebSockets, Socket.IO |
| **External** | Zoom API (OAuth2), Resend (email), Web Push |
| **Cloud** | AWS Lambda, API Gateway, CloudFormation, EC2 |
| **Auth** | JWT tokens, email verification |

---

## Project Structure

```
project_fyp-main/
|
|-- frontend/                    # React + TypeScript + Vite frontend
|   |-- src/
|   |   |-- context/             # React Context providers (Auth, Session, Theme)
|   |   |-- hooks/               # Custom React hooks (latency, notifications, socket)
|   |   |-- services/            # API service modules
|   |   |-- utils/               # Helper utilities
|   |   |-- components/          # Reusable UI components
|   |   |   |-- auth/            # Authentication layout
|   |   |   |-- clustering/      # Engagement cluster visualization
|   |   |   |-- engagement/      # Network monitoring & quality indicators
|   |   |   |-- feedback/        # Personalized feedback display
|   |   |   |-- layout/          # App layout (dashboard, footer)
|   |   |   |-- notifications/   # Popup notifications
|   |   |   |-- privacy/         # Privacy consent modal
|   |   |   |-- questions/       # Question bank & forms
|   |   |   |-- quiz/            # Quiz delivery & performance
|   |   |   |-- sessions/        # Session forms
|   |   |   |-- ui/              # Base UI components (Button, Card, Badge, etc.)
|   |   |-- pages/               # Route page components
|   |   |   |-- admin/           # Admin management pages
|   |   |   |-- auth/            # Login, Register, Password Reset
|   |   |   |-- courses/         # Course CRUD & enrollment
|   |   |   |-- dashboard/       # Role-specific dashboards
|   |   |   |-- instructor/      # Instructor reports
|   |   |   |-- profile/         # User profile
|   |   |   |-- questions/       # Question management
|   |   |   |-- reports/         # Session reports & PDF export
|   |   |   |-- sessions/        # Live session, create, edit, report
|   |   |   |-- student/         # Student reports
|   |   |-- App.tsx              # Main app with routing
|   |   |-- index.tsx            # Entry point with providers
|   |   |-- index.css            # Global styles & Tailwind
|
|-- backend/                     # FastAPI Python backend
|   |-- src/
|   |   |-- routers/             # API route handlers
|   |   |-- models/              # Pydantic schemas & MongoDB models
|   |   |-- services/            # Business logic services
|   |   |-- database/            # Database connections & seeding
|   |   |-- middleware/          # Auth middleware
|   |   |-- utils/               # JWT utilities
|   |   |-- main.py              # FastAPI entry point
|   |-- scripts/                 # Data export scripts
|   |-- zoom/                    # Legacy Zoom utilities
|   |-- requirements.txt         # Python dependencies
|   |-- mysql_schema.sql         # MySQL backup schema
|
|-- aws/                         # AWS infrastructure
|   |-- cloudformation/          # CloudFormation templates
|   |-- lambda/                  # Lambda function handlers
|   |-- deploy scripts           # Deployment automation
|
|-- deploy-to-ec2.sh            # EC2 deployment script
|-- ec2-setup.sh                # EC2 initial setup
|-- generate_vapid_keys.py      # Web Push key generation
```

---

## Frontend

### Entry Points & Configuration

| File | Description |
|------|-------------|
| `src/index.tsx` | Application entry point. Wraps the app with `ThemeProvider`, `AuthProvider`, and `SessionConnectionProvider`. Renders `App` component inside `BrowserRouter`. |
| `src/App.tsx` | Main application component. Defines all routes using React Router v6. Handles role-based redirects (student/instructor/admin). Wraps dashboard routes in `DashboardLayout`. |
| `src/AppRouter.tsx` | Router wrapper component that provides routing context. |
| `src/index.css` | Global styles including Tailwind CSS imports, CSS custom properties for theming (light/dark), custom scrollbar styles, and animation keyframes. |
| `src/vite-env.d.ts` | TypeScript declarations for Vite environment variables (`VITE_API_URL`, `VITE_WS_URL`, `VITE_BACKEND_URL`, `VITE_VAPID_PUBLIC_KEY`). |

### Routing Structure

```
/                              -> Redirects to /login
/auth/*                        -> Authentication pages (AuthLayout)
  /login                       -> Login page
  /register                    -> Registration page
  /forgot-password             -> Password reset request
  /reset-password/:token       -> Password reset with token
  /activate/:token             -> Email account activation

/dashboard/*                   -> Protected dashboard (DashboardLayout)
  /dashboard                   -> Role-based redirect
  /dashboard/student           -> Student dashboard
  /dashboard/instructor        -> Instructor dashboard
  /dashboard/admin             -> Admin dashboard
  /dashboard/courses           -> Course list
  /dashboard/courses/create    -> Create course
  /dashboard/courses/:id       -> Course detail
  /dashboard/courses/:id/edit  -> Edit course
  /dashboard/sessions          -> Session list
  /dashboard/sessions/create   -> Create session
  /dashboard/sessions/:id      -> Live session view
  /dashboard/sessions/:id/edit -> Edit session
  /dashboard/sessions/:id/report -> Session report
  /dashboard/student/engagement  -> Student engagement view
  /dashboard/student/enrollment  -> Student enrollment
  /dashboard/student/reports     -> Student reports
  /dashboard/instructor/analytics -> Instructor analytics
  /dashboard/instructor/questions -> Question management
  /dashboard/instructor/courses   -> Course management
  /dashboard/instructor/reports   -> Instructor reports
  /dashboard/admin/users         -> User management
  /dashboard/profile             -> User profile
  /dashboard/reports             -> Session reports list
```

---

### Context Providers

| File | Description |
|------|-------------|
| `context/AuthContext.tsx` | **Authentication Context** - Manages user authentication state. Provides `login()`, `register()`, `logout()`, `updateProfile()` functions. Stores JWT token in localStorage. Automatically loads user from token on mount. Handles role-based state (`user.role`: student/instructor/admin). |
| `context/SessionConnectionContext.tsx` | **Session Connection Context** - Manages global WebSocket connection for quiz delivery. Ensures a single WebSocket per student per session (app-wide). Handles quiz deduplication (prevents same question appearing twice). Rehydrates answered question IDs from backend. Provides `QuizPopup` component for instructor-triggered questions across any page. Ping interval: 15 seconds keepalive. |
| `context/ThemeContext.tsx` | **Theme Context** - Manages light/dark mode. Persists preference in localStorage. Applies `dark` class to document element. Provides `theme` state and `toggleTheme()` function. |

---

### Hooks

| File | Description |
|------|-------------|
| `hooks/useLatencyMonitor.ts` | **Latency Monitor Hook** - WebRTC-aware connection latency monitoring for live Zoom sessions. Pings server every 3 seconds via HTTP POST. Calculates RTT, jitter, stability score. Reports aggregated stats to backend every 5 seconds. Quality levels: `excellent` (<150ms), `good` (<300ms), `fair` (<500ms), `poor` (<1000ms), `critical` (>=1000ms). Sends initial report immediately when student joins. Only stores student data (instructor/admin filtered by backend). |
| `hooks/useNotifications.ts` | **Notifications Hook** - WebSocket hook for real-time question notifications. Connects to meeting-specific WebSocket endpoint. Receives `NEW_QUESTION` events from instructor. Used as fallback/legacy notification system alongside session socket. |
| `hooks/useSessionSocket.ts` | **Session Socket Hook** - Socket.IO client hook for session-based quiz delivery. Connects to Flask-SocketIO server (port 5000). Handles `join_session`, `NEW_QUESTION`, `quiz` events. Auto-reconnection with 5 retry attempts. Tracks participant count and connection state. |

---

### Services

| File | Description |
|------|-------------|
| `services/authService.ts` | **Auth Service** - API calls for authentication: `login()`, `register()`, `forgotPassword()`, `resetPassword()`, `activateAccount()`, `getCurrentUser()`, `updateProfile()`. Handles JWT token storage and authorization headers. |
| `services/sessionService.ts` | **Session Service** - Session CRUD operations: `createSession()`, `getAllSessions()`, `getSession()`, `updateSession()`, `deleteSession()`. Zoom integration: `startSession()` (creates Zoom meeting), `endSession()`. Report operations: `getSessionReport()`, `generateReport()`. Participant management and session stats. |
| `services/quizService.ts` | **Quiz Service** - Quiz operations: `submitAnswer()`, `getQuizPerformance()`, `triggerQuestionToSession()`, `triggerSameQuestionToSession()`, `getAnsweredQuestions()`. Handles both MongoDB session IDs and Zoom meeting IDs. |
| `services/questionService.ts` | **Question Service** - Question CRUD: `getAllQuestions()`, `getQuestion()`, `createQuestion()`, `updateQuestion()`, `deleteQuestion()`. Supports filtering by session/course. |
| `services/courseService.ts` | **Course Service** - Course CRUD: `createCourse()`, `getCourses()`, `getCourse()`, `updateCourse()`, `deleteCourse()`. Enrollment: `enrollWithKey()`, `generateEnrollmentKey()`, `getEnrolledStudents()`. |
| `services/clusteringService.ts` | **Clustering Service** - Student engagement clustering: `getClusters()`, `updateClusters()`, `getDefaultClusters()`. Groups students into engagement levels (high/medium/low/at-risk). |
| `services/pushNotificationService.ts` | **Push Notification Service** - Web Push subscription: `subscribeToPush()`, `initializePush()`. Manages service worker registration for browser push notifications. |

---

### Utilities

| File | Description |
|------|-------------|
| `utils/debounce.ts` | `debounce()` function to limit function call frequency. `throttle()` for rate limiting. `SimpleCache` class with TTL-based caching. |
| `utils/sessionFilters.ts` | `normalizeStatus()` - Normalizes session status strings. `isWithinNext24Hours()` - Checks if session is within next 24 hours. `parseSessionDate()` - Parses various date formats. Used for filtering sessions in dashboard views. |

---

### UI Components

| File | Description |
|------|-------------|
| `components/ui/Badge.tsx` | Badge component with variants: `default`, `success`, `warning`, `danger`, `info`. Sizes: `sm`, `md`, `lg`. Used for status indicators throughout the app. |
| `components/ui/Button.tsx` | Button component with variants: `primary`, `secondary`, `outline`, `danger`, `ghost`. Supports loading state with spinner, left/right icons, disabled state, and multiple sizes. |
| `components/ui/Card.tsx` | Card container component with `CardHeader`, `CardContent`, `CardFooter` subcomponents. Provides consistent card styling with dark mode support. |
| `components/ui/Input.tsx` | Form input component with label, placeholder, error message display, and dark mode support. |
| `components/ui/Select.tsx` | Select dropdown component with label, options, error handling, and consistent styling. |
| `components/ui/Skeleton.tsx` | Loading skeleton placeholder component. Renders animated placeholder bars while content loads. |
| `components/ui/ThemeToggle.tsx` | Theme toggle button that switches between light and dark mode using ThemeContext. |

---

### Auth Components

| File | Description |
|------|-------------|
| `components/auth/AuthLayout.tsx` | Authentication page layout. Left side: login/register form. Right side: feature showcase with animated slides showing platform capabilities (Real-time Engagement Analysis, Smart Quizzes, etc.). |

---

### Layout Components

| File | Description |
|------|-------------|
| `components/layout/AuthLayout.tsx` | Route-level auth layout wrapper. Redirects authenticated users to dashboard. Wraps unauthenticated routes. |
| `components/layout/DashboardLayout.tsx` | Main dashboard layout. Collapsible sidebar navigation with role-based menu items. Top header with user menu (profile, logout). Integrates `QuizPopup` from SessionConnectionContext for real-time quiz delivery on any page. Mobile-responsive with hamburger menu. |
| `components/layout/Footer.tsx` | Footer component with copyright, contact information, and social media links. |

---

### Engagement Components

| File | Description |
|------|-------------|
| `components/engagement/StudentNetworkMonitor.tsx` | **Student Network Monitor** - Instructor dashboard component showing real-time network quality for all students in a session. Two view modes: **Live Cards** (animated progress bars per student) and **Table** (compact row view). Shows connection quality distribution bar (excellent/good/fair/poor/critical). Auto-refresh every 2 seconds. Demo mode for testing. Alerts for students needing attention. |
| `components/engagement/LiveNetworkProgressBars.tsx` | **Live Network Progress Bars** - Card component for each student showing animated progress bars: RTT latency bar (0-1000ms), Jitter bar (0-200ms), Connection Quality bar (percentage), Stability Score bar. Includes mini RTT sparkline chart, signal strength bars (5-bar indicator), trend indicators (improving/degrading/stable), and attention warnings for poor connections. Shimmer animation shows live status. |
| `components/engagement/ConnectionStabilityBar.tsx` | **Connection Stability Bar** - Smooth animated bar that fills based on stability score (0-100%). Color transitions: blue (excellent) -> yellow (fair) -> red (critical). Active shimmer animation shows live monitoring. `InlineStabilityBar` compact variant for table rows. |
| `components/engagement/ConnectionQualityIndicator.tsx` | **Connection Quality Indicator** - Visual indicator showing connection quality with signal bars. Displays RTT, jitter, stability score. Compact and expanded views. `ConnectionQualityBadge` variant for header bars. Warning messages for poor/critical connections. |
| `components/engagement/EngagementIndicator.tsx` | **Engagement Indicator** - Displays engagement level badge (high/medium/low) with numeric score. Color-coded by engagement level. |

---

### Quiz Components

| File | Description |
|------|-------------|
| `components/quiz/TargetedQuiz.tsx` | **Targeted Quiz** - Quiz question display component with countdown timer. Shows question text, multiple choice options. Highlights selected answer. Timer bar animates down. Auto-submits when time expires. Supports personalized marking. |
| `components/quiz/QuizPopup.tsx` | **Quiz Popup** - Global popup overlay for instructor-triggered questions. Appears on any page when a quiz is received via WebSocket. Full-screen overlay with quiz content. Used by SessionConnectionContext. |
| `components/quiz/QuizPerformance.tsx` | **Quiz Performance** - Displays quiz results after answering. Shows class-wide statistics: total answered, correct percentage, average time. Breakdown by engagement cluster. Top performers list. Performance comparison metrics. |

---

### Question Components

| File | Description |
|------|-------------|
| `components/questions/QuestionBank.tsx` | **Question Bank** - Displays list of questions with search, filter by category/difficulty. Each question shows text, options, tags, time limit. "Trigger" button for instructors to send question to live session. Supports CRUD operations. |
| `components/questions/QuestionForm.tsx` | **Question Form** - Create/edit question form. Fields: question text, options (multiple choice), correct answer, difficulty, category, tags, time limit. Supports two types: generic questions and cluster-targeted questions. |

---

### Session Components

| File | Description |
|------|-------------|
| `components/sessions/SessionForm.tsx` | **Session Form** - Create/edit session form. Fields: title, description, date, time, duration, course selection, materials. Zoom meeting auto-creation toggle. Enrollment key generation for standalone sessions. |

---

### Notification Components

| File | Description |
|------|-------------|
| `components/notifications/QuestionNotificationPopup.tsx` | **Question Notification Popup** - Animated popup when instructor triggers a question. Shows question preview, time limit, instructor name. "Answer Now" button navigates to question. |
| `components/notifications/NetworkWarningPopup.tsx` | **Network Warning Popup** - Warning popup for students when connection quality is fair/poor/critical. Shows troubleshooting tips (check WiFi, close background apps, move closer to router). Dismissible. Shows once per quality level per session. |

---

### Clustering Components

| File | Description |
|------|-------------|
| `components/clustering/ClusterVisualization.tsx` | **Cluster Visualization** - Visualizes student engagement clusters. Shows cluster distribution with progress bars. Engagement levels: High, Medium, Low, At-Risk. Displays student count per cluster, predictions, and recommendations. |

---

### Feedback Components

| File | Description |
|------|-------------|
| `components/feedback/PersonalizedFeedback.tsx` | **Personalized Feedback** - Displays personalized feedback messages for students. Types: encouragement (positive), improvement (constructive), achievement (milestones), warning (alerts). Each type has distinct styling and icon. |

---

### Privacy Components

| File | Description |
|------|-------------|
| `components/privacy/PrivacyConsent.tsx` | **Privacy Consent** - Modal for GDPR-style privacy preferences. Toggles for: engagement tracking, quiz performance analysis, network monitoring. Explains what data is collected and why. Required for platform usage. |

---

### Pages - Authentication

| File | Description |
|------|-------------|
| `pages/auth/Login.tsx` | Login page with email/password form. "Remember me" checkbox. Link to forgot password. Link to register. Form validation with error messages. Redirects to dashboard on success. |
| `pages/auth/Register.tsx` | Registration page with fields: first name, last name, email, password, confirm password. Role selection (student/instructor). **Network monitoring consent checkbox** (required). Email verification notice. |
| `pages/auth/ForgotPassword.tsx` | Password reset request page. Email input form. Sends reset email via backend. Success confirmation message. |
| `pages/auth/ResetPassword.tsx` | Password reset page. Accepts token from URL. New password and confirm password fields. Token validation. |
| `pages/auth/AccountActivation.tsx` | Email verification page. Accepts activation token from URL. Displays activation status (success/failure/expired). Link to login on success. |

---

### Pages - Dashboards

| File | Description |
|------|-------------|
| `pages/dashboard/StudentDashboard.tsx` | **Student Dashboard** - Shows upcoming sessions with join links. Connection quality badge. Quiz notification indicator. Recent engagement metrics. Session history. |
| `pages/dashboard/InstructorDashboard.tsx` | **Instructor Dashboard** - Connection quality card with RTT/jitter/stability. Upcoming meetings list (standalone + course lessons). "Trigger Question" button for live sessions. Session selector dropdown. **Student Network Monitor** with live progress bars showing all connected students' network quality. Connection quality guide legend. WebSocket connection for real-time participant updates. |
| `pages/dashboard/InstructorAnalytics.tsx` | **Instructor Analytics** - Cluster visualization with engagement distribution. Session performance charts. Quiz performance summary. Student engagement trends. Report generation. |
| `pages/dashboard/AdminDashboard.tsx` | **Admin Dashboard** - Platform overview: total users, active sessions, courses. User statistics by role. System health indicators. Quick action links. |
| `pages/dashboard/StudentEngagement.tsx` | **Student Engagement** - Live engagement reports. Personalized feedback based on participation. Quiz performance history. Engagement score breakdown. Connection quality impact on scores. |

---

### Pages - Sessions

| File | Description |
|------|-------------|
| `pages/sessions/SessionList.tsx` | Session listing page with search bar, status filters (upcoming/live/completed), role-based views. Instructors see management actions (start/end/edit/delete). Students see join buttons. Enrollment key display. |
| `pages/sessions/SessionCreate.tsx` | Session creation page. Wraps `SessionForm`. Creates Zoom meeting automatically. Supports standalone sessions with enrollment keys. |
| `pages/sessions/SessionEdit.tsx` | Session editing page. Pre-fills form with existing session data. |
| `pages/sessions/LiveSession.tsx` | **Live Session Page** - Main session interface. Video stream area with controls (mic, camera, hand raise, reactions, screen share). **For Students**: Quiz popup when instructor triggers question. Answer submission with feedback. Performance display after answering. Network quality indicator. Network warning popup for poor connections. Session join button (explicit opt-in). **For Instructors**: Question Bank panel to trigger questions. Real-time Engagement Analytics with cluster visualization. AI Teaching Assistant panel with suggestions. Connection quality context for engagement. WebSocket connection for real-time quiz delivery. Chat sidebar with messages. Participants list. Quick-access questions panel. |
| `pages/sessions/SessionReport.tsx` | Session report detail page. Attendance statistics with join/leave timeline. Quiz performance breakdown (per question, per student). Network quality summary. Engagement cluster distribution. PDF export capability. |

---

### Pages - Courses

| File | Description |
|------|-------------|
| `pages/courses/CourseList.tsx` | Course listing with search and filters. Students: browse and enroll. Instructors: manage courses. Enrollment key system for joining. |
| `pages/courses/CourseCreate.tsx` | Course creation page with name, description, schedule. |
| `pages/courses/CourseDetail.tsx` | Course detail page showing sessions, materials, enrolled students, enrollment management. |
| `pages/courses/CourseEdit.tsx` | Course editing page. |
| `pages/courses/CourseManagement.tsx` | Instructor course management. Create courses, generate enrollment keys, view enrolled students, manage sessions per course. |
| `pages/courses/StudentEnrollment.tsx` | Student enrollment page. Enter enrollment key to join a course. Shows enrolled courses list. |

---

### Pages - Questions

| File | Description |
|------|-------------|
| `pages/questions/QuestionManagement.tsx` | Question management page for instructors. Create, edit, delete questions. Filter by session/course/category/difficulty. Import/export questions. Preview question display. |

---

### Pages - Reports

| File | Description |
|------|-------------|
| `pages/reports/SessionReports.tsx` | Session reports listing with search, date range filters, status filters. PDF export for individual reports. Report cards with summary statistics. |
| `pages/reports/ReportList.tsx` | Report listing page (general). |
| `pages/reports/ReportDetail.tsx` | Individual report detail view. |

---

### Pages - Student

| File | Description |
|------|-------------|
| `pages/student/StudentReports.tsx` | Student personal reports. Attendance records across sessions. Quiz performance history with scores and time taken. Engagement metrics trend. Connection quality impact notes. |

---

### Pages - Instructor

| File | Description |
|------|-------------|
| `pages/instructor/InstructorReports.tsx` | Comprehensive instructor reports. Session summaries with attendance rates. Quiz performance analysis (per question accuracy, average time). Cluster analysis showing engagement distribution changes. Student-level detail drill-down. |

---

### Pages - Admin

| File | Description |
|------|-------------|
| `pages/admin/UserManagement.tsx` | Admin user management. Search and filter users by role/status. Activate/deactivate accounts. View user details. Role management. |

---

### Pages - Profile

| File | Description |
|------|-------------|
| `pages/profile/UserProfile.tsx` | User profile page. Edit first name, last name, email. Change password. Profile picture. Account settings. |

---

## Backend

### Entry Point & Configuration

| File | Description |
|------|-------------|
| `src/main.py` | **FastAPI Entry Point** - Registers all API routers, WebSocket endpoints, CORS middleware, auth middleware. Initializes MongoDB and MySQL connections on startup. Closes connections on shutdown. Defines WebSocket handlers for session and global connections. Health check endpoint. |
| `src/server.ts` | **Express Entry Point** (Alternative) - TypeScript/Express server for quiz and clustering routes. Mock implementation for development. |
| `requirements.txt` | Python dependencies: FastAPI, Uvicorn, Motor (async MongoDB), PyMySQL, aiomysql, PyJWT, python-dotenv, Resend, pywebpush, py-vapid, requests, python-multipart, email-validator, passlib, bcrypt. |
| `env_template.txt` | Environment variable template with placeholders for MongoDB URI, Zoom API credentials, email config, JWT secret, MySQL config, VAPID keys. |
| `mysql_schema.sql` | MySQL backup table schema for `session_reports` table (stores report data synced from MongoDB). |

---

### API Routers

| File | Prefix | Description |
|------|--------|-------------|
| `routers/auth.py` | `/api/auth` | **Authentication** - `POST /register` (create account with email verification), `POST /login` (JWT token), `POST /forgot-password` (reset email), `POST /reset-password` (with token), `GET /activate/:token` (email verification), `GET /me` (current user), `PUT /profile` (update profile). Password hashing with bcrypt. JWT token generation. |
| `routers/session.py` | `/api/sessions` | **Session Management** - `POST /` (create session + Zoom meeting), `GET /` (list sessions), `GET /:id` (get session), `PUT /:id` (update), `DELETE /:id` (delete), `POST /:id/start` (start session, set status to live), `POST /:id/end` (end session, generate report), `GET /:id/stats` (live session stats), `POST /join` (student join session). Automatic Zoom meeting creation. Dual ID support (MongoDB + Zoom meeting ID). |
| `routers/quiz.py` | `/api/quiz` | **Quiz Operations** - `POST /submit` (submit student answer), `GET /performance/:questionId/:sessionId` (get quiz performance), `POST /trigger-to-session` (send question to all students via WebSocket), `POST /trigger-same-to-session` (re-trigger last question), `GET /answered/:sessionId/:studentId` (get answered question IDs), `POST /session/join` (student joins session room). Broadcasts quizzes via WebSocketManager. |
| `routers/question.py` | `/api/questions` | **Question Management** - Full CRUD: `POST /` (create), `GET /` (list with filters), `GET /:id` (get one), `PUT /:id` (update), `DELETE /:id` (delete). Filter by category, difficulty, course, session. |
| `routers/course.py` | `/api/courses` | **Course Management** - `POST /` (create course), `GET /` (list courses), `GET /:id` (get course), `PUT /:id` (update), `DELETE /:id` (delete), `POST /:id/enroll` (enroll with key), `POST /:id/enrollment-key` (generate key), `GET /:id/students` (enrolled students). |
| `routers/latency.py` | `/api/latency` | **Network Monitoring** - `POST /ping` (ping-pong RTT measurement), `POST /report` (submit latency report - students only), `GET /quality/:sessionId/:studentId` (connection quality), `GET /stats/:sessionId/:studentId` (detailed stats), `GET /session/:sessionId/students` (all students' latency with stability history, trends), `GET /session/:sessionId/summary` (session quality summary), `DELETE /session/:sessionId` (clear cache), `GET /history/:sessionId` (MongoDB historical data), `WebSocket /ws/:sessionId/:studentId` (real-time monitoring). In-memory cache for real-time access + MongoDB persistence. Quality thresholds: excellent <150ms, good <300ms, fair <500ms, poor <1000ms. |
| `routers/zoom_webhook.py` | `/api/zoom` | **Zoom Webhooks** - `POST /events` (receive Zoom webhook events). Handles: `meeting.participant_joined` (auto-save participant), `meeting.participant_left` (update status), `meeting.ended` (auto-end session, generate report). HMAC SHA256 signature validation. URL verification challenge support. |
| `routers/zoom_chatbot.py` | `/api/zoom/chatbot` | **Zoom Chatbot** - Integration routes for Zoom chatbot functionality. |
| `routers/live_question.py` | `/api/live-questions` | **Live Questions** - Zoom-integrated live question triggering. Session-based question activation. |
| `routers/live.py` | `/api/live` | **Live Learning** - Session-based quiz delivery endpoints. |
| `routers/session_report.py` | `/api/sessions` | **Session Reports** - `GET /:id/report` (get/generate session report). Report includes: attendance, quiz performance, engagement clusters, network quality. Auto-generates on session end. Stores in MongoDB with MySQL backup. |
| `routers/instructor_reports.py` | `/api/instructor/reports` | **Instructor Reports** - Aggregated reports across sessions. Session summaries, quiz performance analytics, engagement cluster analysis. |
| `routers/student_reports.py` | `/api/student/reports` | **Student Reports** - Personal student reports. Attendance history, quiz performance, engagement metrics. |
| `routers/push_notification.py` | `/api/notifications` | **Push Notifications** - `POST /subscribe` (subscribe to web push), `POST /send` (send notification). Uses VAPID keys for Web Push protocol. |
| `routers/clustering.py` | `/api/clustering` | **Student Clustering** - `GET /clusters/:sessionId` (get engagement clusters), `POST /clusters/update` (update clusters based on quiz performance). AI-powered student grouping by engagement level. |
| `routers/mysql_sync.py` | `/api/admin/mysql-sync` | **MySQL Sync** - Manual MongoDB to MySQL synchronization. Admin-only data backup operations. |
| `routers/auth_jwt_example.py` | -- | JWT authentication example/template for reference. |

---

### Models

| File | Description |
|------|-------------|
| `models/user.py` | **User Model** - Pydantic schema for user data. MongoDB CRUD operations for users collection. Password hashing and verification. Role management (student/instructor/admin). Email verification token handling. |
| `models/question.py` | **Question Model** - Question schema with text, options, correct answer, difficulty, category, tags, time limit. MongoDB CRUD operations. Filter support by course/session. |
| `models/quiz_answer.py` | **Quiz Answer Schema** - Pydantic model for answer submission: questionId, answerIndex, timeTaken, studentId, sessionId. |
| `models/quiz_answer_model.py` | **Quiz Answer MongoDB Model** - Storage operations for quiz answers. Submit answer, check if already answered, get answers by session/student. |
| `models/quiz_performance.py` | **Quiz Performance Schema** - Pydantic model for performance data: totalStudents, answeredStudents, correctPercentage, averageTime, clusterBreakdown, topPerformers. |
| `models/course.py` | **Course Model** - Course schema and MongoDB operations. CRUD, enrollment key generation, student enrollment management. |
| `models/session_participant_model.py` | **Session Participant Model** - Tracks student join/leave events. `join_session()`, `leave_session()`, `get_participants()`. Supports both MongoDB session IDs and Zoom meeting IDs. |
| `models/session_report_model.py` | **Session Report Model** - Report generation logic. Aggregates attendance, quiz performance, engagement clusters, network quality into comprehensive reports. MongoDB storage with async MySQL backup. |
| `models/latency_metrics.py` | **Latency Metrics Model** - Network quality data model. Stores RTT, jitter, stability scores per student per session. |
| `models/cluster_model.py` | **Cluster MongoDB Model** - Stores student engagement clusters. CRUD operations for cluster data. |
| `models/cluster.py` | **Cluster Schema** - Pydantic model: name, engagement level (high/medium/low/at-risk), student count, student IDs, predictions. |
| `models/live_question_session.py` | **Live Question Session** - Tracks active question sessions for Zoom meetings. |
| `models/question_response.py` | **Question Response** - Student responses to live questions. |
| `models/question_assignment_model.py` | **Question Assignment** - Personalized question tracking per student. |
| `models/question_session_model.py` | **Question Session Activation** - Tracks which sessions have active question mode. |
| `models/zoom_event.py` | **Zoom Event Schema** - Pydantic models for Zoom webhook event payloads (participant joined/left, meeting ended). |

---

### Backend Services

| File | Description |
|------|-------------|
| `services/ws_manager.py` | **WebSocket Manager** (600+ lines) - Centralized connection management. Session-based rooms: `join_session_room()`, `leave_session_room()`, `broadcast_to_session()`, `send_to_student_in_session()`. Global WebSocket for announcements. Meeting-based connections for Zoom. Last quiz caching for reconnecting students (2-minute window). Ping/pong keepalive. |
| `services/zoom_service.py` | **Zoom API Service** - OAuth2 account credentials flow. `get_zoom_access_token()`, `create_zoom_meeting()`, `list_zoom_meetings()`, `get_zoom_meeting()`. Meeting creation with settings (auto-recording, waiting room, etc.). |
| `services/zoom_webhook_service.py` | **Zoom Webhook Service** - Webhook signature verification (HMAC SHA256). Event parsing and participant tracking. Auto session ending on meeting.ended event. |
| `services/zoom_chat_service.py` | **Zoom Chat Service** - Send messages to Zoom meeting chat via API. |
| `services/quiz_service.py` | **Quiz Service** - Question selection algorithm. Performance calculation with cluster breakdown. Personalized question routing based on engagement clusters. |
| `services/clustering_service.py` | **Clustering Service** - Student engagement clustering algorithm. Groups students by: quiz performance, participation frequency, response time. Engagement levels: high, medium, low, at-risk. Updates dynamically based on new quiz data. |
| `services/email_service.py` | **Email Service** - Resend API integration. Sends: verification emails, password reset emails, notification emails. HTML email templates. |
| `services/push_service.py` | **Push Notification Service** - Web Push via pywebpush library. VAPID key authentication. Sends push notifications to subscribed browsers. |
| `services/quiz_scheduler.py` | **Quiz Scheduler** - Automated question triggering for live sessions. Scheduled quiz delivery at configured intervals. |
| `services/mysql_backup_service.py` | **MySQL Backup Service** - Async MongoDB to MySQL backup. Non-blocking data synchronization. Stores reports in MySQL for SQL queries and auditing. |

---

### Database Layer

| File | Description |
|------|-------------|
| `database/connection.py` | **MongoDB Connection** - Motor async client. `connect_to_mongo()`, `close_mongo_connection()`, `get_database()`. Connection string from environment variables. |
| `database/mysql_connection.py` | **MySQL Connection** - Async MySQL pool using aiomysql. Backup layer for SQL queries. Non-blocking connection management. |
| `database/seed.py` | **Database Seeding** - Creates initial admin user, sample instructor, sample questions. Used for development/demo setup. |

---

### Middleware

| File | Description |
|------|-------------|
| `middleware/auth.py` | **Auth Middleware** - JWT token verification. Extracts user from Authorization header. Role-based access control. Protects API endpoints. |
| `middleware/auth.middleware.ts` | TypeScript auth middleware (for Express server - mock implementation). |

---

### Backend Utilities

| File | Description |
|------|-------------|
| `utils/jwt_utils.py` | **JWT Utilities** - `create_access_token()`, `decode_access_token()`, `create_reset_token()`, `create_verification_token()`. Token expiry configuration. Secret key from environment. |

---

### Scripts & Testing

| File | Description |
|------|-------------|
| `scripts/export_to_local_mysql.py` | Exports MongoDB data to MySQL via CSV conversion and bulk import. |
| `seed_instructors_courses.py` | Seeds database with sample instructors and courses. |
| `setup_env.py` | Interactive environment setup script. Creates `.env` file with user-provided values. |
| `test_api_example.py` | API testing script for instructor and course workflows. |
| `test_db.py` | Database connection testing. |
| `test_email.py` | Email configuration and delivery testing. |
| `test_live_questions.py` | Live questions feature testing. |
| `test_participant_event.py` | Participant join/leave event testing. |
| `test_webhook_direct.py` | Zoom webhook endpoint direct testing. |
| `test_zoom_storage.py` | Zoom event storage testing. |
| `check_zoom_data.py` | Inspects Zoom data stored in MongoDB. |
| `monitor_zoom_events.py` | Real-time Zoom event monitor. Polls database every 2 seconds for new events. |
| `view_participants.py` | Views participant data from database. |
| `start.bat` / `start.sh` | Startup scripts for Node.js backend. |
| `start_python.bat` / `start_python.sh` | Startup scripts for Python backend. |

---

## AWS Infrastructure

| File | Description |
|------|-------------|
| `aws/cloudformation/zoom-webhook-stack.yaml` | **CloudFormation Template** - Defines AWS infrastructure for Zoom webhook processing: API Gateway (HTTP API), Lambda function, IAM roles. Configures POST route to receive Zoom events and forward to backend. |
| `aws/lambda/zoom_webhook_handler.py` | **Lambda Handler** - Main Zoom webhook processor. Receives events from API Gateway, validates signatures, forwards to backend server. Uses urllib (no external dependencies). |
| `aws/lambda/zoom_webhook_handler_simple.py` | Simplified Lambda handler variant. |
| `aws/lambda/zoom_webhook_handler_clean.py` | Clean Lambda handler with improved POST redirect handling. |
| `aws/deploy.sh` | Bash deployment script using AWS CLI and CloudFormation. |
| `aws/deploy.ps1` | PowerShell deployment using AWS PowerShell module. |
| `aws/deploy-aws-cli.ps1` | PowerShell deployment using AWS CLI (no AWS module required). |
| `aws/get-webhook-url.ps1` | Retrieves webhook URL from deployed CloudFormation stack. |
| `aws/test-webhook.ps1` | Tests complete webhook flow (health check, endpoint, sample events). |
| `aws/test-webhook-local.ps1` | Tests webhook endpoint locally. |
| `aws/test-webhook-endpoint.ps1` | Tests webhook validation events. |
| `aws/install-aws-cli.ps1` | Installs AWS CLI on Windows. |

---

## Deployment

| File | Description |
|------|-------------|
| `deploy-to-ec2.sh` | EC2 deployment script. Deploys backend (Python/FastAPI) and frontend (React/Vite build) to EC2 with Nginx reverse proxy. |
| `ec2-setup.sh` | EC2 initial server setup (installs Node.js, Python, MongoDB, Nginx, etc.). |
| `monitor-app.sh` | Application monitoring script for production. |
| `update-app.sh` | Application update script for deploying new versions. |
| `generate_vapid_keys.py` | Generates VAPID key pair for Web Push notifications. |

---

## API Endpoints Reference

### Authentication
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/auth/register` | Register new user |
| POST | `/api/auth/login` | Login and get JWT token |
| POST | `/api/auth/forgot-password` | Request password reset email |
| POST | `/api/auth/reset-password` | Reset password with token |
| GET | `/api/auth/activate/:token` | Activate email account |
| GET | `/api/auth/me` | Get current user profile |
| PUT | `/api/auth/profile` | Update user profile |

### Sessions
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/sessions` | Create session (+ Zoom meeting) |
| GET | `/api/sessions` | List all sessions |
| GET | `/api/sessions/:id` | Get session details |
| PUT | `/api/sessions/:id` | Update session |
| DELETE | `/api/sessions/:id` | Delete session |
| POST | `/api/sessions/:id/start` | Start session (set live) |
| POST | `/api/sessions/:id/end` | End session (generate report) |
| GET | `/api/sessions/:id/stats` | Get live session stats |
| GET | `/api/sessions/:id/report` | Get session report |

### Quiz
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/quiz/submit` | Submit quiz answer |
| GET | `/api/quiz/performance/:qId/:sId` | Get quiz performance |
| POST | `/api/quiz/trigger-to-session` | Send question to all students |
| GET | `/api/quiz/answered/:sId/:studentId` | Get answered questions |

### Network Monitoring
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/latency/ping` | Ping-pong RTT measurement |
| POST | `/api/latency/report` | Submit latency report |
| GET | `/api/latency/session/:id/students` | All students' network status |
| GET | `/api/latency/session/:id/summary` | Session quality summary |

### Courses
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/courses` | Create course |
| GET | `/api/courses` | List courses |
| POST | `/api/courses/:id/enroll` | Enroll with key |
| POST | `/api/courses/:id/enrollment-key` | Generate enrollment key |

### Zoom
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/zoom/events` | Receive Zoom webhook events |

---

## WebSocket Endpoints

| Endpoint | Description |
|----------|-------------|
| `ws://host/ws/global/{student_id}` | Global WebSocket for announcements. All students receive platform-wide events. |
| `ws://host/ws/session/{session_id}/{student_id}` | Session-specific WebSocket. Students join session rooms to receive quizzes. Handles: `participant_joined`, `participant_left`, `quiz`, `session_started`, `meeting_ended` events. Last quiz cached for 2-minute reconnect window. |
| `ws://host/api/latency/ws/{session_id}/{student_id}` | Real-time latency monitoring WebSocket. Ping/pong for RTT measurement. Latency report submission. |

---

## Database Architecture

### MongoDB (Primary Database)

| Collection | Description |
|------------|-------------|
| `users` | User accounts (students, instructors, admins) |
| `sessions` | Session documents (title, course, zoomMeetingId, status, join_url, start_url) |
| `session_participants` | Student participation tracking (join/leave times) |
| `courses` | Course definitions with enrollment keys |
| `questions` | Question bank (text, options, difficulty, category) |
| `quiz_answers` | Student quiz responses (answer, time taken, correctness) |
| `latency_reports` | Network quality metrics per student per session |
| `participation` | Raw Zoom webhook events |
| `session_reports` | Generated session reports |
| `clusters` | Student engagement clusters |

### MySQL (Backup Database)

- Mirrors critical data from MongoDB for SQL queries and auditing
- Async non-blocking synchronization
- `session_reports` table for report data backup

---

## Key Features Explained

### 1. Real-Time Quiz Delivery
Students connect via WebSocket when joining a session. Instructor triggers a question -> WebSocketManager broadcasts to all students in the session room instantly. Last quiz is cached so reconnecting students (within 2 minutes) receive missed questions. Deduplication prevents same question appearing twice.

### 2. Network Quality Monitoring
Students' browsers ping the server every 3 seconds. RTT, jitter, and stability are calculated and reported every 5 seconds. Instructor sees live animated progress bars per student updating every 2 seconds. Quality levels determine if engagement metrics need adjustment. Students with poor connections are not misclassified as disengaged.

### 3. Student Engagement Clustering
AI-powered clustering groups students by engagement level (high/medium/low/at-risk). Clusters update dynamically based on quiz performance, participation, and response time. Instructors use this to identify struggling students and tailor teaching.

### 4. Zoom Integration
Sessions auto-create Zoom meetings via API. Webhooks track participant join/leave events. Meeting end webhook auto-generates session reports. Dual ID support (MongoDB ObjectId + Zoom meeting ID).

### 5. Session Reports
Comprehensive reports generated when sessions end. Include: attendance (join/leave timeline), quiz performance (per question, per student), engagement clusters, network quality summary. Stored in MongoDB with MySQL backup. PDF export available.

---

## Environment Variables

```env
# MongoDB
MONGODB_URI=mongodb+srv://...
MONGODB_DB_NAME=learning_platform

# Zoom API
ZOOM_ACCOUNT_ID=...
ZOOM_CLIENT_ID=...
ZOOM_CLIENT_SECRET=...
ZOOM_WEBHOOK_SECRET_TOKEN=...

# JWT
JWT_SECRET=your-secret-key
JWT_ALGORITHM=HS256

# Email (Resend)
RESEND_API_KEY=...
FROM_EMAIL=noreply@yourdomain.com

# Frontend URL
FRONTEND_URL=http://localhost:5173

# MySQL Backup (optional)
MYSQL_HOST=localhost
MYSQL_USER=root
MYSQL_PASSWORD=...
MYSQL_DATABASE=learning_platform

# Web Push (VAPID)
VAPID_PUBLIC_KEY=...
VAPID_PRIVATE_KEY=...
VAPID_EMAIL=mailto:admin@yourdomain.com
```

---

## Getting Started

### Prerequisites
- Python 3.9+
- Node.js 18+
- MongoDB (Atlas or local)
- Zoom Account (for API integration)

### Backend Setup
```bash
cd backend
pip install -r requirements.txt
# Create .env file (use env_template.txt as reference)
python -m uvicorn src.main:app --reload --port 8000
```

### Frontend Setup
```bash
cd frontend
npm install
# Create .env file with VITE_API_URL=http://localhost:8000/api
npm run dev
```

### Database Seeding
```bash
cd backend
python -m src.database.seed
```

---

**Built as a Final Year Project (FYP) for AI-Powered Real-Time Student Engagement Monitoring.**
 