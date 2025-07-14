import axios from 'axios';
import { 
  ApartmentComplex, 
  ApartmentSearchParams, 
  ApartmentSearchResult,
  RegionStats,
  RedevelopmentCandidate 
} from '../types/apartment';

const API_BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:4000/api';

const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: 10000,
  headers: {
    'Content-Type': 'application/json',
  },
});

// 요청 인터셉터
api.interceptors.request.use(
  (config) => {
    console.log(`API Request: ${config.method?.toUpperCase()} ${config.url}`);
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// 응답 인터셉터
api.interceptors.response.use(
  (response) => {
    return response;
  },
  (error) => {
    console.error('API Error:', error.response?.data || error.message);
    return Promise.reject(error);
  }
);

export const apartmentApi = {
  // 아파트 검색
  searchApartments: async (params: ApartmentSearchParams): Promise<ApartmentSearchResult> => {
    const response = await api.get('/apartments/search', { params });
    return response.data;
  },

  // 아파트 상세 정보
  getApartmentById: async (id: number): Promise<ApartmentComplex> => {
    const response = await api.get(`/apartments/${id}`);
    return response.data;
  },

  // 전체 통계
  getOverallStats: async () => {
    const response = await api.get('/apartments/stats');
    return response.data;
  },

  // 지역 목록
  getRegions: async () => {
    const response = await api.get('/apartments/regions');
    return response.data;
  },

  // 지역별 통계
  getRegionStats: async (city?: string, gu?: string): Promise<RegionStats[]> => {
    const params: any = {};
    if (city) params.city = city;
    if (gu) params.gu = gu;
    
    const response = await api.get('/apartments/stats/region', { params });
    return response.data;
  },

  // 재건축 후보 분석
  getRedevelopmentCandidates: async (
    minAge: number = 30,
    maxPriceRatio: number = 0.7
  ): Promise<RedevelopmentCandidate[]> => {
    const response = await api.get('/apartments/redevelopment', {
      params: { minAge, maxPriceRatio }
    });
    return response.data;
  },

  // 지도용 마커 데이터
  getMapMarkers: async (params: Partial<ApartmentSearchParams>) => {
    const response = await api.get('/apartments/map-markers', { params });
    return response.data;
  }
};

// API 상태 확인
export const checkApiHealth = async () => {
  try {
    const response = await api.get('/health');
    return response.data;
  } catch (error) {
    console.error('API Health Check Failed:', error);
    return { success: false, error: 'API 서버에 연결할 수 없습니다.' };
  }
};

export default api;