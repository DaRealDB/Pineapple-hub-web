# Master Database Schema - PostgreSQL

## Overview
This database schema merges the original Pineapple Hub scale data with the new OCR pipeline functionality. It's designed for PostgreSQL and supports real-time telemetry, historical analysis, OCR processing, and comprehensive audit trails.

## Entity Relationship Diagram

```
┌─────────────────┐       ┌─────────────────┐       ┌─────────────────┐
│   devices       │       │   sessions      │       │  ocr_results    │
│                 │       │                 │       │                 │
│ - id (PK)       │◄──────│ - id (PK)       │──────►│ - id (PK)       │
│ - device_id     │       │ - session_id    │       │ - session_id    │
│ - label         │       │ - device_id     │       │ - text          │
│ - type          │       │ - start_time    │       │ - confidence    │
│ - location      │       │ - end_time      │       │ - bbox_data     │
│ - status        │       │ - status        │       │ - processing_time│
│ - last_seen     │       │ - config        │       │ - created_at    │
│ - metadata      │       │ - created_at    │       │ - is_duplicate  │
│ - created_at    │       │ - updated_at    │       │ - similarity_score│
│ - updated_at    │       │                 │       │ - frame_number  │
└─────────────────┘       └─────────────────┘       └─────────────────┘
         │                         │                         │
         │                         │                         │
         ▼                         ▼                         ▼
┌─────────────────┐       ┌─────────────────┐       ┌─────────────────┐
│ weight_readings │       │ pipeline_metrics│       │ dedup_history   │
│                 │       │                 │       │                 │
│ - id (PK)       │       │ - id (PK)       │       │ - id (PK)       │
│ - device_id     │◄──────│ - session_id    │       │ - ocr_result_id │
│ - session_id    │       │ - metric_type   │       │ - original_id   │
│ - weight_g      │       │ - metric_value  │       │ - similar_ids   │
│ - grade         │       │ - timestamp     │       │ - similarity    │
│ - status        │       │ - metadata      │       │ - strategy      │
│ - timestamp     │       │ - created_at    │       │ - created_at    │
│ - created_at    │       │                 │       │                 │
└─────────────────┘       └─────────────────┘       └─────────────────┘
         │                         │
         │                         │
         ▼                         ▼
┌─────────────────┐       ┌─────────────────┐
│ connection_logs │       │ webcam_frames   │
│                 │       │                 │
│ - id (PK)       │       │ - id (PK)       │
│ - device_id     │       │ - session_id    │
│ - event_type    │       │ - frame_data    │
│ - status        │       │ - timestamp     │
│ - timestamp     │       │ - processing_ms │
│ - metadata      │       │ - ocr_result_id │
│ - created_at    │       │ - created_at    │
└─────────────────┘       └─────────────────┘
```

## Table Definitions

### 1. devices
Stores information about grading scales and OCR pipeline devices.

```sql
CREATE TABLE devices (
    id SERIAL PRIMARY KEY,
    device_id VARCHAR(50) UNIQUE NOT NULL,
    label VARCHAR(100) NOT NULL,
    type VARCHAR(20) NOT NULL CHECK (type IN ('scale', 'webcam', 'processor')),
    location VARCHAR(100),
    status VARCHAR(20) NOT NULL DEFAULT 'offline' CHECK (status IN ('online', 'offline', 'error', 'maintenance')),
    last_seen TIMESTAMP,
    device_metadata JSONB,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_devices_device_id ON devices(device_id);
CREATE INDEX idx_devices_type ON devices(type);
CREATE INDEX idx_devices_status ON devices(status);
```

### 2. sessions
Session management for OCR pipeline operations.

