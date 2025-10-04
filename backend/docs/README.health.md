Health Router

Base
- Service base (dev): http://localhost:8000

Endpoints
1) GET /health
   - Returns overall service health and database status.
   - Response 200
     {
       "status": "healthy" | "degraded",
       "timestamp": "2025-10-04T19:34:12.123Z",
       "uptime_seconds": 1234.56,
       "database": {
         "status": "healthy" | "error" | "unknown",
         "connection": true | false,
         "latency_ms": 5,
         "version": "PostgreSQL 15.5 on ..."
       }
     }

2) GET /health/db
   - Database-only health probe.
   - Response 200
     {
       "status": "healthy" | "error",
       "connection": true | false,
       "latency_ms": 4,
       "version": "PostgreSQL 15.5 on ..."
     }

3) GET /ip
   - Attempts to fetch the container/host outbound public IP.
   - Response 200
     { "ip": "203.0.113.10" }
   - Response 200 (failure to fetch)
     { "error": "Unable to fetch IP" }

Notes
- /health and /health/db execute a simple `SELECT 1, version()` to validate connectivity and include DB version and latency.
- No authentication required by default.

