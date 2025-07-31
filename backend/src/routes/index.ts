import { Router } from 'express';
import apartmentRoutes from './apartments';
import jsonApiRoutes from './json-api';

const router: Router = Router();

// JSON 기반 API 라우트 (PostgreSQL 대안)
router.use('/json-api', jsonApiRoutes);

// 레거시 API 라우트 (SQLite 기반)
router.use('/apartments', apartmentRoutes);

// API 상태 확인
router.get('/health', (req, res) => {
  res.json({
    success: true,
    message: 'API 서버가 정상적으로 동작 중입니다.',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    routes: [
      '/api/v1/json-api - JSON 기반 부동산 API (PostgreSQL 대안)',
      '/api/v1/apartments - 레거시 SQLite API'
    ]
  });
});

export default router;