```sql
CREATE TABLE sessions (
    id SERIAL PRIMARY KEY,
    session_id UUID UNIQUE NOT NULL DEFAULT gen_random_uuid(),
    device_id VARCHAR(50) REFERENCES devices(device_id),
    start_time TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    end_time TIMESTAMP,
    status VARCHAR(20) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'completed', 'error', 'terminated')),
    config JSONB NOT NULL DEFAULT '{}',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_sessions_session_id ON sessions(session_id);
CREATE INDEX idx_sessions_device_id ON sessions(device_id);
CREATE INDEX idx_sessions_status ON sessions(status);
CREATE INDEX idx_sessions_start_time ON sessions(start_time);
```

### 3. weight_readings
Historical weight and grade data from scales (enhanced from original).

```sql
CREATE TABLE weight_readings (
    id SERIAL PRIMARY KEY,
    device_id VARCHAR(50) NOT NULL REFERENCES devices(device_id),
    session_id INTEGER REFERENCES sessions(id),
    weight_g DECIMAL(10,2) NOT NULL,
    grade VARCHAR(20) NOT NULL CHECK (grade IN ('light', 'grade_1', 'heavy', 'invalid')),
    status JSONB NOT NULL DEFAULT '{"hx711_fault": false, "eth_or_wifi_issue": false}',
    timestamp TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_weight_readings_device_id ON weight_readings(device_id);
CREATE INDEX idx_weight_readings_session_id ON weight_readings(session_id);
CREATE INDEX idx_weight_readings_timestamp ON weight_readings(timestamp);
CREATE INDEX idx_weight_readings_grade ON weight_readings(grade);
```

### 4. ocr_results
OCR text recognition results (NEW).

```sql
CREATE TABLE ocr_results (
    id SERIAL PRIMARY KEY,
    session_id INTEGER NOT NULL REFERENCES sessions(id),
    text TEXT NOT NULL,
    confidence DECIMAL(5,4) NOT NULL,
    bbox_data JSONB,
    processing_time_ms INTEGER,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    is_duplicate BOOLEAN DEFAULT false,
    similarity_score DECIMAL(5,4),
    frame_number INTEGER,
    verified_by VARCHAR(50),
    verification_status VARCHAR(20) DEFAULT 'pending' CHECK (verification_status IN ('pending', 'verified', 'rejected'))
);

CREATE INDEX idx_ocr_results_session_id ON ocr_results(session_id);
CREATE INDEX idx_ocr_results_confidence ON ocr_results(confidence);
CREATE INDEX idx_ocr_results_created_at ON ocr_results(created_at);
CREATE INDEX idx_ocr_results_is_duplicate ON ocr_results(is_duplicate);
CREATE INDEX idx_ocr_results_verification_status ON ocr_results(verification_status);
```

### 5. connection_logs
Device connection event logs (enhanced from original).

```sql
CREATE TABLE connection_logs (
    id SERIAL PRIMARY KEY,
    device_id VARCHAR(50) NOT NULL REFERENCES devices(device_id),
    event_type VARCHAR(20) NOT NULL CHECK (event_type IN ('connect', 'disconnect', 'error', 'reconnect')),
    status VARCHAR(20) NOT NULL,
    metadata JSONB,
    timestamp TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_connection_logs_device_id ON connection_logs(device_id);
CREATE INDEX idx_connection_logs_timestamp ON connection_logs(timestamp);
CREATE INDEX idx_connection_logs_event_type ON connection_logs(event_type);
```

### 6. pipeline_metrics
OCR pipeline performance metrics (NEW).

```sql
CREATE TABLE pipeline_metrics (
    id SERIAL PRIMARY KEY,
    session_id INTEGER NOT NULL REFERENCES sessions(id),
    metric_type VARCHAR(50) NOT NULL,
    metric_value DECIMAL(15,6) NOT NULL,
    timestamp TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    metadata JSONB,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_pipeline_metrics_session_id ON pipeline_metrics(session_id);
CREATE INDEX idx_pipeline_metrics_metric_type ON pipeline_metrics(metric_type);
CREATE INDEX idx_pipeline_metrics_timestamp ON pipeline_metrics(timestamp);
```

### 7. dedup_history
Deduplication tracking and history (NEW).

