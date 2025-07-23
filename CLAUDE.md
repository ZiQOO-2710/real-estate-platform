# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Architecture Overview

This is a real estate platform built with a multi-module architecture consisting of:

1. **Data Collection Layer** (`modules/naver-crawler/`): Python-based web scraping system using Playwright
2. **API Layer** (`api/`): Node.js/Express REST API server  
3. **Frontend Layer** (`dashboard/`): React/Vite-based web dashboard
4. **Database**: Multiple SQLite databases with unified integration system

The system processes real estate data from web scraping, stores it across multiple databases, and provides unified APIs for frontend consumption. The core data flow is: Web Scraping → SQLite → REST API → React Dashboard.

## Database Architecture

- **Primary Databases**: Multiple SQLite databases with specific purposes
  - `modules/naver-crawler/data/naver_real_estate.db`: Main apartment complex and listing data (1,440 complexes)
  - `api/data/master_integrated_real_estate.db`: Unified master database
  - `molit_complete_data.db`: 977,388 MOLIT transaction records with coordinate mapping
- **API Database Connection**: Located in `api/src/config/database.js` with multi-database support
- **Unified Integration**: `DataIntegrationService.js` handles multi-database coordination with intelligent matching
- **High-Performance APIs**: Specialized MOLIT routes achieving 7-17ms response times

## Key Components

### Data Crawler (`modules/naver-crawler/`)
- **Enhanced Crawler**: `core/enhanced_naver_crawler.py` - Main stealth-mode crawler with anti-detection
- **Duplicate Detection**: `core/duplicate_detector.py` - Intelligent deduplication system (80-90% removal rate)
- **Full Scale Processing**: `core/full_scale_crawler.py` - Batch processing for large-scale data collection
- **Output**: JSON files stored in `data/output/` with pattern `enhanced_complex_{id}_{timestamp}.json`

### API Server (`api/`)
- Express.js server with rate limiting, CORS, compression
- **Multi-Database Routes**: 
  - `/api/naver/*` - Naver crawled data (1,440 complexes)
  - `/api/molit/*` - MOLIT transaction data (977k records)
  - `/api/molit-ultra-fast/*` - Optimized MOLIT coordinate data (7-17ms responses)
  - `/api/integrated/*` - Unified database queries
- **Database Integration**: Custom SQLite connection manager in `Database` class
- **Korean Text Search**: FTS5 virtual tables with URL encoding support

### Frontend Dashboard (`dashboard/`)
- React 18 with Material-UI components and Vite build system
- **Key Features**: Complex/listing search, Kakao Maps visualization, region tree selection
- **Multi-Database Support**: Dynamic switching between Naver, MOLIT, and integrated data sources
- **API Integration**: React Query for data fetching with extended timeouts for large datasets
- **State Management**: React hooks and context

## Common Development Commands

### Full Development Environment
```bash
# Root level commands (from package.json)
npm run dev                    # Start both API and dashboard concurrently
npm run dev:api               # Start API server only (port 4000)
npm run dev:dashboard         # Start dashboard only (port 3000) 
npm run install:all           # Install dependencies for all modules
npm run build                 # Build all components
npm run test                  # Run all tests
npm run lint                  # Lint all code
```

### API Server (`api/`)
```bash
cd api
npm start              # Start production server
npm run dev           # Start development server with nodemon
npm run lint          # Run ESLint
npm test              # Run Jest tests
```

### Dashboard Frontend (`dashboard/`)
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

## Multi-Database System

The platform integrates multiple data sources with intelligent coordination:
- **Naver Data**: 1,440 apartment complexes with detailed listing information
- **MOLIT Data**: 977,388 real estate transaction records with precise coordinate mapping
- **Integration Layer**: `DataIntegrationService.js` provides automated coordinate matching and data unification using multi-stage matching (coordinates → addresses → name similarity)
- **Performance Optimization**: Ultra-fast APIs with specialized indexes and caching

## Data Integration Architecture

The `DataIntegrationService.js` implements sophisticated data unification:
- **Multi-stage Matching**: Coordinates (1.0 confidence) → Jibun Address (0.9) → Road Address (0.85) → Name Similarity (0.8+)
- **Coordinate Validation**: Korean geography bounds (33-39°N, 124-132°E) with 11m threshold
- **String Similarity**: Jaro-Winkler algorithm for complex name matching
- **Data Quality Gates**: Automated validation for duplicates, orphaned records, and price anomalies

## Search Implementation

The platform implements comprehensive Korean text search:
- **URL Encoding**: Korean characters must be URL-encoded for API requests
- **Database Optimization**: FTS5 virtual tables and compound indexes for performance
- **Multi-field Search**: Searches across complex names, descriptions, and IDs
- **Region Tree**: Hierarchical region selection with nationwide coverage
- **Cross-Database Search**: Unified search across Naver and MOLIT datasets

## Map Integration

- **Kakao Maps API**: Integration with coordinate display and interaction
- **Multi-Source Markers**: Support for Naver, MOLIT, and integrated data sources with source-specific styling
- **Performance**: Viewport-based loading with 50 marker limit for optimal rendering
- **Coordinate Validation**: Strict validation for Korean geography bounds
- **Interactive Features**: Map markers with detailed info windows and complex selection

## Development Environment Requirements

- **Node.js**: >= 18.0.0
- **Python**: >= 3.11 for crawler modules
- **Browsers**: Chromium for Playwright (auto-installed)
- **Memory**: 8GB+ recommended for crawler operations and large dataset processing
- **Disk**: 2GB+ for data storage (multiple databases)

## Important Implementation Details

- **Korean Text Handling**: All Korean text in URLs must be properly encoded using encodeURIComponent
- **Database Connection**: Custom `Database` class in `api/src/config/database.js` handles multiple SQLite connections
- **Rate Limiting**: API has built-in rate limiting (100 requests per 15 minutes)
- **Stealth Crawling**: Crawler implements human-like behavior patterns to avoid detection
- **Error Recovery**: Built-in retry mechanisms and automatic backup systems
- **Performance**: MOLIT coordinate APIs achieve 7-17ms response times through optimized queries
- **Data Integration**: Automatic coordinate matching between Naver and MOLIT datasets with confidence scoring

## Testing and Quality

- **API Tests**: Jest with Supertest for API endpoint testing
- **Frontend Tests**: Vitest for React component testing
- **Linting**: ESLint configuration for both frontend and backend
- **Pre-commit Hooks**: Automated linting and formatting with Husky and lint-staged

## File Structure Patterns

- **Crawler Output**: `enhanced_complex_{complex_id}_{timestamp}.json`
- **Database Files**: Located in `modules/naver-crawler/data/` and `api/data/`
- **API Routes**: RESTful naming in `api/src/routes/` with specialized MOLIT performance routes
- **React Components**: PascalCase in `dashboard/src/components/` and `dashboard/src/pages/`

## Data Sources and Scale

Current data scale and performance:
- **Naver Complexes**: 1,440 apartment complexes with listing data
- **MOLIT Transactions**: 977,388 real estate transaction records with coordinate mapping
- **Integrated Database**: Unified coordinate and complex information with intelligent matching
- **Performance**: Sub-20ms API response times for coordinate data with specialized caching
- **Coverage**: Nationwide apartment complex data with regional filtering and hierarchical search