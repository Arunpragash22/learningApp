# ClassPulse — MySQL Database Constraints

## Database: `learning_platform_backup`

> **Note:** MySQL serves as a **read-only backup** database. MongoDB is the primary source of truth.

---

## Table: `session_reports_backup`

### Primary Key

| Constraint | Column | Description |
|-----------|--------|-------------|
| `PRIMARY KEY` | `id` | Auto-increment `BIGINT` — uniquely identifies each backup row |

### Unique Constraints

| Constraint | Column | Description |
|-----------|--------|-------------|
| `UNIQUE` | `mongo_id` | Ensures no duplicate MongoDB documents are backed up. Maps 1:1 to the MongoDB `_id` of the session report |

### NOT NULL Constraints

| Column | Description |
|--------|-------------|
| `mongo_id` | Must always reference a valid MongoDB document |
| `session_id` | Every report must be linked to a session |

### Default Value Constraints

| Column | Default | Description |
|--------|---------|-------------|
| `total_participants` | `0` | Defaults to zero if not provided |
| `total_questions_asked` | `0` | Defaults to zero if not provided |
| `highly_engaged_count` | `0` | Active cluster count defaults to zero |
| `moderately_engaged_count` | `0` | Moderate cluster count defaults to zero |
| `at_risk_count` | `0` | Passive/At-Risk cluster count defaults to zero |
| `report_type` | `'master'` | Defaults to master report type |
| `backed_up_at` | `CURRENT_TIMESTAMP` | Auto-set to current time on insert |

### Data Type Constraints (Implicit CHECK)

| Column | Type | Constraint |
|--------|------|-----------|
| `mongo_id` | `VARCHAR(24)` | Limited to 24 characters (MongoDB ObjectId length) |
| `session_id` | `VARCHAR(24)` | Limited to 24 characters |
| `instructor_id` | `VARCHAR(24)` | Limited to 24 characters |
| `average_quiz_score` | `DECIMAL(5,2)` | Max value 999.99 — ensures valid score range |
| `full_document` | `JSON` | MySQL validates JSON format on insert |

### Indexes

| Index Name | Column | Purpose |
|-----------|--------|---------|
| `idx_session_id` | `session_id` | Fast lookup by session |
| `idx_instructor_id` | `instructor_id` | Fast lookup by instructor |
| `idx_session_date` | `session_date` | Fast date-range queries |
| `idx_course_code` | `course_code` | Fast lookup by course |
| `idx_backed_up_at` | `backed_up_at` | Fast lookup by backup timestamp |

---

## Table: `courses_backup`

### Primary Key

| Constraint | Column | Description |
|-----------|--------|-------------|
| `PRIMARY KEY` | `id` | Auto-increment `BIGINT` — uniquely identifies each course backup row |

### Unique Constraints

| Constraint | Column | Description |
|-----------|--------|-------------|
| `UNIQUE` | `mongo_id` | Prevents duplicate course entries. Maps 1:1 to MongoDB `_id` |

### NOT NULL Constraints

| Column | Description |
|--------|-------------|
| `mongo_id` | Must always reference a valid MongoDB course document |

### Default Value Constraints

| Column | Default | Description |
|--------|---------|-------------|
| `status` | `'active'` | Course defaults to active status |
| `enrolled_count` | `0` | No students enrolled by default |
| `backed_up_at` | `CURRENT_TIMESTAMP` | Auto-set on insert |

### Data Type Constraints (Implicit CHECK)

| Column | Type | Constraint |
|--------|------|-----------|
| `mongo_id` | `VARCHAR(24)` | Limited to 24 characters |
| `course_code` | `VARCHAR(50)` | Max 50 characters |
| `instructor_id` | `VARCHAR(24)` | Limited to 24 characters |

### Indexes

| Index Name | Column | Purpose |
|-----------|--------|---------|
| `idx_course_code` | `course_code` | Fast course lookup |
| `idx_instructor_id` | `instructor_id` | Fast instructor lookup |
| `idx_status` | `status` | Fast status filtering |

---

## Table: `student_participation_backup`

### Primary Key

| Constraint | Column | Description |
|-----------|--------|-------------|
| `PRIMARY KEY` | `id` | Auto-increment `BIGINT` — uniquely identifies each participation record |

### Unique Constraints (Composite)

| Constraint | Columns | Description |
|-----------|---------|-------------|
| `uk_report_student` | `(report_mongo_id, student_id)` | Prevents duplicate entries — a student can only appear once per report. This is a **composite unique key** |

### NOT NULL Constraints

| Column | Description |
|--------|-------------|
| `report_mongo_id` | Must reference a valid session report |
| `session_id` | Must be linked to a session |
| `student_id` | Must identify a student |

### Foreign Key Relationships (Logical)

> MySQL does not enforce foreign keys to MongoDB. These are **logical references** maintained by the sync service.

| Column | References | Description |
|--------|-----------|-------------|
| `report_mongo_id` | `session_reports_backup.mongo_id` | Links participation record to its parent report |
| `session_id` | `session_reports_backup.session_id` | Links to the session |
| `student_id` | MongoDB `users._id` | References the student in MongoDB |

### Default Value Constraints