```sql
CREATE TABLE dedup_history (
    id SERIAL PRIMARY KEY,
    ocr_result_id INTEGER NOT NULL REFERENCES ocr_results(id),
    original_id INTEGER REFERENCES ocr_results(id),
    similar_ids INTEGER[],
    similarity DECIMAL(5,4) NOT NULL,
    strategy VARCHAR(20) NOT NULL CHECK (strategy IN ('fuzzy', 'exact', 'semantic')),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_dedup_history_ocr_result_id ON dedup_history(ocr_result_id);
CREATE INDEX idx_dedup_history_similarity ON dedup_history(similarity);
CREATE INDEX idx_dedup_history_created_at ON dedup_history(created_at);
```

### 8. webcam_frames
Webcam frame capture history (NEW).

```sql
CREATE TABLE webcam_frames (
    id SERIAL PRIMARY KEY,
    session_id INTEGER NOT NULL REFERENCES sessions(id),
    frame_data BYTEA,
    timestamp TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    processing_ms INTEGER,
    ocr_result_id INTEGER REFERENCES ocr_results(id),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_webcam_frames_session_id ON webcam_frames(session_id);
CREATE INDEX idx_webcam_frames_timestamp ON webcam_frames(timestamp);
CREATE INDEX idx_webcam_frames_ocr_result_id ON webcam_frames(ocr_result_id);
```

### 9. operations_log
Comprehensive operations audit log (enhanced from original).

```sql
CREATE TABLE operations_log (
    id SERIAL PRIMARY KEY,
    batch_id VARCHAR(50),
    device_id VARCHAR(50) REFERENCES devices(device_id),
    weight_g DECIMAL(10,2),
    grade VARCHAR(20),
    ocr_text TEXT,
    ocr_confidence DECIMAL(5,4),
    audit_status VARCHAR(20) DEFAULT 'pending' CHECK (audit_status IN ('pending', 'verified', 'flagged', 'rejected')),
    user_id VARCHAR(50),
    timestamp TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    metadata JSONB,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_operations_log_batch_id ON operations_log(batch_id);
CREATE INDEX idx_operations_log_device_id ON operations_log(device_id);
CREATE INDEX idx_operations_log_timestamp ON operations_log(timestamp);
CREATE INDEX idx_operations_log_audit_status ON operations_log(audit_status);
```

### 10. export_history
Export and report generation history (enhanced from original).

```sql
CREATE TABLE export_history (
    id SERIAL PRIMARY KEY,
    export_type VARCHAR(20) NOT NULL CHECK (export_type IN ('weights', 'connections', 'ocr_results', 'pipeline_metrics', 'audit_report')),
    file_name VARCHAR(255) NOT NULL,
    file_path TEXT,
    format VARCHAR(10) NOT NULL CHECK (format IN ('csv', 'pdf', 'json')),
    generated_by VARCHAR(50) NOT NULL,
    date_range_start TIMESTAMP,
    date_range_end TIMESTAMP,
    record_count INTEGER,
    file_size_bytes BIGINT,
    status VARCHAR(20) DEFAULT 'completed' CHECK (status IN ('pending', 'completed', 'failed')),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_export_history_export_type ON export_history(export_type);
CREATE INDEX idx_export_history_created_at ON export_history(created_at);
CREATE INDEX idx_export_history_generated_by ON export_history(generated_by);
```

## Views for Common Queries

### Active Devices View
```sql
CREATE VIEW active_devices AS
SELECT 
    d.device_id,
    d.label,
    d.type,
    d.location,
    d.status,
    d.last_seen,
    COUNT(DISTINCT wr.id) as total_readings,
    COUNT(DISTINCT CASE WHEN wr.timestamp > NOW() - INTERVAL '1 hour' THEN wr.id END) as recent_readings
FROM devices d
LEFT JOIN weight_readings wr ON d.device_id = wr.device_id
WHERE d.status = 'online'
GROUP BY d.id;
```

