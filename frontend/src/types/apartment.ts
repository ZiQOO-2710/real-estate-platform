// 아파트 관련 타입 정의 (백엔드 API 연동용)

// 백엔드 API 응답 타입
export interface ApartmentComplex {
  id: number;
  complex_name: string;
  city: string;
  gu: string;
  address_road: string;
  address_jibun: string;
  latitude: number;
  longitude: number;
  construction_year: number;
  total_units: number;
  last_transaction_price: number;
  last_transaction_date: string;
  source_url: string;
  created_at: string;
  updated_at: string;
}

// 아파트 검색 파라미터
export interface ApartmentSearchParams {
  city?: string;
  gu?: string;
  minPrice?: number;
  maxPrice?: number;
  minYear?: number;
  maxYear?: number;
  minUnits?: number;
  maxUnits?: number;
  page?: number;
  limit?: number;
  sortBy?: 'price' | 'year' | 'units' | 'name';
  sortOrder?: 'asc' | 'desc';
}

// 검색 결과 응답
export interface ApartmentSearchResult {
  data: ApartmentComplex[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
    hasNext: boolean;
    hasPrev: boolean;
  };
}

// 지역별 통계
export interface RegionStats {
  city: string;
  gu: string;
  totalApartments: number;
  averagePrice: number;
  medianPrice: number;
  minPrice: number;
  maxPrice: number;
  averageYear: number;
  totalUnits: number;
  priceRange: {
    under10: number;
    between10and20: number;
    over20: number;
  };
}

// 재건축 후보
export interface RedevelopmentCandidate {
  id: number;
  complex_name: string;
  city: string;
  gu: string;
  address_road: string;
  construction_year: number;
  age: number;
  last_transaction_price: number;
  total_units: number;
  latitude: number;
  longitude: number;
  redevelopment_score: number;
  potential_profit: number;
  reasons: string[];
}

// 지도 마커용 데이터
export interface MapMarker {
  id: number;
  name: string;
  city: string;
  gu: string;
  latitude: number;
  longitude: number;
  price: number;
  construction_year: number;
  total_units: number;
  address: string;
}

// 전체 통계
export interface OverallStats {
  totalApartments: number;
  totalCities: number;
  totalRegions: number;
  averagePrice: number;
  minPrice: number;
  maxPrice: number;
  averageYear: number;
  totalUnits: number;
}

// 지역 목록
export interface RegionList {
  [city: string]: Array<{
    gu: string;
    count: number;
  }>;
}

// 레거시 타입 (기존 코드 호환성)
export interface Coordinates {
  lat: number;
  lng: number;
}

export interface ApartmentMarker {
  id: string;
  name: string;
  coordinates: Coordinates;
  price?: number;
  pricePerPyeong?: number;
  status: 'sale' | 'rent' | 'lease' | 'sold';
}

export interface ApartmentFilter {
  priceMin?: number;
  priceMax?: number;
  areaMin?: number;
  areaMax?: number;
  constructionYearMin?: number;
  constructionYearMax?: number;
  transactionType?: 'sale' | 'rent' | 'lease' | 'all';
  sortBy?: 'price' | 'area' | 'date' | 'name';
  sortOrder?: 'asc' | 'desc';
}