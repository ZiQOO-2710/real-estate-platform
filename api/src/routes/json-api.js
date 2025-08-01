const express = require('express');
const router = express.Router();
const jsonComplexController = require('../controllers/JSONComplexController');

// 🚀 46,807개 통합 단지 데이터 JSON API 라우트

// 헬스체크
router.get('/health', jsonComplexController.healthCheck);

// 통계 정보
router.get('/stats', jsonComplexController.getStatistics);

// 경계 검색 (지도 영역 내 단지 검색)
// GET /api/json-api/search/bounds?north=37.6&south=37.4&east=127.1&west=126.9&limit=100
router.get('/search/bounds', jsonComplexController.searchByBounds);

// 반경 검색 (중심점 기준 거리별 검색)
// GET /api/json-api/search/radius?lat=37.5665&lng=126.9780&radius=1000&limit=100
router.get('/search/radius', jsonComplexController.searchByRadius);

// 단지 상세 정보
// GET /api/json-api/complex/123
router.get('/complex/:id', jsonComplexController.getComplexDetail);

// 전체 단지 목록 (페이지네이션)
// GET /api/json-api/complexes?page=1&limit=50&search=강남
router.get('/complexes', jsonComplexController.getAllComplexes);

// API 정보
router.get('/', (req, res) => {
  res.json({
    success: true,
    message: '🏢 46,807개 통합 단지 데이터 JSON API',
    version: '1.0.0',
    description: '네이버(875) + MOLIT(17,197) + Supabase(47,678) 통합 데이터',
    performance: '35,581 complexes/second',
    endpoints: {
      health: 'GET /api/json-api/health',
      stats: 'GET /api/json-api/stats',
      search_bounds: 'GET /api/json-api/search/bounds?north=37.6&south=37.4&east=127.1&west=126.9',
      search_radius: 'GET /api/json-api/search/radius?lat=37.5665&lng=126.9780&radius=1000',
      complex_detail: 'GET /api/json-api/complex/:id',
      all_complexes: 'GET /api/json-api/complexes?page=1&limit=50'
    },
    data_sources: [
      'naver_real_estate.db (875개 단지)',
      'molit_complete_data.db (17,197개 단지)',
      'supabase_project1 (1,139개 단지)',
      'supabase_project2 (46,539개 단지)'
    ],
    generated_with: 'Claude Code'
  });
});

module.exports = router;