### Session Performance View
```sql
CREATE VIEW session_performance AS
SELECT 
    s.session_id,
    s.device_id,
    s.start_time,
    s.end_time,
    s.status,
    COUNT(DISTINCT or.id) as total_ocr_results,
    AVG(or.confidence) as avg_confidence,
    AVG(or.processing_time_ms) as avg_processing_time,
    COUNT(DISTINCT CASE WHEN or.is_duplicate = true THEN or.id END) as duplicate_count,
    SUM(CASE WHEN or.verification_status = 'verified' THEN 1 ELSE 0 END) as verified_count
FROM sessions s
LEFT JOIN ocr_results or ON s.id = or.session_id
GROUP BY s.id;
```

### Pipeline Health View
```sql
CREATE VIEW pipeline_health AS
SELECT 
    s.session_id,
    s.device_id,
    s.status as session_status,
    AVG(pm.metric_value) FILTER (WHERE pm.metric_type = 'fps') as avg_fps,
    AVG(pm.metric_value) FILTER (WHERE pm.metric_type = 'cpu_usage') as avg_cpu_usage,
    AVG(pm.metric_value) FILTER (WHERE pm.metric_type = 'memory_usage') as avg_memory_usage,
    MAX(pm.timestamp) as last_metric_time
FROM sessions s
LEFT JOIN pipeline_metrics pm ON s.id = pm.session_id
WHERE s.start_time > NOW() - INTERVAL '24 hours'
GROUP BY s.id;
```

## Stored Procedures

### Create New Session
```sql
CREATE OR REPLACE PROCEDURE create_session(
    p_device_id VARCHAR(50),
    p_config JSONB DEFAULT '{}'
)
LANGUAGE plpgsql
AS $$
DECLARE
    v_session_id UUID;
    v_device_exists INTEGER;
BEGIN
    -- Check if device exists
    SELECT COUNT(*) INTO v_device_exists FROM devices WHERE device_id = p_device_id;
    
    IF v_device_exists = 0 THEN
        RAISE EXCEPTION 'Device % does not exist', p_device_id;
    END IF;
    
    -- Create session
    INSERT INTO sessions (device_id, config)
    VALUES (p_device_id, p_config)
    RETURNING session_id INTO v_session_id;
    
    -- Update device last_seen
    UPDATE devices SET last_seen = CURRENT_TIMESTAMP WHERE device_id = p_device_id;
    
    COMMIT;
END;
$$;
```

### Log Weight Reading
```sql
CREATE OR REPLACE PROCEDURE log_weight_reading(
    p_device_id VARCHAR(50),
    p_weight_g DECIMAL(10,2),
    p_grade VARCHAR(20),
    p_status JSONB DEFAULT '{"hx711_fault": false, "eth_or_wifi_issue": false}'
)
LANGUAGE plpgsql
AS $$
DECLARE
    v_active_session_id INTEGER;
BEGIN
    -- Get active session for device
    SELECT id INTO v_active_session_id 
    FROM sessions 
    WHERE device_id = p_device_id AND status = 'active'
    ORDER BY start_time DESC 
    LIMIT 1;
    
    -- Insert weight reading
    INSERT INTO weight_readings (device_id, session_id, weight_g, grade, status)
    VALUES (p_device_id, v_active_session_id, p_weight_g, p_grade, p_status);
    
    -- Update device last_seen
    UPDATE devices SET last_seen = CURRENT_TIMESTAMP WHERE device_id = p_device_id;
    
    COMMIT;
END;
$$;
```

