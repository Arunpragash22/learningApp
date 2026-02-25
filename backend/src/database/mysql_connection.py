"""
MySQL Backup Connection Module
==============================
HYBRID ARCHITECTURE: MongoDB (Primary) + MySQL (Backup)

This module provides async MySQL connectivity for the BACKUP layer only.
MongoDB remains the SOURCE OF TRUTH for all data operations.

MySQL is used EXCLUSIVELY for:
- Backup/archival of session reports
- Structured SQL-based auditing
- Read-only reporting and analytics queries

IMPORTANT DESIGN PRINCIPLES:
1. MongoDB is always written to FIRST
2. MySQL backup is triggered AFTER successful MongoDB write
3. MySQL failures NEVER block or crash the main API flow
4. No reverse writes from MySQL to MongoDB
5. MySQL data is READ-ONLY once written

Environment Variables Required:
- MYSQL_HOST: MySQL server hostname
- MYSQL_PORT: MySQL server port (default: 3306)
- MYSQL_USER: MySQL username
- MYSQL_PASSWORD: MySQL password
- MYSQL_DATABASE: Database name for backups

Author: Learning Platform Team
"""

import os
import asyncio
from typing import Optional
from contextlib import asynccontextmanager

# Conditional import - MySQL is optional
try:
    import aiomysql
    MYSQL_AVAILABLE = True
except ImportError:
    MYSQL_AVAILABLE = False
    print("⚠️ aiomysql not installed - MySQL backup disabled")


