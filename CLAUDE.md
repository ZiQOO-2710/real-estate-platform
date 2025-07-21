# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Architecture Overview

This is a real estate platform built with a multi-module architecture consisting of:

1. **Data Collection Layer** (`modules/naver-crawler/`): Python-based web scraping system using Playwright
2. **API Layer** (`api/`): Node.js/Express REST API server
3. **Frontend Layer** (`dashboard/`): React/Vite-based web dashboard
4. **Database**: SQLite databases for local development

The system processes real estate data from web scraping, stores it in SQLite databases, and provides APIs for frontend consumption. The core data flow is: Web Scraping ’ SQLite ’ REST API ’ React Dashboard.

## Database Architecture

- **Primary Database**: SQLite databases in `modules/naver-crawler/data/`
  - `naver_real_estate.db`: Main apartment complex and listing data
  - `apartment_data.db`: Additional apartment information
- **API Database Connection**: Located in `api/src/config/database.js`
- **Schema**: Auto-created tables for apartment complexes, current listings, and crawling metadata

## Key Components

### Data Crawler (`modules/naver-crawler/`)
- **Enhanced Crawler**: `core/enhanced_naver_crawler.py` - Main stealth-mode crawler with anti-detection
- **Duplicate Detection**: `core/duplicate_detector.py` - Intelligent deduplication system
- **Full Scale Processing**: `core/full_scale_crawler.py` - Batch processing for large-scale data collection
- **Output**: JSON files stored in `data/output/` with consistent naming pattern `enhanced_complex_{id}_{timestamp}.json`

### API Server (`api/`)
- Express.js server with rate limiting, CORS, compression
- **Routes**: `/api/complexes`, `/api/listings`, `/api/transactions`, `/api/stats`, `/api/search`
- **Database Integration**: Custom SQLite connection manager with optimization indexes
- **Korean Text Search**: Implemented with URL encoding and FTS5 virtual tables

### Frontend Dashboard (`dashboard/`)
- React 18 with Material-UI components
- **Key Features**: Complex/listing search, map visualization with Kakao Maps, region tree selection
- **API Integration**: React Query for data fetching
- **State Management**: React hooks and context

## Common Development Commands

### API Server
```bash
cd api
npm start              # Start production server
npm run dev           # Start development server with nodemon
npm run lint          # Run ESLint
npm test              # Run Jest tests
```

### Dashboard Frontend
```bash
cd dashboard
npm run dev           # Start development server (Vite)
npm run build         # Build for production
npm run preview       # Preview production build
npm run lint          # Run ESLint
npm test              # Run Vitest
```

### Data Crawler
```bash
cd modules/naver-crawler
pip install -r requirements.txt
playwright install chromium
# Run individual crawler
python -c "import asyncio; from core.enhanced_naver_crawler import crawl_enhanced_single; asyncio.run(crawl_enhanced_single('https://new.land.naver.com/complexes/2592'))"
```

### Full Development Environment
```bash
# Root level commands (from package.json)
npm run dev                    # Start both API and dashboard concurrently
npm run install:all           # Install dependencies for all modules
npm run build                 # Build all components
npm run test                  # Run all tests
npm run lint                  # Lint all code
```

## Search Implementation

The platform implements comprehensive Korean text search:
- **URL Encoding**: Korean characters must be URL-encoded for API requests
- **Database Optimization**: FTS5 virtual tables and indexes for performance
- **Multi-field Search**: Searches across complex names, descriptions, and IDs
- **Region Tree**: Hierarchical region selection with nationwide coverage

## Database Optimization

When working with search functionality:
- The database has optimization indexes for Korean text search
- Search queries use LIKE patterns with proper URL encoding
- FTS5 virtual tables are available for advanced text search
- Always restart the API server after database schema changes

## File Naming Conventions

- **Crawler Output**: `enhanced_complex_{complex_id}_{timestamp}.json`
- **Database Files**: Located in `modules/naver-crawler/data/`
- **API Routes**: RESTful naming in `api/src/routes/`
- **React Components**: PascalCase in `dashboard/src/components/` and `dashboard/src/pages/`

## Development Environment Requirements

- **Node.js**: >= 18.0.0
- **Python**: >= 3.11 for crawler modules
- **Browsers**: Chromium for Playwright (auto-installed)
- **Memory**: 8GB+ recommended for crawler operations
- **Disk**: 2GB+ for data storage

## Important Implementation Details

- **Korean Text Handling**: All Korean text in URLs must be properly encoded
- **Database Connection**: Custom SQLite manager handles multiple database connections
- **Rate Limiting**: API has built-in rate limiting (100 requests per 15 minutes)
- **Stealth Crawling**: Crawler implements human-like behavior patterns to avoid detection
- **Error Recovery**: Built-in retry mechanisms and automatic backup systems

## Testing and Quality

- **API Tests**: Jest with Supertest for API endpoint testing
- **Frontend Tests**: Vitest for React component testing
- **Linting**: ESLint configuration for both frontend and backend
- **Pre-commit Hooks**: Automated linting and formatting with Husky and lint-staged