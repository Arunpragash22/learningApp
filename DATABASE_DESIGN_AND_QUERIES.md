# ClassPulse — Database Design, Security & Queries

## Table of Contents

1. [Constraints (Primary Key, Foreign Key, Check, Unique)](#1-constraints)
2. [Physical Database Design](#2-physical-database-design)
3. [Security Design](#3-security-design)
4. [Data Retrieval Queries](#4-data-retrieval-queries)
5. [Data Manipulation Queries](#5-data-manipulation-queries)

---

## 1. Constraints

ClassPulse uses a **hybrid database architecture**: MongoDB (primary, source of truth) and MySQL (backup, read-only). The constraints below apply to the MySQL backup database.

### 1.1 Primary Key Constraints

Every MySQL table uses a surrogate auto-increment primary key for row identification.

| Table | Column | Type | Description |
|-------|--------|------|-------------|
| `session_reports_backup` | `id` | `BIGINT AUTO_INCREMENT` | Unique row identifier for each session report |
| `users_backup` | `id` | `BIGINT AUTO_INCREMENT` | Unique row identifier for each user |
| `courses_backup` | `id` | `BIGINT AUTO_INCREMENT` | Unique row identifier for each course |
| `questions_backup` | `id` | `BIGINT AUTO_INCREMENT` | Unique row identifier for each question |
| `quiz_answers_backup` | `id` | `BIGINT AUTO_INCREMENT` | Unique row identifier for each quiz answer |
| `student_participation_backup` | `id` | `BIGINT AUTO_INCREMENT` | Unique row identifier for each participation record |

### 1.2 Unique Constraints

Unique constraints prevent duplicate records from being backed up from MongoDB.

| Table | Constraint Name | Column(s) | Type | Purpose |
|-------|----------------|-----------|------|---------|
| `session_reports_backup` | (auto) | `mongo_id` | Single-column | One backup per MongoDB report document |
| `users_backup` | (auto) | `mongo_id` | Single-column | One backup per MongoDB user document |
| `courses_backup` | (auto) | `mongo_id` | Single-column | One backup per MongoDB course document |
| `questions_backup` | (auto) | `mongo_id` | Single-column | One backup per MongoDB question document |
| `quiz_answers_backup` | (auto) | `mongo_id` | Single-column | One backup per MongoDB answer document |
| `student_participation_backup` | `uk_report_student` | `(report_mongo_id, student_id)` | **Composite** | A student can appear only once per session report |

### 1.3 Foreign Key Constraints (Logical)

Since the primary source of truth is MongoDB, MySQL does not enforce physical foreign keys. These are **logical relationships** maintained by the sync service.

| Child Table | Child Column | Parent Table | Parent Column | Relationship | Description |
|------------|-------------|-------------|--------------|-------------|-------------|
| `student_participation_backup` | `report_mongo_id` | `session_reports_backup` | `mongo_id` | Many-to-One | Each participation belongs to one session report |
| `student_participation_backup` | `session_id` | `session_reports_backup` | `session_id` | Many-to-One | Each participation is linked to a session |
| `quiz_answers_backup` | `session_id` | `session_reports_backup` | `session_id` | Many-to-One | Each answer belongs to a session |
| `quiz_answers_backup` | `student_id` | `users_backup` | `mongo_id` | Many-to-One | Each answer belongs to a student |
| `quiz_answers_backup` | `question_id` | `questions_backup` | `mongo_id` | Many-to-One | Each answer is for a specific question |
| `questions_backup` | `course_id` | `courses_backup` | `mongo_id` | Many-to-One | Each question belongs to a course |
| `questions_backup` | `created_by` | `users_backup` | `mongo_id` | Many-to-One | Each question is created by an instructor |
| `courses_backup` | `instructor_id` | `users_backup` | `mongo_id` | Many-to-One | Each course belongs to an instructor |

### 1.4 CHECK Constraints (via Data Types)

MySQL enforces value ranges through data type definitions.

| Table | Column | Type | Enforced Range |
|-------|--------|------|---------------|
| `session_reports_backup` | `average_quiz_score` | `DECIMAL(5,2)` | -999.99 to 999.99 |
| `student_participation_backup` | `quiz_score` | `DECIMAL(5,2)` | -999.99 to 999.99 |
| `student_participation_backup` | `average_response_time` | `DECIMAL(8,2)` | -999999.99 to 999999.99 |
| `quiz_answers_backup` | `time_taken` | `DECIMAL(8,2)` | -999999.99 to 999999.99 |
| All tables | `mongo_id` | `VARCHAR(24)` | Max 24 characters (MongoDB ObjectId length) |
| `users_backup` | `email` | `VARCHAR(255)` | Max 255 characters |
| `users_backup` | `is_active` | `BOOLEAN` | TRUE or FALSE only |
| `quiz_answers_backup` | `is_correct` | `BOOLEAN` | TRUE or FALSE only |
| `questions_backup` | `options` | `JSON` | Must be valid JSON format |
| `questions_backup` | `tags` | `JSON` | Must be valid JSON format |

### 1.5 NOT NULL Constraints

| Table | NOT NULL Columns |
|-------|-----------------|
| `session_reports_backup` | `id`, `mongo_id`, `session_id` |
| `users_backup` | `id`, `mongo_id`, `email` |
| `courses_backup` | `id`, `mongo_id` |
| `questions_backup` | `id`, `mongo_id` |
| `quiz_answers_backup` | `id`, `mongo_id`, `session_id`, `student_id`, `question_id` |
| `student_participation_backup` | `id`, `report_mongo_id`, `session_id`, `student_id` |

### 1.6 DEFAULT Value Constraints

| Table | Column | Default Value |
|-------|--------|--------------|
| `session_reports_backup` | `total_participants` | `0` |
| `session_reports_backup` | `total_questions_asked` | `0` |
| `session_reports_backup` | `highly_engaged_count` | `0` |
| `session_reports_backup` | `moderately_engaged_count` | `0` |
| `session_reports_backup` | `at_risk_count` | `0` |
| `session_reports_backup` | `report_type` | `'master'` |
| `users_backup` | `role` | `'student'` |
| `users_backup` | `is_active` | `TRUE` |
| `courses_backup` | `status` | `'active'` |
| `courses_backup` | `enrolled_count` | `0` |
| `student_participation_backup` | `total_questions` | `0` |
| `student_participation_backup` | `correct_answers` | `0` |
| `student_participation_backup` | `incorrect_answers` | `0` |
| All tables | `backed_up_at` | `CURRENT_TIMESTAMP` |

---

## 2. Physical Database Design

### 2.1 Storage Engine & Character Set

| Property | Value | Reason |
|----------|-------|--------|
| **Engine** | InnoDB | Transaction support, row-level locking, crash recovery |
| **Character Set** | `utf8mb4` | Full Unicode support including emojis |
| **Collation** | `utf8mb4_unicode_ci` | Case-insensitive Unicode string comparison |

### 2.2 Table Structure & Storage Layout

#### Table: `session_reports_backup`

```sql
CREATE TABLE IF NOT EXISTS session_reports_backup (
    id                       BIGINT AUTO_INCREMENT PRIMARY KEY,
    mongo_id                 VARCHAR(24) UNIQUE NOT NULL,
    session_id               VARCHAR(24) NOT NULL,
    session_title            VARCHAR(255),
    course_name              VARCHAR(255),
    course_code              VARCHAR(50),
    instructor_id            VARCHAR(24),
    instructor_name          VARCHAR(255),
    session_date             DATE,
    session_status           VARCHAR(50),
    total_participants       INT DEFAULT 0,
    total_questions_asked    INT DEFAULT 0,
    average_quiz_score       DECIMAL(5,2),
    highly_engaged_count     INT DEFAULT 0,
    moderately_engaged_count INT DEFAULT 0,
    at_risk_count            INT DEFAULT 0,
    report_type              VARCHAR(50) DEFAULT 'master',
    generated_at             DATETIME,
    backed_up_at             DATETIME DEFAULT CURRENT_TIMESTAMP,

    INDEX idx_session_id     (session_id),
    INDEX idx_instructor_id  (instructor_id),
    INDEX idx_session_date   (session_date),
    INDEX idx_course_code    (course_code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
```

#### Table: `users_backup`

```sql
CREATE TABLE IF NOT EXISTS users_backup (
    id            BIGINT AUTO_INCREMENT PRIMARY KEY,
    mongo_id      VARCHAR(24) UNIQUE NOT NULL,
    email         VARCHAR(255) NOT NULL,
    first_name    VARCHAR(100),
    last_name     VARCHAR(100),
    role          VARCHAR(50) DEFAULT 'student',
    created_at    DATETIME,
    last_login    DATETIME,
    is_active     BOOLEAN DEFAULT TRUE,
    backed_up_at  DATETIME DEFAULT CURRENT_TIMESTAMP,

    INDEX idx_email (email),
    INDEX idx_role  (role)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
```

#### Table: `courses_backup`

```sql
CREATE TABLE IF NOT EXISTS courses_backup (
    id              BIGINT AUTO_INCREMENT PRIMARY KEY,
    mongo_id        VARCHAR(24) UNIQUE NOT NULL,
    course_code     VARCHAR(50),
    course_name     VARCHAR(255),
    description     TEXT,
    instructor_id   VARCHAR(24),
    instructor_name VARCHAR(255),
    semester        VARCHAR(50),
    year            INT,
    credits         INT,
    status          VARCHAR(50) DEFAULT 'active',
    enrolled_count  INT DEFAULT 0,
    created_at      DATETIME,
    backed_up_at    DATETIME DEFAULT CURRENT_TIMESTAMP,

    INDEX idx_course_code    (course_code),
    INDEX idx_instructor_id  (instructor_id),
    INDEX idx_status         (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
```

#### Table: `questions_backup`

```sql
CREATE TABLE IF NOT EXISTS questions_backup (
    id             BIGINT AUTO_INCREMENT PRIMARY KEY,
    mongo_id       VARCHAR(24) UNIQUE NOT NULL,
    question_text  TEXT,
    question_type  VARCHAR(50),
    difficulty     VARCHAR(50),
    course_id      VARCHAR(24),
    created_by     VARCHAR(24),
    correct_answer INT,
    options        JSON,
    tags           JSON,
    created_at     DATETIME,
    backed_up_at   DATETIME DEFAULT CURRENT_TIMESTAMP,

    INDEX idx_course_id   (course_id),
    INDEX idx_difficulty   (difficulty),
    INDEX idx_created_by   (created_by)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
```

#### Table: `quiz_answers_backup`

```sql
CREATE TABLE IF NOT EXISTS quiz_answers_backup (
    id              BIGINT AUTO_INCREMENT PRIMARY KEY,
    mongo_id        VARCHAR(24) UNIQUE NOT NULL,
    session_id      VARCHAR(50) NOT NULL,
    student_id      VARCHAR(50) NOT NULL,
    question_id     VARCHAR(50) NOT NULL,
    answer_index    INT,
    is_correct      BOOLEAN,
    time_taken      DECIMAL(8,2),
    network_quality VARCHAR(50),
    answered_at     DATETIME,
    backed_up_at    DATETIME DEFAULT CURRENT_TIMESTAMP,

    INDEX idx_session_id  (session_id),
    INDEX idx_student_id  (student_id),
    INDEX idx_question_id (question_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
```

#### Table: `student_participation_backup`

```sql
CREATE TABLE IF NOT EXISTS student_participation_backup (
    id                          BIGINT AUTO_INCREMENT PRIMARY KEY,
    report_mongo_id             VARCHAR(24) NOT NULL,
    session_id                  VARCHAR(24) NOT NULL,
    student_id                  VARCHAR(50) NOT NULL,
    student_name                VARCHAR(255),
    student_email               VARCHAR(255),
    joined_at                   DATETIME,
    left_at                     DATETIME,
    attendance_duration_minutes INT,
    total_questions             INT DEFAULT 0,
    correct_answers             INT DEFAULT 0,
    incorrect_answers           INT DEFAULT 0,
    quiz_score                  DECIMAL(5,2),
    average_response_time       DECIMAL(8,2),
    connection_quality          VARCHAR(50),
    backed_up_at                DATETIME DEFAULT CURRENT_TIMESTAMP,

    UNIQUE KEY uk_report_student (report_mongo_id, student_id),

    INDEX idx_student_id    (student_id),
    INDEX idx_session_id    (session_id),
    INDEX idx_student_email (student_email)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
```

### 2.3 Index Design

| Table | Index Name | Column(s) | Type | Purpose |
|-------|-----------|-----------|------|---------|
| `session_reports_backup` | `PRIMARY` | `id` | Clustered (B-Tree) | Row lookup by auto-increment ID |
| `session_reports_backup` | `mongo_id` | `mongo_id` | Unique B-Tree | Prevent duplicates, fast sync lookup |
| `session_reports_backup` | `idx_session_id` | `session_id` | Non-unique B-Tree | Fast session lookup |
| `session_reports_backup` | `idx_instructor_id` | `instructor_id` | Non-unique B-Tree | Filter reports by instructor |
| `session_reports_backup` | `idx_session_date` | `session_date` | Non-unique B-Tree | Date range queries |
| `session_reports_backup` | `idx_course_code` | `course_code` | Non-unique B-Tree | Filter by course |
| `users_backup` | `PRIMARY` | `id` | Clustered (B-Tree) | Row lookup |
| `users_backup` | `mongo_id` | `mongo_id` | Unique B-Tree | Prevent duplicates |
| `users_backup` | `idx_email` | `email` | Non-unique B-Tree | Fast email lookup |
| `users_backup` | `idx_role` | `role` | Non-unique B-Tree | Filter by role |
| `courses_backup` | `idx_course_code` | `course_code` | Non-unique B-Tree | Fast course lookup |
| `courses_backup` | `idx_instructor_id` | `instructor_id` | Non-unique B-Tree | Filter by instructor |
| `courses_backup` | `idx_status` | `status` | Non-unique B-Tree | Filter active/inactive |
| `questions_backup` | `idx_course_id` | `course_id` | Non-unique B-Tree | Questions by course |
| `questions_backup` | `idx_difficulty` | `difficulty` | Non-unique B-Tree | Filter by difficulty |
| `questions_backup` | `idx_created_by` | `created_by` | Non-unique B-Tree | Questions by instructor |
| `quiz_answers_backup` | `idx_session_id` | `session_id` | Non-unique B-Tree | Answers by session |
| `quiz_answers_backup` | `idx_student_id` | `student_id` | Non-unique B-Tree | Answers by student |
| `quiz_answers_backup` | `idx_question_id` | `question_id` | Non-unique B-Tree | Answers by question |
| `student_participation_backup` | `uk_report_student` | `(report_mongo_id, student_id)` | Composite Unique B-Tree | Prevent duplicate entries |
| `student_participation_backup` | `idx_student_id` | `student_id` | Non-unique B-Tree | Student lookup |
| `student_participation_backup` | `idx_session_id` | `session_id` | Non-unique B-Tree | Session lookup |
| `student_participation_backup` | `idx_student_email` | `student_email` | Non-unique B-Tree | Email-based search |

### 2.4 Entity-Relationship Diagram

```
┌──────────────────────────────┐
│        users_backup           │
├──────────────────────────────┤
│ PK  id (BIGINT AUTO_INCR)   │
│ UQ  mongo_id (VARCHAR 24)    │
│ NN  email (VARCHAR 255)      │
│     first_name (VARCHAR 100) │
│     last_name (VARCHAR 100)  │
│     role (VARCHAR 50)        │
│     created_at (DATETIME)    │
│     last_login (DATETIME)    │
│     is_active (BOOLEAN)      │
│     backed_up_at (DATETIME)  │
└──────────┬───────────────────┘
           │
           │ 1:N (instructor creates courses)
           │ 1:N (instructor creates questions)
           │ 1:N (student submits answers)
           │
    ┌──────┼──────────────────────────┐
    ▼      ▼                          ▼
┌──────────────────┐  ┌──────────────────────┐  ┌───────────────────────┐
│ courses_backup    │  │ questions_backup       │  │ quiz_answers_backup    │
├──────────────────┤  ├──────────────────────┤  ├───────────────────────┤
│ PK  id           │  │ PK  id               │  │ PK  id                │
│ UQ  mongo_id     │  │ UQ  mongo_id         │  │ UQ  mongo_id          │
│     course_code  │  │     question_text     │  │ NN  session_id        │
│     course_name  │  │     question_type     │  │ NN  student_id        │
│ FK  instructor_id│  │     difficulty        │  │ NN  question_id       │
│     instructor_  │  │ FK  course_id         │  │     answer_index      │
│       name       │  │ FK  created_by        │  │     is_correct        │
│     semester     │  │     correct_answer    │  │     time_taken        │
│     year         │  │     options (JSON)    │  │     network_quality   │
│     credits      │  │     tags (JSON)       │  │     answered_at       │
│     status       │  │     created_at        │  │     backed_up_at      │
│     enrolled_    │  │     backed_up_at      │  └───────────────────────┘
│       count      │  └──────────────────────┘
│     created_at   │
│     backed_up_at │
└──────────────────┘

┌──────────────────────────────────┐
│    session_reports_backup         │
├──────────────────────────────────┤
│ PK  id (BIGINT AUTO_INCR)       │
│ UQ  mongo_id (VARCHAR 24)        │
│ NN  session_id (VARCHAR 24)      │
│     session_title                │
│     course_name / course_code    │
│     instructor_id / instructor_  │
│       name                       │
│     session_date (DATE)          │
│     session_status               │
│     total_participants           │
│     total_questions_asked        │
│     average_quiz_score           │
│     highly_engaged_count         │
│     moderately_engaged_count     │
│     at_risk_count                │
│     report_type                  │
│     generated_at                 │
│     backed_up_at                 │
└────────────┬─────────────────────┘
             │
             │ 1:N (one report has many student participation records)
             │
┌────────────▼─────────────────────┐
│ student_participation_backup      │
├──────────────────────────────────┤
│ PK  id (BIGINT AUTO_INCR)       │
│ UQ  (report_mongo_id+student_id) │
│ FK  report_mongo_id → session_   │
│       reports_backup.mongo_id    │
│ FK  session_id → session_        │
│       reports_backup.session_id  │
│ NN  student_id                   │
│     student_name                 │
│     student_email                │
│     joined_at / left_at          │
│     attendance_duration_minutes  │
│     total_questions              │
│     correct_answers              │
│     incorrect_answers            │
│     quiz_score                   │
│     average_response_time        │
│     connection_quality           │
│     backed_up_at                 │
└──────────────────────────────────┘
```

### 2.5 Storage Estimation

| Table | Estimated Row Size | Growth Rate |
|-------|--------------------|-------------|
| `session_reports_backup` | ~1 KB per row | 1-5 rows per week (per session) |
| `users_backup` | ~500 bytes per row | Depends on registration rate |
| `courses_backup` | ~800 bytes per row | Low (few courses per semester) |
| `questions_backup` | ~2 KB per row (JSON options) | 5-20 per session |
| `quiz_answers_backup` | ~300 bytes per row | High — each student answer per session |
| `student_participation_backup` | ~400 bytes per row | Proportional to session × students |

---

## 3. Security Design

### 3.1 User Roles and Access Control

ClassPulse implements **Role-Based Access Control (RBAC)** with three roles.

| Role | Description | Permissions |
|------|------------|-------------|
| **student** | Learner enrolled in courses | View own data, submit answers, view own reports, view own attendance, join sessions |
| **instructor** | Course creator and session host | All student permissions + create courses, create questions, start/end sessions, view all student data, trigger quizzes, manage MySQL sync, view analytics |
| **admin** | System administrator | All instructor permissions + manage all users |

### 3.2 Access Control Implementation

#### Authentication Middleware

Every HTTP request passes through the `AuthMiddleware` class which:

1. Extracts the JWT token from the `Authorization: Bearer <token>` header
2. Decodes and validates the token using the `JWT_SECRET`
3. Fetches the full user document from MongoDB
4. Attaches the user object to `request.state.user`

```python
# backend/src/middleware/auth.py

class AuthMiddleware:
    async def __call__(self, request: Request, call_next: Callable):
        auth_header = request.headers.get("authorization")
        if auth_header and auth_header.startswith("Bearer "):
            token = auth_header.split(" ")[1]
            payload = decode_access_token(token)
            if payload:
                user_id = payload.get("sub")
                user = await UserModel.find_by_id(user_id)
                request.state.user = user
```

#### Role-Based Dependency Guards

FastAPI dependency injection enforces role-based access at the endpoint level:

```python
# Any authenticated user
async def get_current_user(request: Request) -> dict:
    if request.state.user is None:
        raise HTTPException(status_code=401, detail="Authentication required")
    return request.state.user

# Instructor or admin only
async def require_instructor(request: Request) -> dict:
    user = await get_current_user(request)
    if user.get("role") not in ["instructor", "admin"]:
        raise HTTPException(status_code=403, detail="Instructor access required")
    return user

# Student only
def require_student(user: dict = Depends(get_current_user)):
    if user.get("role") not in ["student"]:
        raise HTTPException(status_code=403, detail="Only students can access this endpoint")
    return user
```

### 3.3 Privilege Assignment Per Endpoint

| API Route | Required Role | Guard Used |
|-----------|-------------|------------|
| `POST /api/auth/register` | None (public) | No guard |
| `POST /api/auth/login` | None (public) | No guard |
| `POST /api/auth/verify-email/{token}` | None (public) | No guard |
| `GET /api/auth/users` | Instructor/Admin | `require_instructor` |
| `POST /api/courses/` | Instructor | `require_instructor` |
| `GET /api/courses/my-courses` | Instructor | `require_instructor` |
| `GET /api/courses/enrolled` | Student | `get_current_user` |
| `POST /api/courses/{id}/enroll` | Any authenticated | `get_current_user` |
| `POST /api/questions/` | Instructor | `require_instructor` |
| `GET /api/questions/` | Any authenticated | `get_current_user` |
| `PUT /api/questions/{id}` | Instructor | `require_instructor` |
| `DELETE /api/questions/{id}` | Instructor | `require_instructor` |
| `POST /api/sessions/` | Instructor | `require_instructor` |
| `POST /api/sessions/{id}/end` | Instructor | `require_instructor` |
| `GET /api/sessions/` | Any authenticated | `get_current_user` |
| `GET /api/instructor/reports/*` | Instructor | `require_instructor` |
| `GET /api/student/reports/*` | Student | `require_student` |
| `GET /api/feedback/{session_id}` | Any authenticated | `get_current_user` |
| `GET /api/clustering/{session_id}` | Any authenticated | `get_current_user` |
| `POST /api/admin/mysql-sync/*` | Instructor/Admin | `require_instructor` |
| `DELETE /api/admin/mysql-sync/clear-mysql` | Instructor/Admin | `require_instructor` |
| `GET /api/live/quiz-automation/*` | Instructor | `require_instructor` |
| `POST /api/live/trigger/*` | Instructor | `require_instructor` |

### 3.4 Data Isolation

Students can **ONLY** access their own data. This is enforced at the query level:

```python
# Student reports filter by student_id from JWT token
student_id = user.get("id")  # From authenticated JWT

# Only fetch this student's participation
await db.session_participants.find({"studentId": student_id})

# Only fetch this student's quiz answers
await db.quiz_answers.find({"studentId": student_id})

# Stored reports: filter to only this student's data
for s in report.get("students", []):
    if s.get("studentId") == student_id:
        student_data = s  # Only this student's data is returned
```

Instructors can only view sessions they created:

```python
session = await db.sessions.find_one({"_id": ObjectId(session_id)})
if session.get("instructorId") != instructor_id:
    raise HTTPException(status_code=403, detail="You can only view your own sessions")
```

### 3.5 Encryption Methods

| Layer | Method | Details |
|-------|--------|---------|
| **Password Hashing** | SHA-256 | Passwords are hashed before storage: `hashlib.sha256(password.encode()).hexdigest()` — plaintext is never stored |
| **JWT Token Signing** | HMAC-SHA256 (HS256) | Tokens signed with `JWT_SECRET` environment variable. Includes `exp` (expiration) and `iat` (issued-at) claims |
| **Token Expiration** | Time-based | Access tokens expire after 24 hours. Refresh tokens expire after 7 days. Password reset tokens expire after 1 hour |
| **Transport Encryption** | HTTPS/TLS | Railway enforces HTTPS on all deployed services. `Strict-Transport-Security` header set with 1-year max-age |
| **Database Connection** | TLS/SSL | MongoDB Atlas connections use TLS by default via `mongodb+srv://` URI. MySQL Railway connections encrypted in transit |
| **Environment Secrets** | Railway Vault | All sensitive credentials (`JWT_SECRET`, `MONGODB_URL`, `MYSQL_PASSWORD`, `RESEND_API_KEY`) stored in Railway's encrypted variable store — never in code |
| **Email Verification** | Secure Random Token | Verification tokens generated with `secrets.token_urlsafe(32)` — cryptographically secure random bytes |

### 3.6 Security Headers

The backend applies security headers to every HTTP response:

```python
response.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains"
response.headers["X-Content-Type-Options"] = "nosniff"
response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
response.headers["X-Frame-Options"] = "SAMEORIGIN"
response.headers["Permissions-Policy"] = "geolocation=(), microphone=(), camera=()"
response.headers["Content-Security-Policy"] = "default-src 'self' https:; ..."
```

### 3.7 MySQL Backup Security

| Principle | Implementation |
|-----------|---------------|
| **Read-Only** | MySQL backup data is `INSERT IGNORE` only — no updates or deletes from the sync service |
| **Non-Blocking** | MySQL failures never crash or block the main API flow |
| **Instructor-Only Sync** | All `/api/admin/mysql-sync/*` endpoints require `require_instructor` guard |
| **Duplicate Prevention** | `UNIQUE` constraint on `mongo_id` prevents duplicate backups |

---

## 4. Data Retrieval Queries

### 4.1 MySQL Data Retrieval Queries

#### Q1: Get all session reports (ordered by most recent backup)

```sql
SELECT 
    id, mongo_id, session_id, session_title, course_name,
    instructor_name, session_date, total_participants,
    total_questions_asked, average_quiz_score, backed_up_at
FROM session_reports_backup
ORDER BY backed_up_at DESC
LIMIT 50;
```

#### Q2: Count total records in session reports backup

```sql
SELECT COUNT(*) FROM session_reports_backup;
```

#### Q3: Count total student participation records

```sql
SELECT COUNT(*) FROM student_participation_backup;
```

#### Q4: Get all sessions for a specific instructor

```sql
SELECT session_id, session_title, session_date, total_participants
FROM session_reports_backup
WHERE instructor_id = '6923dd13eb13d1ef693bdbc7'
ORDER BY session_date DESC;
```

#### Q5: Get engagement statistics per course

```sql
SELECT 
    course_name,
    COUNT(*) AS total_sessions,
    SUM(total_participants) AS total_students,
    AVG(average_quiz_score) AS avg_score
FROM session_reports_backup
GROUP BY course_name;
```

#### Q6: Find at-risk students (low scores across multiple sessions)

```sql
SELECT 
    sp.student_name,
    sp.student_email,
    COUNT(sp.id) AS sessions_attended,
    AVG(sp.quiz_score) AS avg_score
FROM student_participation_backup sp
WHERE sp.quiz_score < 50
GROUP BY sp.student_id, sp.student_name, sp.student_email
HAVING COUNT(sp.id) >= 3;
```

#### Q7: Get questions by difficulty level

```sql
SELECT question_text, question_type, difficulty, created_at
FROM questions_backup
WHERE difficulty = 'hard'
ORDER BY created_at DESC;
```

#### Q8: Get user count by role

```sql
SELECT role, COUNT(*) AS user_count
FROM users_backup
GROUP BY role;
```

#### Q9: Get quiz answers with correctness for a session

```sql
SELECT student_id, question_id, answer_index, is_correct, time_taken
FROM quiz_answers_backup
WHERE session_id = '6923dd13eb13d1ef693bdbc7'
ORDER BY answered_at;
```

#### Q10: Get student performance across all sessions

```sql
SELECT 
    sp.student_name,
    COUNT(DISTINCT sp.session_id) AS sessions_attended,
    SUM(sp.total_questions) AS total_questions,
    SUM(sp.correct_answers) AS total_correct,
    ROUND(AVG(sp.quiz_score), 2) AS avg_score,
    ROUND(AVG(sp.average_response_time), 2) AS avg_response_time
FROM student_participation_backup sp
GROUP BY sp.student_id, sp.student_name
ORDER BY avg_score DESC;
```

### 4.2 MongoDB Data Retrieval Queries (via Python/Motor)

#### Q11: Find user by email

```python
user = await database.users.find_one({"email": "student@example.com"})
```

#### Q12: Get all sessions by instructor (sorted by date descending)

```python
async for session in db.sessions.find(
    {"instructorId": instructor_id}
).sort("date", -1):
    # Process each session
```

#### Q13: Count participants for a session

```python
count = await db.session_participants.count_documents({"sessionId": session_id})
```

#### Q14: Get student's attendance across all sessions

```python
async for participant in db.session_participants.find({"studentId": student_id}):
    # Process attendance record
```

#### Q15: Get quiz answers for a student in a session

```python
async for answer in db.quiz_answers.find({
    "sessionId": session_id,
    "studentId": student_id
}):
    # Process each answer
```

#### Q16: Get stored session reports where student participated (by student ID)

```python
async for report in db.session_reports.find({
    "students.studentId": student_id,
    "reportType": "master"
}).sort("generatedAt", -1):
    # Process report
```

#### Q17: Find session by Zoom meeting ID

```python
session = await db.sessions.find_one({"zoomMeetingId": int(meeting_id)})
```

#### Q18: Get cluster results for a session

```python
cluster_map = await ClusterModel.get_student_cluster_map(session_id)
# Returns: {"student_id_1": "active", "student_id_2": "moderate", ...}
```

#### Q19: Count correct answers for a student

```python
correct = await db.question_assignments.count_documents({
    "sessionId": session_id,
    "studentId": student_id,
    "isCorrect": True
})
```

#### Q20: Get master report count in MongoDB

```python
count = await db.session_reports.count_documents({"reportType": "master"})
```

---

## 5. Data Manipulation Queries

### 5.1 MySQL Data Manipulation Queries (INSERT)

#### M1: Insert session report backup

```sql
INSERT IGNORE INTO session_reports_backup (
    mongo_id, session_id, session_title, course_name, course_code,
    instructor_id, instructor_name, session_date, session_status,
    total_participants, total_questions_asked, average_quiz_score,
    highly_engaged_count, moderately_engaged_count, at_risk_count,
    report_type, generated_at
) VALUES (
    %s, %s, %s, %s, %s, %s, %s, %s, %s, %s,
    %s, %s, %s, %s, %s, %s, %s
);
```

#### M2: Insert user backup

```sql
INSERT IGNORE INTO users_backup (
    mongo_id, email, first_name, last_name, role,
    created_at, last_login, is_active
) VALUES (%s, %s, %s, %s, %s, %s, %s, %s);
```

#### M3: Insert quiz answer backup

```sql
INSERT IGNORE INTO quiz_answers_backup (
    mongo_id, session_id, student_id, question_id,
    answer_index, is_correct, time_taken, network_quality,
    answered_at
) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s);
```

#### M4: Insert question backup

```sql
INSERT IGNORE INTO questions_backup (
    mongo_id, question_text, question_type, difficulty,
    course_id, created_by, correct_answer, options, tags,
    created_at
) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s);
```

#### M5: Insert course backup

```sql
INSERT IGNORE INTO courses_backup (
    mongo_id, course_code, course_name, description,
    instructor_id, instructor_name, semester, year,
    credits, status, enrolled_count, created_at
) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s);
```

#### M6: Insert student participation backup

```sql
INSERT IGNORE INTO student_participation_backup (
    report_mongo_id, session_id, student_id, student_name,
    student_email, joined_at, left_at, attendance_duration_minutes,
    total_questions, correct_answers, incorrect_answers,
    quiz_score, average_response_time, connection_quality
) VALUES (
    %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s
);
```

#### M7: Delete all student participation records (before re-sync)

```sql
DELETE FROM student_participation_backup;
```

#### M8: Delete all session reports (before re-sync)

```sql
DELETE FROM session_reports_backup;
```

### 5.2 MongoDB Data Manipulation Queries (via Python/Motor)

#### M9: Create (register) a new user

```python
result = await database.users.insert_one({
    "firstName": "John",
    "lastName": "Doe",
    "email": "john@example.com",
    "password": hashed_password,  # SHA-256 hashed
    "role": "student",
    "status": 0,  # Pending verification
    "verificationToken": token,
    "verificationTokenExpiry": expiry,
    "createdAt": datetime.utcnow(),
    "updatedAt": datetime.utcnow()
})
```

#### M10: Verify user email (activate account)

```python
await database.users.update_one(
    {"_id": user["_id"]},
    {
        "$set": {
            "status": 1,
            "emailVerified": True,
            "emailVerifiedAt": datetime.utcnow(),
            "updatedAt": datetime.utcnow()
        },
        "$unset": {
            "verificationToken": "",
            "verificationTokenExpiry": ""
        }
    }
)
```

#### M11: Reset user password

```python
await database.users.update_one(
    {"_id": user["_id"]},
    {
        "$set": {
            "password": hash_password(new_password),
            "updatedAt": datetime.utcnow()
        },
        "$unset": {
            "resetPasswordToken": "",
            "resetPasswordTokenExpiry": ""
        }
    }
)
```

#### M12: Save a quiz answer

```python
await database.quiz_answers.insert_one({
    "sessionId": session_id,
    "studentId": student_id,
    "questionId": question_id,
    "answerIndex": selected_answer,
    "isCorrect": is_correct,
    "timeTaken": response_time,
    "networkStrength": {"quality": "good"},
    "timestamp": datetime.utcnow()
})
```

#### M13: Save cluster results for a session

```python
await database.cluster_results.update_one(
    {"sessionId": session_id},
    {"$set": {
        "clusters": cluster_data,
        "updatedAt": datetime.utcnow()
    }},
    upsert=True
)
```

#### M14: Save a session report to MongoDB

```python
result = await database.session_reports.insert_one({
    "sessionId": session_id,
    "sessionTitle": title,
    "courseName": course,
    "instructorId": instructor_id,
    "reportType": "master",
    "students": students_data,
    "engagementSummary": {
        "highly_engaged": active_count,
        "moderately_engaged": moderate_count,
        "at_risk": risk_count
    },
    "generatedAt": datetime.utcnow()
})
```

#### M15: Update session status to completed

```python
await database.sessions.update_one(
    {"_id": ObjectId(session_id)},
    {"$set": {
        "status": "completed",
        "actualEndTime": datetime.utcnow()
    }}
)
```

#### M16: Save contact form message

```python
await database.contact_messages.insert_one({
    "name": name,
    "email": email,
    "message": message,
    "createdAt": datetime.utcnow()
})
```

#### M17: Record question assignment to a student

```python
await database.question_assignments.insert_one({
    "sessionId": session_id,
    "studentId": student_id,
    "questionId": question_id,
    "assignedAt": datetime.utcnow(),
    "answerIndex": None,
    "isCorrect": None,
    "timeTaken": None
})
```

#### M18: Update question assignment when student answers

```python
await database.question_assignments.update_one(
    {"sessionId": session_id, "studentId": student_id, "questionId": question_id},
    {"$set": {
        "answerIndex": selected_answer,
        "isCorrect": is_correct,
        "timeTaken": response_time,
        "answeredAt": datetime.utcnow()
    }}
)
```

---

*ClassPulse — Database Design, Security & Queries Documentation*
