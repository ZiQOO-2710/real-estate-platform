import { Router } from 'express';
import { jsonComplexController } from '../controllers/JSONComplexController';

const router = Router();

// 헬스체크
router.get('/health', jsonComplexController.healthCheck.bind(jsonComplexController));

// 통계 정보
router.get('/statistics', jsonComplexController.getStatistics.bind(jsonComplexController));

// 검색 API
router.get('/search/bounds', jsonComplexController.searchByBounds.bind(jsonComplexController));
router.get('/search/radius', jsonComplexController.searchByRadius.bind(jsonComplexController));

// 단지 상세 정보
router.get('/complex/:id', jsonComplexController.getComplexById.bind(jsonComplexController));

export default router;