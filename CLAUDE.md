# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Development Commands

### Environment Setup
```bash
# Install all dependencies for monorepo
npm run install:all

# Start development servers (frontend + backend)
npm run dev

# Start individual services
npm run dev:backend    # Backend only (port 4000)
npm run dev:frontend   # Frontend only (port 3000)
```

### Building and Testing
```bash
# Build entire platform
npm run build

# Type checking across all packages
npm run type-check

# Run all tests
npm test

# Run tests for specific packages
npm run test:backend
npm run test:frontend
```

### Code Quality
```bash
# Lint and format all code
npm run lint
npm run format

# Individual package linting
npm run lint:backend
npm run lint:frontend
```

### Data Crawling Operations
```bash
# Start crawling processes
npm run crawl:start

# Stop crawling processes  
npm run crawl:stop

# Manual crawling scripts (Python)
python start_crawler_safe.py          # Safe crawler with VPN support
python nationwide_dong_crawler.py     # Nationwide regional crawler
python ultimate_crawler.py            # Ultimate crawler with 100% save efficiency
```

### Database Operations
```bash
# Database management
npm run db:migrate     # Run migrations
npm run db:seed        # Seed with initial data
npm run db:reset       # Reset database
npm run backup:db      # Backup database
```

### Docker Operations
```bash
npm run docker:build  # Build containers
npm run docker:up     # Start containers
npm run docker:down   # Stop containers
```

## Architecture Overview

### High-Level System Architecture
This is a **real estate market analysis platform** consisting of multiple data collection and analysis systems:

1. **Web Platform** (React + Node.js): Interactive map-based dashboard for real estate developers
2. **Data Collection System** (Python): Multi-source crawling infrastructure for real estate data
3. **Database Layer** (SQLite + PostgreSQL): Handles both raw crawled data and processed analytics

### Key Data Flow
```
External APIs � Python Crawlers � Raw Databases � Processing � Web Platform � Analytics Dashboard
```

### Database Architecture
The system uses a **multi-database approach**:

**Local SQLite Databases:**
- `molit_complete_data.db`: Government real estate transaction data (977K+ records)
- `real_estate_crawling_backup.db`: Latest Naver real estate complex information (875 complexes)
- `real_estate_crawling_complete_20250725_111816.db`: Backup snapshot

**Supabase Cloud Databases:**
- **Project 1 (heatmxifhwxppprdzaqf)**: 
  - `apartment_complexes`: 1,139 complexes with detailed metadata
  - `apartment_transactions`: 70,500 transaction records
- **Project 2 (dbwcpgdpjeiezwgbijcj)**:
  - `apt_master_info`: 46,539 apartment complexes with government codes

**PostgreSQL**: Main application database for web platform

### Crawler System Architecture
The crawling system is designed for **large-scale, resilient data collection**:

- **VPN Integration**: Automatic IP rotation using NordVPN for anti-detection
- **Multi-Regional Crawling**: Supports nationwide data collection with regional partitioning
- **Database Management**: `UltimateDatabaseManager` provides 100% save efficiency with retry logic
- **Stealth Technology**: Enhanced browser fingerprinting protection

### Frontend Architecture (React + TypeScript)
- **State Management**: Redux Toolkit for global state
- **Mapping**: Leaflet.js/Kakao Maps for interactive visualizations
- **UI Framework**: Material-UI v5 with custom theming
- **Data Visualization**: Chart.js and Recharts for analytics

### Backend Architecture (Node.js + Express)
- **API Layer**: RESTful APIs with TypeScript
- **Database Integration**: SQLite3 for data persistence
- **Middleware Stack**: CORS, helmet, rate limiting, validation
- **Real-time Features**: WebSocket support for live data updates

## Critical Development Considerations

### Crawler Development
When working with the crawler modules:
- Always use `start_crawler_safe.py` for production crawling to ensure proper encoding and error handling
- The `nationwide_dong_crawler.py` supports incremental regional expansion (currently 875 complexes collected, last run: 2025-07-25)
- VPN functionality requires NordVPN configuration in `modules/naver-crawler/utils/vpn_manager.py`
- Database connections use pooling and retry mechanisms through `UltimateDatabaseManager`

### Critical Data Integration Issue
The platform currently has **data fragmentation across 5 sources** causing API connectivity issues:
- **Total Data**: 1,047,888+ transaction records, 48,553+ apartment complexes
- **Integration Required**: Address standardization and deduplication needed for unified API endpoints
- **Priority**: Resolve data consolidation before expanding crawling operations

### Data Processing Pipeline
The system follows a **staged data processing approach**:
1. Raw data collection into separate databases
2. Data validation and deduplication
3. Integration into unified analytics database
4. Real-time serving through web APIs

### Monorepo Structure
This is a **workspace-based monorepo** with:
- Root package.json handles orchestration
- Backend and frontend are independent npm workspaces
- Shared tooling configuration (ESLint, Prettier, TypeScript)
- Docker composition for full-stack deployment

### Performance and Scalability
- **Database Optimization**: WAL mode, connection pooling, transaction queuing
- **Crawler Rate Limiting**: Built-in delays and VPN rotation to prevent blocking
- **Frontend Performance**: Code splitting, lazy loading, memoization patterns
- **Caching Strategy**: Redis integration planned for API response caching

### Data Sources Integration
The platform integrates multiple Korean real estate data sources:
- **MOLIT (m�P��)**: Official transaction records
- **Naver Real Estate**: Property listings and complex information
- **Regional APIs**: Municipality-specific data sources

Each data source has dedicated crawler modules with specific anti-detection strategies and data parsing logic.

## Environment Configuration

### Required Environment Variables
- `NODE_ENV`: development/production
- `DATABASE_URL`: PostgreSQL connection string
- `REDIS_URL`: Redis connection string (for caching)
- `NAVER_API_KEY`: Naver Maps API key
- `KAKAO_API_KEY`: Kakao Maps API key
- `SUPABASE_URL`: Supabase project URL
- `SUPABASE_ANON_KEY`: Supabase anonymous key

### Development Dependencies
- Node.js 18+ and npm 8+
- Python 3.8+ for crawler modules
- PostgreSQL 14+ with PostGIS extension
- Redis 7.0 for caching layer
- Docker and Docker Compose for containerization

## Deployment and Operations

### Staging Deployment
```bash
npm run deploy:staging
```

### Production Deployment
```bash
npm run deploy:production
```

The platform is designed for containerized deployment with separate services for web application and crawler infrastructure.