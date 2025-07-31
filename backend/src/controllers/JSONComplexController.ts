import { Request, Response } from 'express';
import { jsonDataService } from '../services/JSONDataService';

export class JSONComplexController {
  
  // 헬스체크
  public async healthCheck(req: Request, res: Response): Promise<void> {
    try {
      const stats = jsonDataService.getStatistics();
      res.json({
        success: true,
        message: 'JSON API service is running',
        timestamp: new Date().toISOString(),
        data_status: {
          naver_complexes_loaded: stats.naver_complexes > 0,
          molit_transactions_loaded: stats.molit_transactions > 0,
          naver_count: stats.naver_complexes,
          molit_count: stats.molit_transactions
        }
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: 'Health check failed',
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  // 통계 정보
  public async getStatistics(req: Request, res: Response): Promise<void> {
    try {
      const stats = jsonDataService.getStatistics();
      res.json({
        success: true,
        data: stats
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: 'Failed to get statistics',
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  // 경계 검색
  public async searchByBounds(req: Request, res: Response): Promise<void> {
    try {
      const { minLat, maxLat, minLng, maxLng, limit } = req.query;
      
      const bounds = {
        minLat: parseFloat(minLat as string) || 0,
        maxLat: parseFloat(maxLat as string) || 90,
        minLng: parseFloat(minLng as string) || 0,
        maxLng: parseFloat(maxLng as string) || 180
      };
      
      const limitNum = parseInt(limit as string) || 100;
      const results = jsonDataService.searchComplexesByBounds(bounds, limitNum);
      
      res.json({
        success: true,
        count: results.length,
        data: results
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: 'Bounds search failed',
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  // 반경 검색
  public async searchByRadius(req: Request, res: Response): Promise<void> {
    try {
      const { centerLat, centerLng, radiusKm, limit } = req.query;
      
      const centerLatF = parseFloat(centerLat as string) || 37.5665;
      const centerLngF = parseFloat(centerLng as string) || 126.9780;
      const radiusKmF = parseFloat(radiusKm as string) || 10;
      const limitNum = parseInt(limit as string) || 100;
      
      const results = jsonDataService.searchComplexesByRadius(centerLatF, centerLngF, radiusKmF, limitNum);
      
      res.json({
        success: true,
        count: results.length,
        data: results
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: 'Radius search failed',
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  // 단지 상세 정보
  public async getComplexById(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const complex = jsonDataService.getComplexById(id);
      
      if (!complex) {
        res.status(404).json({
          success: false,
          message: 'Complex not found'
        });
        return;
      }
      
      res.json({
        success: true,
        data: complex
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: 'Failed to get complex details',
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }
}

export const jsonComplexController = new JSONComplexController();