import { Router } from 'express';
import apartmentRoutes from './apartments';

const router: Router = Router();

// API 라우트 등록
router.use('/apartments', apartmentRoutes);

// API 상태 확인
router.get('/health', (req, res) => {
  res.json({
    success: true,
    message: 'API 서버가 정상적으로 동작 중입니다.',
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
  });
});

export default router;