### Log OCR Result
```sql
CREATE OR REPLACE PROCEDURE log_ocr_result(
    p_session_id INTEGER,
    p_text TEXT,
    p_confidence DECIMAL(5,4),
    p_bbox_data JSONB DEFAULT NULL,
    p_processing_time_ms INTEGER DEFAULT NULL,
    p_frame_number INTEGER DEFAULT NULL
)
LANGUAGE plpgsql
AS $$
DECLARE
    v_is_duplicate BOOLEAN := false;
    v_similarity_score DECIMAL(5,4) := 0.0;
BEGIN
    -- Check for duplicates using similarity threshold from session config
    SELECT 
        EXISTS(
            SELECT 1 FROM ocr_results 
            WHERE session_id = p_session_id 
            AND text % p_text  -- pg_trgm similarity
            AND confidence >= p_confidence * 0.9
            AND created_at > NOW() - INTERVAL '10 seconds'
        ) INTO v_is_duplicate;
    
    -- Insert OCR result
    INSERT INTO ocr_results (
        session_id, text, confidence, bbox_data, 
        processing_time_ms, frame_number, is_duplicate
    )
    VALUES (
        p_session_id, p_text, p_confidence, p_bbox_data,
        p_processing_time_ms, p_frame_number, v_is_duplicate
    );
    
    -- If duplicate, log to dedup history
    IF v_is_duplicate THEN
        INSERT INTO dedup_history (ocr_result_id, similarity, strategy)
        VALUES (
            (SELECT currval('ocr_results_id_seq')),
            (SELECT similarity FROM ocr_results WHERE id = (SELECT currval('ocr_results_id_seq'))),
            'fuzzy'
        );
    END IF;
    
    COMMIT;
END;
$$;
```

## Triggers

### Update Timestamp Trigger
```sql
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply to tables with updated_at
CREATE TRIGGER update_devices_updated_at BEFORE UPDATE ON devices
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_sessions_updated_at BEFORE UPDATE ON sessions
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
```

### Device Status Change Trigger
```sql
CREATE OR REPLACE FUNCTION log_device_status_change()
RETURNS TRIGGER AS $$
BEGIN
    IF OLD.status IS DISTINCT FROM NEW.status THEN
        INSERT INTO connection_logs (device_id, event_type, status, metadata)
        VALUES (
            NEW.device_id, 
            CASE 
                WHEN NEW.status = 'online' THEN 'connect'
                WHEN NEW.status = 'offline' THEN 'disconnect'
                WHEN NEW.status = 'error' THEN 'error'
                ELSE 'reconnect'
            END,
            NEW.status,
            jsonb_build_object('previous_status', OLD.status)
        );
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER log_device_status_changes BEFORE UPDATE ON devices
    FOR EACH ROW EXECUTE FUNCTION log_device_status_change();
```

## Indexes for Performance

### Composite Indexes for Common Queries
```sql
-- Weight readings with device and time range
CREATE INDEX idx_weight_readings_device_time ON weight_readings(device_id, timestamp DESC);

-- OCR results with session and confidence
CREATE INDEX idx_ocr_results_session_confidence ON ocr_results(session_id, confidence DESC);

-- Operations log with device and audit status
CREATE INDEX idx_operations_log_device_audit ON operations_log(device_id, audit_status);

-- Pipeline metrics with session and type
CREATE INDEX idx_pipeline_metrics_session_type ON pipeline_metrics(session_id, metric_type);
```

### Full-Text Search for OCR Results
```sql
CREATE INDEX idx_ocr_results_text_fts ON ocr_results USING gin(to_tsvector('english', text));
```

## Partitioning Strategy (for large datasets)

### Partition weight_readings by month
```sql
CREATE TABLE weight_readings (
    id SERIAL,
    device_id VARCHAR(50) NOT NULL,
    session_id INTEGER,
    weight_g DECIMAL(10,2) NOT NULL,
    grade VARCHAR(20) NOT NULL,
    status JSONB NOT NULL DEFAULT '{}',
    timestamp TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) PARTITION BY RANGE (timestamp);

-- Create monthly partitions
CREATE TABLE weight_readings_2024_01 PARTITION OF weight_readings
    FOR VALUES FROM ('2024-01-01') TO ('2024-02-01');

CREATE TABLE weight_readings_2024_02 PARTITION OF weight_readings
    FOR VALUES FROM ('2024-02-01') TO ('2024-03-01');
```

## Data Retention Policy