class MySQLBackupConnection:
    """
    Async MySQL connection pool manager for backup operations.
    
    This class manages a connection pool to MySQL and provides
    safe, non-blocking access for backup writes.
    
    The connection is OPTIONAL - if MySQL is unavailable or misconfigured,
    the system continues to function normally with MongoDB only.
    """
    
    def __init__(self):
        self.pool: Optional[aiomysql.Pool] = None
        self.is_connected = False
        self._lock = asyncio.Lock()
    
    async def connect(self) -> bool:
        """
        Initialize MySQL connection pool.
        Returns True if successful, False otherwise.
        Never raises exceptions - failures are logged and ignored.
        """
        if not MYSQL_AVAILABLE:
            print("⚠️ MySQL backup disabled: aiomysql not installed")
            return False
        
        async with self._lock:
            if self.pool is not None:
                return self.is_connected
            
            try:
                # Check for MYSQL_URL / MYSQL_PUBLIC_URL first (Railway provides these)
                mysql_url = os.getenv("MYSQL_URL") or os.getenv("MYSQL_PUBLIC_URL")

                if mysql_url:
                    # Parse connection URL: mysql://user:password@host:port/database
                    from urllib.parse import urlparse
                    parsed = urlparse(mysql_url)
                    host = parsed.hostname or "localhost"
                    port = parsed.port or 3306
                    user = parsed.username or "root"
                    password = parsed.password or ""
                    database = (parsed.path or "").lstrip("/") or "learning_platform_backup"
                    print(f"📡 Using MySQL URL: {host}:{port}/{database}")
                else:
                    # Fallback: individual env vars (Railway uses MYSQLHOST, code also checks MYSQL_HOST)
                    host = os.getenv("MYSQLHOST") or os.getenv("MYSQL_HOST", "localhost")
                    port = int(os.getenv("MYSQLPORT") or os.getenv("MYSQL_PORT", "3306"))
                    user = os.getenv("MYSQLUSER") or os.getenv("MYSQL_USER", "root")
                    password = os.getenv("MYSQLPASSWORD") or os.getenv("MYSQL_PASSWORD", "")
                    database = os.getenv("MYSQLDATABASE") or os.getenv("MYSQL_DATABASE", "learning_platform_backup")
                
                # Create connection pool with conservative settings
                self.pool = await aiomysql.create_pool(
                    host=host,
                    port=port,
                    user=user,
                    password=password,
                    db=database,
                    minsize=1,
                    maxsize=5,
                    autocommit=True,
                    charset='utf8mb4',
                    connect_timeout=5,  # 5 second timeout
                    echo=False
                )
                
                self.is_connected = True
                print(f"✅ MySQL backup connection established: {host}:{port}/{database}")
                
                # Initialize tables if they don't exist
                await self._initialize_tables()
                
                return True
                
            except Exception as e:
                print(f"⚠️ MySQL backup connection failed (non-fatal): {e}")
                self.is_connected = False
                return False
    
    async def _initialize_tables(self):
        """
        Create backup tables if they don't exist.
        These tables mirror MongoDB collections with flattened key fields
        plus a JSON column for the complete document.
        """
        if not self.pool:
            return
        
        try:
            async with self.pool.acquire() as conn:
                async with conn.cursor() as cursor:
                    # Session Reports Backup Table
                    await cursor.execute("""
                        CREATE TABLE IF NOT EXISTS session_reports_backup (
                            id BIGINT AUTO_INCREMENT PRIMARY KEY,
                            
                            -- MongoDB Reference (Source of Truth)
                            mongo_id VARCHAR(24) UNIQUE NOT NULL,
                            
                            -- Flattened Key Fields for SQL Queries
                            session_id VARCHAR(24) NOT NULL,
                            session_title VARCHAR(255),
                            course_name VARCHAR(255),
                            course_code VARCHAR(50),
                            instructor_id VARCHAR(24),
                            instructor_name VARCHAR(255),
                            session_date DATE,
                            session_status VARCHAR(50),
                            
                            -- Aggregated Metrics
                            total_participants INT DEFAULT 0,
                            total_questions_asked INT DEFAULT 0,
                            average_quiz_score DECIMAL(5,2),
                            
                            -- Engagement Summary (Flattened)
                            highly_engaged_count INT DEFAULT 0,
                            moderately_engaged_count INT DEFAULT 0,
                            at_risk_count INT DEFAULT 0,
                            
                            -- Metadata
                            report_type VARCHAR(50) DEFAULT 'master',
                            generated_at DATETIME,
                            backed_up_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                            
                            -- Indexes for common queries
                            INDEX idx_session_id (session_id),
                            INDEX idx_instructor_id (instructor_id),
                            INDEX idx_session_date (session_date),
                            INDEX idx_course_code (course_code)
                        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
                        COMMENT='Backup of session reports from MongoDB. READ-ONLY after insert.'
                    """)
                    
                    # ============================================================
                    # USERS BACKUP TABLE
                    # ============================================================
                    await cursor.execute("""
                        CREATE TABLE IF NOT EXISTS users_backup (
                            id BIGINT AUTO_INCREMENT PRIMARY KEY,
                            mongo_id VARCHAR(24) UNIQUE NOT NULL,
                            email VARCHAR(255) NOT NULL,
                            first_name VARCHAR(100),
                            last_name VARCHAR(100),
                            role VARCHAR(50) DEFAULT 'student',
                            created_at DATETIME,
                            last_login DATETIME,
                            is_active BOOLEAN DEFAULT TRUE,
                            backed_up_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                            INDEX idx_email (email),
                            INDEX idx_role (role)
                        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
                        COMMENT='Backup of users from MongoDB. READ-ONLY.'
                    """)
                    
                    # ============================================================
                    # QUIZ ANSWERS BACKUP TABLE
                    # ============================================================
                    await cursor.execute("""
                        CREATE TABLE IF NOT EXISTS quiz_answers_backup (
                            id BIGINT AUTO_INCREMENT PRIMARY KEY,
                            mongo_id VARCHAR(24) UNIQUE NOT NULL,
                            session_id VARCHAR(50) NOT NULL,
                            student_id VARCHAR(50) NOT NULL,
                            question_id VARCHAR(50) NOT NULL,
                            answer_index INT,
                            is_correct BOOLEAN,
                            time_taken DECIMAL(8,2),
                            network_quality VARCHAR(50),
                            answered_at DATETIME,
                            backed_up_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                            INDEX idx_session_id (session_id),
                            INDEX idx_student_id (student_id),
                            INDEX idx_question_id (question_id)
                        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
                        COMMENT='Backup of quiz answers from MongoDB. READ-ONLY.'
                    """)
                    
                    # ============================================================
                    # COURSES BACKUP TABLE
                    # ============================================================
                    await cursor.execute("""
                        CREATE TABLE IF NOT EXISTS courses_backup (
                            id BIGINT AUTO_INCREMENT PRIMARY KEY,
                            mongo_id VARCHAR(24) UNIQUE NOT NULL,
                            course_code VARCHAR(50),
                            course_name VARCHAR(255),
                            description TEXT,
                            instructor_id VARCHAR(24),
                            instructor_name VARCHAR(255),
                            semester VARCHAR(50),
                            year INT,
                            credits INT,
                            status VARCHAR(50) DEFAULT 'active',
                            enrolled_count INT DEFAULT 0,
                            created_at DATETIME,
                            backed_up_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                            INDEX idx_course_code (course_code),
                            INDEX idx_instructor_id (instructor_id),
                            INDEX idx_status (status)
                        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
                        COMMENT='Backup of courses from MongoDB. READ-ONLY.'
                    """)
                    
                    # ============================================================
                    # QUESTIONS BACKUP TABLE
                    # ============================================================
                    await cursor.execute("""
                        CREATE TABLE IF NOT EXISTS questions_backup (
                            id BIGINT AUTO_INCREMENT PRIMARY KEY,
                            mongo_id VARCHAR(24) UNIQUE NOT NULL,
                            question_text TEXT,
                            question_type VARCHAR(50),
                            difficulty VARCHAR(50),
                            course_id VARCHAR(24),
                            created_by VARCHAR(24),
                            correct_answer INT,
                            options JSON,
                            tags JSON,
                            created_at DATETIME,
                            backed_up_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                            INDEX idx_course_id (course_id),
                            INDEX idx_difficulty (difficulty),
                            INDEX idx_created_by (created_by)
                        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
                        COMMENT='Backup of questions from MongoDB. READ-ONLY.'
                    """)
                    
                    # Student Participation Backup Table
                    await cursor.execute("""
                        CREATE TABLE IF NOT EXISTS student_participation_backup (
                            id BIGINT AUTO_INCREMENT PRIMARY KEY,
                            
                            -- References
                            report_mongo_id VARCHAR(24) NOT NULL,
                            session_id VARCHAR(24) NOT NULL,
                            student_id VARCHAR(50) NOT NULL,
                            
                            -- Student Info
                            student_name VARCHAR(255),
                            student_email VARCHAR(255),
                            
                            -- Attendance
                            joined_at DATETIME,
                            left_at DATETIME,
                            attendance_duration_minutes INT,
                            
                            -- Quiz Performance
                            total_questions INT DEFAULT 0,
                            correct_answers INT DEFAULT 0,
                            incorrect_answers INT DEFAULT 0,
                            quiz_score DECIMAL(5,2),
                            average_response_time DECIMAL(8,2),
                            
                            -- Connection Quality
                            connection_quality VARCHAR(50),
                            
                            -- Metadata
                            backed_up_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                            
                            -- Composite unique constraint
                            UNIQUE KEY uk_report_student (report_mongo_id, student_id),
                            INDEX idx_student_id (student_id),
                            INDEX idx_session_id (session_id),
                            INDEX idx_student_email (student_email)
                        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
                        COMMENT='Backup of individual student participation data. READ-ONLY.'
                    """)
                    
                    print("✅ MySQL backup tables initialized")
                    
        except Exception as e:
            print(f"⚠️ Failed to initialize MySQL tables (non-fatal): {e}")
    
    @asynccontextmanager
    async def get_connection(self):
        """
        Context manager for acquiring a connection from the pool.
        Yields None if connection is unavailable (never raises).
        """
        if not self.pool or not self.is_connected:
            yield None
            return
        
        try:
            async with self.pool.acquire() as conn:
                yield conn
        except Exception as e:
            print(f"⚠️ MySQL connection error (non-fatal): {e}")
            yield None
    
    async def close(self):
        """Close the connection pool gracefully."""
        if self.pool:
            self.pool.close()
            await self.pool.wait_closed()
            self.pool = None
            self.is_connected = False
            print("MySQL backup connection closed")


# Global singleton instance
mysql_backup = MySQLBackupConnection()


async def connect_to_mysql_backup():
    """Initialize MySQL backup connection (called during app startup)."""
    await mysql_backup.connect()


async def close_mysql_backup():
    """Close MySQL backup connection (called during app shutdown)."""
    await mysql_backup.close()

