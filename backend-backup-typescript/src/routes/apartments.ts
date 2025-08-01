import { Router } from 'express';
import { ApartmentController } from '../controllers/apartmentController';
import { validateSearchParams } from '../middleware/validation';
import { rateLimit } from 'express-rate-limit';

const router: Router = Router();
const apartmentController = new ApartmentController();

// Rate limiting
const searchLimit = rateLimit({
  windowMs: 15 * 60 * 1000, // 15분
  max: 100, // 최대 100회 요청
  message: {
    success: false,
    error: '너무 많은 요청이 발생했습니다. 잠시 후 다시 시도해주세요.'
  }
});

// 아파트 검색
router.get('/search', searchLimit, validateSearchParams, apartmentController.searchApartments);

// 아파트 상세 정보
router.get('/:id', apartmentController.getApartmentById);

// 전체 통계
router.get('/stats/overall', apartmentController.getOverallStats);

// 지역 목록
router.get('/regions', apartmentController.getRegions);

// 지역별 통계
router.get('/stats/regions', apartmentController.getRegionStats);

// 재건축 후보 분석
router.get('/analysis/redevelopment', apartmentController.getRedevelopmentCandidates);

// 지도용 마커 데이터
router.get('/map/markers', searchLimit, apartmentController.getMapMarkers);

export default router;