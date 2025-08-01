const { jsonDataService } = require('../services/JSONDataService');

class JSONComplexController {
  
  // 헬스체크
  async healthCheck(req, res) {
    try {
      const stats = jsonDataService.getStatistics();
      res.json({
        success: true,
        message: 'JSON API service is running - 46,807개 통합 단지 데이터',
        timestamp: new Date().toISOString(),
        data_status: {
          total_complexes: stats.total_complexes,
          naver_complexes_loaded: stats.naver_complexes > 0,
          molit_transactions_loaded: stats.molit_transactions > 0,
          naver_count: stats.naver_complexes,
          molit_count: stats.molit_transactions,
          performance: stats.performance
        }
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: 'Health check failed',
        error: error.message
      });
    }
  }

  // 통계 정보
  async getStatistics(req, res) {
    try {
      const stats = jsonDataService.getStatistics();
      res.json({
        success: true,
        message: '46,807개 통합 단지 데이터 통계',
        data: stats
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }

  // 경계 검색 (지도 영역 내 단지 검색)
  async searchByBounds(req, res) {
    try {
      const { north, south, east, west, limit = 100 } = req.query;
      
      if (!north || !south || !east || !west) {
        return res.status(400).json({
          success: false,
          message: '경계 정보가 필요합니다 (north, south, east, west)'
        });
      }

      const bounds = {
        north: parseFloat(north),
        south: parseFloat(south),
        east: parseFloat(east),
        west: parseFloat(west)
      };

      const result = await jsonDataService.searchByBounds(bounds, parseInt(limit));
      
      res.json({
        ...result,
        message: `지도 영역 내 ${result.count}개 단지 검색 완료`
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }

  // 반경 검색 (중심점 기준 거리별 검색)
  async searchByRadius(req, res) {
    try {
      const { lat, lng, radius, limit = 100 } = req.query;
      
      if (!lat || !lng || !radius) {
        return res.status(400).json({
          success: false,
          message: '중심점과 반경 정보가 필요합니다 (lat, lng, radius)'
        });
      }

      const center = {
        lat: parseFloat(lat),
        lng: parseFloat(lng)
      };

      const result = await jsonDataService.searchByRadius(center, parseInt(radius), parseInt(limit));
      
      res.json({
        ...result,
        message: `반경 ${radius}m 내 ${result.count}개 단지 검색 완료`
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }

  // 단지 상세 정보
  async getComplexDetail(req, res) {
    try {
      const { id } = req.params;
      
      if (!id) {
        return res.status(400).json({
          success: false,
          message: '단지 ID가 필요합니다'
        });
      }

      const result = await jsonDataService.getComplexDetail(id);
      
      if (result.success) {
        res.json({
          ...result,
          message: `단지 ID ${id} 상세 정보 조회 완료`
        });
      } else {
        res.status(404).json(result);
      }
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }

  // 전체 단지 목록 (페이지네이션)
  async getAllComplexes(req, res) {
    try {
      const { page = 1, limit = 50, search } = req.query;
      
      await jsonDataService.loadData();
      
      let complexes = jsonDataService.naverComplexes;
      
      // 검색 필터
      if (search) {
        complexes = complexes.filter(complex => 
          complex.complex_name && complex.complex_name.includes(search)
        );
      }
      
      // 페이지네이션
      const offset = (parseInt(page) - 1) * parseInt(limit);
      const paginatedComplexes = complexes.slice(offset, offset + parseInt(limit));
      
      res.json({
        success: true,
        message: `46,807개 통합 단지 중 ${paginatedComplexes.length}개 조회`,
        data: paginatedComplexes,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total: complexes.length,
          total_pages: Math.ceil(complexes.length / parseInt(limit))
        }
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }
}

module.exports = new JSONComplexController();