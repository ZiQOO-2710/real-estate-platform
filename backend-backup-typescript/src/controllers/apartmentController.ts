import { Request, Response } from 'express';
import { ApartmentService } from '../services/apartmentService';
import { ApartmentSearchParams } from '../types/apartment';

export class ApartmentController {
  private apartmentService: ApartmentService;

  constructor() {
    this.apartmentService = new ApartmentService();
  }

  // 아파트 검색
  searchApartments = async (req: Request, res: Response) => {
    try {
      const searchParams: ApartmentSearchParams = {
        city: req.query.city as string,
        gu: req.query.gu as string,
        minPrice: req.query.minPrice ? Number(req.query.minPrice) : undefined,
        maxPrice: req.query.maxPrice ? Number(req.query.maxPrice) : undefined,
        minYear: req.query.minYear ? Number(req.query.minYear) : undefined,
        maxYear: req.query.maxYear ? Number(req.query.maxYear) : undefined,
        minUnits: req.query.minUnits ? Number(req.query.minUnits) : undefined,
        maxUnits: req.query.maxUnits ? Number(req.query.maxUnits) : undefined,
        page: req.query.page ? Number(req.query.page) : 1,
        limit: req.query.limit ? Number(req.query.limit) : 20,
        sortBy: req.query.sortBy as 'price' | 'year' | 'units' | 'name',
        sortOrder: req.query.sortOrder as 'asc' | 'desc'
      };

      const result = await this.apartmentService.searchApartments(searchParams);
      
      res.json({
        success: true,
        data: result.data,
        pagination: result.pagination
      });
    } catch (error) {
      console.error('아파트 검색 오류:', error);
      res.status(500).json({
        success: false,
        error: '아파트 검색 중 오류가 발생했습니다.'
      });
    }
  };

  // 아파트 상세 정보 조회
  getApartmentById = async (req: Request, res: Response) => {
    try {
      const id = Number(req.params.id);
      
      if (isNaN(id)) {
        return res.status(400).json({
          success: false,
          error: '유효하지 않은 아파트 ID입니다.'
        });
      }

      const apartment = await this.apartmentService.getApartmentById(id);
      
      if (!apartment) {
        return res.status(404).json({
          success: false,
          error: '아파트를 찾을 수 없습니다.'
        });
      }

      return res.json({
        success: true,
        data: apartment
      });
    } catch (error) {
      console.error('아파트 상세 조회 오류:', error);
      return res.status(500).json({
        success: false,
        error: '아파트 상세 정보 조회 중 오류가 발생했습니다.'
      });
    }
  };

  // 전체 통계 조회
  getOverallStats = async (req: Request, res: Response) => {
    try {
      const stats = await this.apartmentService.getOverallStats();
      
      res.json({
        success: true,
        data: stats
      });
    } catch (error) {
      console.error('전체 통계 조회 오류:', error);
      res.status(500).json({
        success: false,
        error: '전체 통계 조회 중 오류가 발생했습니다.'
      });
    }
  };

  // 지역 목록 조회
  getRegions = async (req: Request, res: Response) => {
    try {
      const regions = await this.apartmentService.getRegions();
      
      res.json({
        success: true,
        data: regions
      });
    } catch (error) {
      console.error('지역 목록 조회 오류:', error);
      res.status(500).json({
        success: false,
        error: '지역 목록 조회 중 오류가 발생했습니다.'
      });
    }
  };

  // 지역별 통계 조회
  getRegionStats = async (req: Request, res: Response) => {
    try {
      const city = req.query.city as string;
      const gu = req.query.gu as string;
      
      const stats = await this.apartmentService.getRegionStats(city, gu);
      
      res.json({
        success: true,
        data: stats
      });
    } catch (error) {
      console.error('지역별 통계 조회 오류:', error);
      res.status(500).json({
        success: false,
        error: '지역별 통계 조회 중 오류가 발생했습니다.'
      });
    }
  };

  // 재건축 후보 분석
  getRedevelopmentCandidates = async (req: Request, res: Response) => {
    try {
      const minAge = req.query.minAge ? Number(req.query.minAge) : 30;
      const maxPriceRatio = req.query.maxPriceRatio ? Number(req.query.maxPriceRatio) : 0.7;
      
      const candidates = await this.apartmentService.getRedevelopmentCandidates(minAge, maxPriceRatio);
      
      res.json({
        success: true,
        data: candidates
      });
    } catch (error) {
      console.error('재건축 후보 분석 오류:', error);
      res.status(500).json({
        success: false,
        error: '재건축 후보 분석 중 오류가 발생했습니다.'
      });
    }
  };

  // 지도용 마커 데이터 조회
  getMapMarkers = async (req: Request, res: Response) => {
    try {
      const searchParams: ApartmentSearchParams = {
        city: req.query.city as string,
        gu: req.query.gu as string,
        minPrice: req.query.minPrice ? Number(req.query.minPrice) : undefined,
        maxPrice: req.query.maxPrice ? Number(req.query.maxPrice) : undefined,
        minYear: req.query.minYear ? Number(req.query.minYear) : undefined,
        maxYear: req.query.maxYear ? Number(req.query.maxYear) : undefined,
        limit: 500, // 지도용으로 많은 데이터 필요
        page: 1
      };

      const result = await this.apartmentService.searchApartments(searchParams);
      
      // 지도용 데이터만 선별
      const markerData = result.data.map(apt => ({
        id: apt.id,
        name: apt.complex_name,
        city: apt.city,
        gu: apt.gu,
        latitude: apt.latitude,
        longitude: apt.longitude,
        price: apt.last_transaction_price,
        construction_year: apt.construction_year,
        total_units: apt.total_units,
        address: `${apt.city} ${apt.gu}`
      }));

      res.json({
        success: true,
        data: markerData,
        total: result.pagination.total
      });
    } catch (error) {
      console.error('지도 마커 데이터 조회 오류:', error);
      res.status(500).json({
        success: false,
        error: '지도 마커 데이터 조회 중 오류가 발생했습니다.'
      });
    }
  };
}