### Automatic cleanup of old data
```sql
CREATE OR REPLACE FUNCTION cleanup_old_data()
RETURNS void AS $$
BEGIN
    -- Delete OCR results older than 90 days (except verified ones)
    DELETE FROM ocr_results 
    WHERE created_at < NOW() - INTERVAL '90 days' 
    AND verification_status != 'verified';
    
    -- Delete pipeline metrics older than 30 days
    DELETE FROM pipeline_metrics 
    WHERE created_at < NOW() - INTERVAL '30 days';
    
    -- Delete webcam frames older than 7 days (large storage)
    DELETE FROM webcam_frames 
    WHERE created_at < NOW() - INTERVAL '7 days';
    
    -- Archive weight readings older than 1 year to separate table
    -- (implementation depends on archiving strategy)
END;
$$ LANGUAGE plpgsql;

-- Schedule to run daily
-- This would be set up via pg_cron or external scheduler
```

## Security Considerations

### Row-Level Security
```sql
-- Enable RLS on sensitive tables
ALTER TABLE ocr_results ENABLE ROW LEVEL SECURITY;
ALTER TABLE operations_log ENABLE ROW LEVEL SECURITY;

-- Policy: Users can only see results from their sessions
CREATE POLICY user_session_access ON ocr_results
    FOR SELECT USING (
        session_id IN (
            SELECT id FROM sessions WHERE generated_by = current_user
        )
    );
```

### Database Roles
```sql
-- Application user with limited permissions
CREATE USER pineapple_app WITH PASSWORD 'secure_password';

GRANT CONNECT ON DATABASE ocr_pipeline TO pineapple_app;
GRANT USAGE ON SCHEMA public TO pineapple_app;
GRANT SELECT, INSERT, UPDATE ON ALL TABLES IN SCHEMA public TO pineapple_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO pineapple_app;
```

## Migration Strategy

### From SQLite to PostgreSQL
1. Export existing SQLite data to CSV format
2. Transform data to match new schema structure
3. Import into PostgreSQL using COPY commands
4. Validate data integrity
5. Update application connection strings
6. Deploy new backend with PostgreSQL support
7. Run parallel operations during transition period
8. Decommission SQLite after validation period

## Backup and Recovery

### Backup Strategy
```bash
# Full database backup
pg_dump -U postgres -d ocr_pipeline -F c -f backup_$(date +%Y%m%d).dump

# Schema-only backup
pg_dump -U postgres -d ocr_pipeline --schema-only -f schema_backup.sql

# Specific tables backup
pg_dump -U postgres -d ocr_pipeline -t weight_readings -t ocr_results -f critical_data.dump
```

### Recovery Strategy
```bash
# Restore from backup
pg_restore -U postgres -d ocr_pipeline backup_20240101.dump

# Point-in-time recovery (if WAL archiving is enabled)
# Configure recovery.conf or postgresql.conf for PITR
```

## Monitoring and Maintenance

### Database Size Monitoring
```sql
SELECT 
    schemaname,
    tablename,
    pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) AS size
FROM pg_tables
WHERE schemaname = 'public'
ORDER BY pg_total_relation_size(schemaname||'.'||tablename) DESC;
```

### Query Performance Monitoring
```sql
-- Enable query statistics tracking
ALTER SYSTEM SET track_queries = 'all';
-- Reload configuration
SELECT pg_reload_conf();

-- View slow queries
SELECT query, calls, total_time, mean_time
FROM pg_stat_statements
ORDER BY mean_time DESC
LIMIT 10;
```

### Index Usage Analysis
```sql
SELECT 
    schemaname,
    tablename,
    indexname,
    idx_scan as index_scans,
    idx_tup_read as tuples_read,
    idx_tup_fetch as tuples_fetched
FROM pg_stat_user_indexes
ORDER BY idx_scan DESC;
```

This master database schema provides a comprehensive foundation for the enhanced Pineapple Hub system, supporting both the original scale monitoring functionality and the new OCR pipeline features while maintaining data integrity, performance, and security.
