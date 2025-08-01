import { Request, Response, NextFunction } from 'express';
import { query, validationResult } from 'express-validator';

// 검색 파라미터 유효성 검사
export const validateSearchParams = [
  query('city').optional().isString().trim().isLength({ min: 1, max: 50 }),
  query('gu').optional().isString().trim().isLength({ min: 1, max: 50 }),
  query('minPrice').optional().isInt({ min: 0, max: 1000 }),
  query('maxPrice').optional().isInt({ min: 0, max: 1000 }),
  query('minYear').optional().isInt({ min: 1950, max: 2030 }),
  query('maxYear').optional().isInt({ min: 1950, max: 2030 }),
  query('minUnits').optional().isInt({ min: 1, max: 10000 }),
  query('maxUnits').optional().isInt({ min: 1, max: 10000 }),
  query('page').optional().isInt({ min: 1, max: 1000 }),
  query('limit').optional().isInt({ min: 1, max: 100 }),
  query('sortBy').optional().isIn(['price', 'year', 'units', 'name']),
  query('sortOrder').optional().isIn(['asc', 'desc']),
  
  (req: Request, res: Response, next: NextFunction) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        error: '유효하지 않은 검색 파라미터입니다.',
        details: errors.array()
      });
    }
    return next();
  }
];

// 아파트 ID 유효성 검사
export const validateApartmentId = [
  query('id').isInt({ min: 1 }),
  
  (req: Request, res: Response, next: NextFunction) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        error: '유효하지 않은 아파트 ID입니다.',
        details: errors.array()
      });
    }
    return next();
  }
];

// 재건축 분석 파라미터 유효성 검사
export const validateRedevelopmentParams = [
  query('minAge').optional().isInt({ min: 10, max: 100 }),
  query('maxPriceRatio').optional().isFloat({ min: 0.1, max: 2.0 }),
  
  (req: Request, res: Response, next: NextFunction) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        error: '유효하지 않은 재건축 분석 파라미터입니다.',
        details: errors.array()
      });
    }
    return next();
  }
];