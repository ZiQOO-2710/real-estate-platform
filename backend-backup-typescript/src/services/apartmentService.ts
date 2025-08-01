import { Database } from '../config/database';
import {
  ApartmentComplex,
  ApartmentSearchParams,
  ApartmentSearchResult,
  RegionStats,
  RedevelopmentCandidate
} from '../types/apartment';

export class ApartmentService {
  private db: Database;

  constructor() {
    this.db = Database.getInstance();
  }

  // 아파트 검색 (페이지네이션 포함)
  async searchApartments(params: ApartmentSearchParams): Promise<ApartmentSearchResult> {
    const {
      city,
      gu,
      minPrice,
      maxPrice,
      minYear,
      maxYear,
      minUnits,
      maxUnits,
      page = 1,
      limit = 20,
      sortBy = 'price',
      sortOrder = 'desc'
    } = params;

    // WHERE 조건 구성
    const conditions: string[] = [];
    const queryParams: any[] = [];

    if (city) {
      conditions.push('city = ?');
      queryParams.push(city);
    }

    if (gu) {
      conditions.push('gu = ?');
      queryParams.push(gu);
    }

    if (minPrice !== undefined) {
      conditions.push('last_transaction_price >= ?');
      queryParams.push(minPrice * 10000); // 억원 -> 만원
    }

    if (maxPrice !== undefined) {
      conditions.push('last_transaction_price <= ?');
      queryParams.push(maxPrice * 10000);
    }

    if (minYear !== undefined) {
      conditions.push('construction_year >= ?');
      queryParams.push(minYear);
    }

    if (maxYear !== undefined) {
      conditions.push('construction_year <= ?');
      queryParams.push(maxYear);
    }

    if (minUnits !== undefined) {
      conditions.push('total_units >= ?');
      queryParams.push(minUnits);
    }

    if (maxUnits !== undefined) {
      conditions.push('total_units <= ?');
      queryParams.push(maxUnits);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    // 정렬 설정
    const validSortFields = ['price', 'year', 'units', 'name'];
    const sortField = validSortFields.includes(sortBy) ? sortBy : 'price';
    const sortColumn = {
      price: 'last_transaction_price',
      year: 'construction_year',
      units: 'total_units',
      name: 'complex_name'
    }[sortField];

    const orderClause = `ORDER BY ${sortColumn} ${sortOrder.toUpperCase()}`;

    // 전체 개수 조회
    const countQuery = `SELECT COUNT(*) as total FROM apartment_complexes ${whereClause}`;
    const countResult = await this.db.get<{ total: number }>(countQuery, queryParams);
    const total = countResult?.total || 0;

    // 페이지네이션 계산
    const offset = (page - 1) * limit;
    const totalPages = Math.ceil(total / limit);

    // 데이터 조회
    const dataQuery = `
      SELECT * FROM apartment_complexes 
      ${whereClause} 
      ${orderClause} 
      LIMIT ? OFFSET ?
    `;
    const dataParams = [...queryParams, limit, offset];
    const apartments = await this.db.query<ApartmentComplex>(dataQuery, dataParams);

    return {
      data: apartments,
      pagination: {
        page,
        limit,
        total,
        totalPages,
        hasNext: page < totalPages,
        hasPrev: page > 1
      }
    };
  }

  // 아파트 상세 정보 조회
  async getApartmentById(id: number): Promise<ApartmentComplex | null> {
    const query = 'SELECT * FROM apartment_complexes WHERE id = ?';
    const apartment = await this.db.get<ApartmentComplex>(query, [id]);
    return apartment || null;
  }

  // 지역별 통계 조회
  async getRegionStats(city?: string, gu?: string): Promise<RegionStats[]> {
    const conditions: string[] = [];
    const params: any[] = [];

    if (city) {
      conditions.push('city = ?');
      params.push(city);
    }

    if (gu) {
      conditions.push('gu = ?');
      params.push(gu);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const query = `
      SELECT 
        city,
        gu,
        COUNT(*) as totalApartments,
        AVG(last_transaction_price) as averagePrice,
        MIN(last_transaction_price) as minPrice,
        MAX(last_transaction_price) as maxPrice,
        AVG(construction_year) as averageYear,
        SUM(total_units) as totalUnits,
        COUNT(CASE WHEN last_transaction_price < 100000 THEN 1 END) as under10,
        COUNT(CASE WHEN last_transaction_price >= 100000 AND last_transaction_price < 200000 THEN 1 END) as between10and20,
        COUNT(CASE WHEN last_transaction_price >= 200000 THEN 1 END) as over20
      FROM apartment_complexes 
      ${whereClause}
      GROUP BY city, gu
      ORDER BY totalApartments DESC
    `;

    const results = await this.db.query<any>(query, params);

    return results.map(row => ({
      city: row.city,
      gu: row.gu,
      totalApartments: row.totalApartments,
      averagePrice: Math.round(row.averagePrice / 10000) || 0, // 만원 -> 억원
      medianPrice: Math.round(row.averagePrice / 10000) || 0, // 임시로 평균값 사용
      minPrice: Math.round(row.minPrice / 10000) || 0,
      maxPrice: Math.round(row.maxPrice / 10000) || 0,
      averageYear: Math.round(row.averageYear) || 0,
      totalUnits: row.totalUnits || 0,
      priceRange: {
        under10: row.under10 || 0,
        between10and20: row.between10and20 || 0,
        over20: row.over20 || 0
      }
    }));
  }

  // 재건축 후보 분석
  async getRedevelopmentCandidates(
    minAge: number = 30,
    maxPriceRatio: number = 0.7
  ): Promise<RedevelopmentCandidate[]> {
    const currentYear = new Date().getFullYear();
    
    const query = `
      SELECT 
        *,
        (? - construction_year) as age,
        (last_transaction_price / 10000) as price_in_eok
      FROM apartment_complexes 
      WHERE 
        construction_year IS NOT NULL 
        AND construction_year > 0
        AND (? - construction_year) >= ?
        AND last_transaction_price IS NOT NULL
        AND last_transaction_price > 0
        AND total_units >= 100
      ORDER BY (? - construction_year) DESC, last_transaction_price ASC
    `;

    const apartments = await this.db.query<any>(query, [
      currentYear, 
      currentYear, 
      minAge,
      currentYear
    ]);

    return apartments.map(apt => {
      const age = apt.age;
      const priceInEok = apt.price_in_eok;
      
      // 재건축 점수 계산 (0-100)
      let score = 0;
      const reasons: string[] = [];

      // 나이 점수 (40점 만점)
      if (age >= 40) {
        score += 40;
        reasons.push('건축 40년 이상');
      } else if (age >= 30) {
        score += 30;
        reasons.push('건축 30년 이상');
      }

      // 가격 점수 (30점 만점)
      if (priceInEok <= 100) {
        score += 30;
        reasons.push('상대적 저가');
      } else if (priceInEok <= 150) {
        score += 20;
        reasons.push('중간 가격대');
      }

      // 규모 점수 (20점 만점)
      if (apt.total_units >= 500) {
        score += 20;
        reasons.push('대규모 단지');
      } else if (apt.total_units >= 200) {
        score += 15;
        reasons.push('중규모 단지');
      }

      // 지역 점수 (10점 만점)
      if (apt.city === '서울') {
        score += 10;
        reasons.push('서울 소재');
      } else if (apt.city === '부산' || apt.city === '인천') {
        score += 5;
        reasons.push('광역시 소재');
      }

      // 잠재 수익 계산 (매우 단순한 추정)
      const estimatedNewPrice = priceInEok * 1.5; // 재건축 후 50% 상승 가정
      const potentialProfit = Math.round(estimatedNewPrice - priceInEok);

      return {
        id: apt.id,
        complex_name: apt.complex_name,
        city: apt.city,
        gu: apt.gu,
        address_road: apt.address_road,
        construction_year: apt.construction_year,
        age,
        last_transaction_price: apt.last_transaction_price,
        total_units: apt.total_units,
        latitude: apt.latitude,
        longitude: apt.longitude,
        redevelopment_score: score,
        potential_profit: potentialProfit,
        reasons
      };
    }).filter(candidate => candidate.redevelopment_score >= 50) // 50점 이상만 반환
      .sort((a, b) => b.redevelopment_score - a.redevelopment_score);
  }

  // 전체 통계 조회
  async getOverallStats() {
    const query = `
      SELECT 
        COUNT(*) as totalApartments,
        COUNT(DISTINCT city) as totalCities,
        COUNT(DISTINCT (city || '_' || gu)) as totalRegions,
        AVG(last_transaction_price) as averagePrice,
        MIN(last_transaction_price) as minPrice,
        MAX(last_transaction_price) as maxPrice,
        AVG(construction_year) as averageYear,
        SUM(total_units) as totalUnits
      FROM apartment_complexes
      WHERE last_transaction_price IS NOT NULL AND last_transaction_price > 0
    `;

    const result = await this.db.get<any>(query);
    
    if (!result) {
      return {
        totalApartments: 0,
        totalCities: 0,
        totalRegions: 0,
        averagePrice: 0,
        minPrice: 0,
        maxPrice: 0,
        averageYear: 0,
        totalUnits: 0
      };
    }

    return {
      totalApartments: result.totalApartments || 0,
      totalCities: result.totalCities || 0,
      totalRegions: result.totalRegions || 0,
      averagePrice: Math.round(result.averagePrice / 10000) || 0,
      minPrice: Math.round(result.minPrice / 10000) || 0,
      maxPrice: Math.round(result.maxPrice / 10000) || 0,
      averageYear: Math.round(result.averageYear) || 0,
      totalUnits: result.totalUnits || 0
    };
  }

  // 지역 목록 조회
  async getRegions() {
    const query = `
      SELECT DISTINCT city, gu, COUNT(*) as count
      FROM apartment_complexes
      GROUP BY city, gu
      ORDER BY city, gu
    `;

    const regions = await this.db.query<{ city: string; gu: string; count: number }>(query);
    
    // 도시별로 그룹화
    const grouped = regions.reduce((acc, region) => {
      if (!acc[region.city]) {
        acc[region.city] = [];
      }
      acc[region.city]!.push({
        gu: region.gu,
        count: region.count
      });
      return acc;
    }, {} as Record<string, Array<{ gu: string; count: number }>>);

    return grouped;
  }
}