| Column | Default | Description |
|--------|---------|-------------|
| `total_questions` | `0` | No questions answered by default |
| `correct_answers` | `0` | No correct answers by default |
| `incorrect_answers` | `0` | No incorrect answers by default |
| `backed_up_at` | `CURRENT_TIMESTAMP` | Auto-set on insert |

### Data Type Constraints (Implicit CHECK)

| Column | Type | Constraint |
|--------|------|-----------|
| `report_mongo_id` | `VARCHAR(24)` | Limited to 24 characters |
| `session_id` | `VARCHAR(24)` | Limited to 24 characters |
| `student_id` | `VARCHAR(50)` | Max 50 characters |
| `quiz_score` | `DECIMAL(5,2)` | Max value 999.99 |
| `average_response_time` | `DECIMAL(8,2)` | Max value 999999.99 seconds |

### Indexes

| Index Name | Column | Purpose |
|-----------|--------|---------|
| `idx_student_id` | `student_id` | Fast student lookup across sessions |
| `idx_session_id` | `session_id` | Fast session lookup |
| `idx_student_email` | `student_email` | Fast email-based search |
| `idx_joined_at` | `joined_at` | Fast time-range queries |

---

## Constraints Summary

### All Primary Keys

| Table | Column | Type |
|-------|--------|------|
| `session_reports_backup` | `id` | `BIGINT AUTO_INCREMENT` |
| `courses_backup` | `id` | `BIGINT AUTO_INCREMENT` |
| `student_participation_backup` | `id` | `BIGINT AUTO_INCREMENT` |

### All Unique Constraints

| Table | Constraint Name | Column(s) | Type |
|-------|----------------|-----------|------|
| `session_reports_backup` | (auto) | `mongo_id` | Single-column UNIQUE |
| `courses_backup` | (auto) | `mongo_id` | Single-column UNIQUE |
| `student_participation_backup` | `uk_report_student` | `(report_mongo_id, student_id)` | Composite UNIQUE |

### All Foreign Key Relationships (Logical)

| Child Table | Child Column | Parent Table | Parent Column |
|------------|-------------|-------------|--------------|
| `student_participation_backup` | `report_mongo_id` | `session_reports_backup` | `mongo_id` |
| `student_participation_backup` | `session_id` | `session_reports_backup` | `session_id` |

### All CHECK Constraints (via Data Types)

| Table | Column | Type | Enforced Range |
|-------|--------|------|---------------|
| `session_reports_backup` | `average_quiz_score` | `DECIMAL(5,2)` | -999.99 to 999.99 |
| `student_participation_backup` | `quiz_score` | `DECIMAL(5,2)` | -999.99 to 999.99 |
| `student_participation_backup` | `average_response_time` | `DECIMAL(8,2)` | -999999.99 to 999999.99 |
| All tables | `mongo_id` | `VARCHAR(24)` | Max 24 characters |

### All NOT NULL Constraints

| Table | Column |
|-------|--------|
| `session_reports_backup` | `id`, `mongo_id`, `session_id` |
| `courses_backup` | `id`, `mongo_id` |
| `student_participation_backup` | `id`, `report_mongo_id`, `session_id`, `student_id` |

---

## Entity-Relationship Diagram

```
┌─────────────────────────────────┐
│    session_reports_backup        │
├─────────────────────────────────┤
│ PK  id (BIGINT AUTO_INCREMENT)  │
│ UQ  mongo_id (VARCHAR 24)       │
│     session_id (VARCHAR 24)     │
│     session_title               │
│     course_name                 │
│     course_code                 │
│     instructor_id               │
│     instructor_name             │
│     session_date                │
│     total_participants          │
│     total_questions_asked       │
│     average_quiz_score          │
│     highly_engaged_count        │
│     moderately_engaged_count    │
│     at_risk_count               │
│     full_document (JSON)        │
│     report_type                 │
│     generated_at                │
│     backed_up_at                │
└────────────┬────────────────────┘
             │
             │ 1:N (logical FK via report_mongo_id)
             │
┌────────────▼────────────────────┐
│ student_participation_backup     │
├──────────────────────────────────┤
│ PK  id (BIGINT AUTO_INCREMENT)  │
│ UQ  (report_mongo_id+student_id)│
│ FK  report_mongo_id (VARCHAR 24)│──→ session_reports_backup.mongo_id
│ FK  session_id (VARCHAR 24)     │──→ session_reports_backup.session_id
│     student_id (VARCHAR 50)     │
│     student_name                │
│     student_email               │
│     joined_at                   │
│     left_at                     │
│     attendance_duration_minutes │
│     total_questions             │
│     correct_answers             │
│     incorrect_answers           │
│     quiz_score                  │
│     average_response_time       │
│     connection_quality          │
│     backed_up_at                │
└──────────────────────────────────┘

┌─────────────────────────────────┐
│       courses_backup             │
├──────────────────────────────────┤
│ PK  id (BIGINT AUTO_INCREMENT)  │
│ UQ  mongo_id (VARCHAR 24)       │
│     course_code                 │
│     course_name                 │
│     description                 │
│     instructor_id               │
│     instructor_name             │
│     semester                    │
│     year                        │
│     credits                     │
│     status                      │
│     enrolled_count              │
│     created_at                  │
│     backed_up_at                │
└──────────────────────────────────┘
```

---

*ClassPulse — MySQL Backup Database Constraints Documentation*
