/**
 * 멀티 DB 데이터 매니저
 * 네이버 부동산, 국토부 실거래가, 통합 DB를 관리하는 클라이언트 측 데이터 매니저
 */

import { api } from '../utils/api';

class DataManager {
  constructor() {
    this.cache = new Map();
    this.cacheTimeout = 5 * 60 * 1000; // 5분 캐시
    this.dataSourcePriorities = {
      coordinates: ['naver', 'integrated'], // 좌표는 네이버 우선
      transactions: ['molit', 'integrated'], // 실거래는 국토부 우선
      listings: ['naver', 'integrated'], // 매물은 네이버 우선
      complexes: ['naver', 'molit', 'integrated'] // 단지정보는 통합
    };
  }

  /**
   * 캐시 키 생성
   */
  getCacheKey(endpoint, params = {}) {
    const sortedParams = Object.keys(params)
      .sort()
      .map(key => `${key}=${params[key]}`)
      .join('&');
    return `${endpoint}?${sortedParams}`;
  }

  /**
   * 캐시에서 데이터 조회
   */
  getFromCache(key) {
    const cached = this.cache.get(key);
    if (cached && Date.now() - cached.timestamp < this.cacheTimeout) {
      return cached.data;
    }
    return null;
  }

  /**
   * 캐시에 데이터 저장
   */
  setCache(key, data) {
    this.cache.set(key, {
      data,
      timestamp: Date.now()
    });
  }

  /**
   * 여러 데이터 소스에서 데이터 가져오기 (폴백 지원)
   */
  async fetchWithFallback(endpoint, params = {}, sources = ['integrated']) {
    const cacheKey = this.getCacheKey(endpoint, params);
    const cached = this.getFromCache(cacheKey);
    if (cached) {
      return cached;
    }

    let lastError = null;
    
    for (const source of sources) {
      try {
        const fullEndpoint = source === 'integrated' ? endpoint : `${source}/${endpoint}`;
        const response = await api.get(fullEndpoint, { params });
        
        // 성공한 데이터를 캐시에 저장
        this.setCache(cacheKey, {
          ...response.data,
          data_source: source,
          fetched_at: new Date().toISOString()
        });
        
        return response.data;
      } catch (error) {
        console.warn(`Failed to fetch from ${source}:`, error.message);
        lastError = error;
        continue;
      }
    }
    
    throw lastError || new Error('All data sources failed');
  }

  /**
   * 지도용 좌표 데이터 조회 (네이버 우선)
   */
  async getMapCoordinates(bounds, region = '') {
    const sources = this.dataSourcePriorities.coordinates;
    
    try {
      // 네이버에서 좌표 데이터 조회 시도
      const naverData = await this.fetchWithFallback(
        'coordinates', 
        { bounds, region }, 
        ['naver']
      );
      
      if (naverData.data && naverData.data.length > 0) {
        return {
          ...naverData,
          primary_source: 'naver',
          data: naverData.data.map(item => ({
            ...item,
            source: 'naver',
            has_listings: item.listing_count > 0
          }))
        };
      }
    } catch (error) {
      console.warn('Naver coordinates failed, trying fallback:', error.message);
    }

    // 폴백으로 통합 DB에서 조회
    return await this.fetchWithFallback(
      'complexes',
      { bounds, region, withCoordinates: true },
      ['integrated']
    );
  }

  /**
   * 아파트 단지 목록 조회 (멀티 소스 통합)
   */
  async getComplexes(filters = {}) {
    const sources = this.dataSourcePriorities.complexes;
    const results = [];
    
    // 각 소스에서 데이터 병렬 조회
    const promises = sources.map(async (source) => {
      try {
        const data = await this.fetchWithFallback('complexes', filters, [source]);
        return {
          source,
          data: data.data || [],
          success: true
        };
      } catch (error) {
        console.warn(`Failed to fetch complexes from ${source}:`, error.message);
        return {
          source,
          data: [],
          success: false,
          error: error.message
        };
      }
    });

    const responses = await Promise.allSettled(promises);
    
    // 성공한 응답들을 결합
    responses.forEach(result => {
      if (result.status === 'fulfilled' && result.value.success) {
        results.push(...result.value.data.map(item => ({
          ...item,
          data_source: result.value.source
        })));
      }
    });

    // 중복 제거 (ID 기준)
    const uniqueComplexes = this.deduplicateByField(results, 'id');
    
    return {
      data: uniqueComplexes,
      total_sources: sources.length,
      successful_sources: responses.filter(r => r.status === 'fulfilled' && r.value.success).length,
      source_summary: sources.map(source => {
        const response = responses.find(r => r.status === 'fulfilled' && r.value.source === source);
        return {
          source,
          count: response?.value.data.length || 0,
          success: response?.value.success || false
        };
      })
    };
  }

  /**
   * 실거래가 데이터 조회 (국토부 우선)
   */
  async getTransactions(filters = {}) {
    const sources = this.dataSourcePriorities.transactions;
    
    try {
      // 국토부에서 실거래가 조회 시도
      const molitData = await this.fetchWithFallback(
        'transactions',
        filters,
        ['molit']
      );
      
      return {
        ...molitData,
        primary_source: 'molit',
        data: molitData.data.map(item => ({
          ...item,
          source: 'molit',
          is_official: true
        }))
      };
    } catch (error) {
      console.warn('MOLIT transactions failed, trying fallback:', error.message);
      
      // 폴백으로 통합 DB에서 조회
      return await this.fetchWithFallback('transactions', filters, ['integrated']);
    }
  }

  /**
   * 매물 정보 조회 (네이버 우선)
   */
  async getListings(filters = {}) {
    const sources = this.dataSourcePriorities.listings;
    
    try {
      // 네이버에서 매물 조회 시도
      const naverData = await this.fetchWithFallback(
        'listings',
        filters,
        ['naver']
      );
      
      return {
        ...naverData,
        primary_source: 'naver',
        data: naverData.data.map(item => ({
          ...item,
          source: 'naver',
          is_realtime: true
        }))
      };
    } catch (error) {
      console.warn('Naver listings failed, trying fallback:', error.message);
      
      // 폴백으로 통합 DB에서 조회
      return await this.fetchWithFallback('listings', filters, ['integrated']);
    }
  }

  /**
   * 단지 상세 정보 조회 (멀티 소스 통합)
   */
  async getComplexDetail(complexId) {
    const results = {
      complex: null,
      listings: [],
      transactions: [],
      source_info: {}
    };

    // 병렬로 여러 소스에서 데이터 조회
    const [naverResult, molitResult, integratedResult] = await Promise.allSettled([
      // 네이버: 단지 기본정보 + 매물
      this.fetchWithFallback(`complexes/${complexId}`, {}, ['naver']),
      // 국토부: 실거래가 데이터
      this.fetchWithFallback(`complexes/${complexId}`, {}, ['molit']),
      // 통합: 전체 정보
      this.fetchWithFallback(`complexes/${complexId}`, {}, ['integrated'])
    ]);

    // 네이버 데이터 처리
    if (naverResult.status === 'fulfilled') {
      const naverData = naverResult.value;
      results.complex = results.complex || naverData.complex;
      results.listings = naverData.listings || [];
      results.source_info.naver = {
        success: true,
        listings_count: naverData.listings?.length || 0
      };
    }

    // 국토부 데이터 처리
    if (molitResult.status === 'fulfilled') {
      const molitData = molitResult.value;
      results.complex = results.complex || molitData.complex;
      results.transactions = molitData.transactions || [];
      results.source_info.molit = {
        success: true,
        transactions_count: molitData.transactions?.length || 0
      };
    }

    // 통합 데이터로 빈 부분 채우기
    if (integratedResult.status === 'fulfilled') {
      const integratedData = integratedResult.value;
      results.complex = results.complex || integratedData.complex;
      results.listings = results.listings.length > 0 ? results.listings : (integratedData.listings || []);
      results.transactions = results.transactions.length > 0 ? results.transactions : (integratedData.transactions || []);
      results.source_info.integrated = {
        success: true,
        used_as_fallback: !results.complex || results.listings.length === 0 || results.transactions.length === 0
      };
    }

    return results;
  }

  /**
   * 검색 기능 (멀티 소스)
   */
  async search(query, options = {}) {
    const { sources = ['naver', 'molit', 'integrated'], limit = 20 } = options;
    const results = [];

    const promises = sources.map(async (source) => {
      try {
        const endpoint = source === 'integrated' ? 'search' : `${source}/search`;
        const data = await this.fetchWithFallback(endpoint, { q: query, limit }, [source]);
        return {
          source,
          data: data.data || [],
          success: true
        };
      } catch (error) {
        return {
          source,
          data: [],
          success: false,
          error: error.message
        };
      }
    });

    const responses = await Promise.allSettled(promises);
    
    responses.forEach(result => {
      if (result.status === 'fulfilled' && result.value.success) {
        results.push(...result.value.data.map(item => ({
          ...item,
          data_source: result.value.source
        })));
      }
    });

    // 관련도 기준 정렬 및 중복 제거
    const uniqueResults = this.deduplicateByField(results, 'name');
    const sortedResults = this.sortByRelevance(uniqueResults, query);

    return {
      data: sortedResults.slice(0, limit),
      total_found: sortedResults.length,
      query,
      sources_used: sources,
      successful_sources: responses.filter(r => r.status === 'fulfilled' && r.value.success).length
    };
  }

  /**
   * 통계 정보 조회 (멀티 소스 통합)
   */
  async getStats() {
    const [naverStats, molitStats, integratedStats] = await Promise.allSettled([
      this.fetchWithFallback('stats', {}, ['naver']),
      this.fetchWithFallback('stats', {}, ['molit']),
      this.fetchWithFallback('stats', {}, ['integrated'])
    ]);

    return {
      naver: naverStats.status === 'fulfilled' ? naverStats.value : null,
      molit: molitStats.status === 'fulfilled' ? molitStats.value : null,
      integrated: integratedStats.status === 'fulfilled' ? integratedStats.value : null,
      summary: this.generateStatsSummary([
        naverStats.status === 'fulfilled' ? naverStats.value : null,
        molitStats.status === 'fulfilled' ? molitStats.value : null,
        integratedStats.status === 'fulfilled' ? integratedStats.value : null
      ])
    };
  }

  /**
   * 유틸리티 메서드들
   */
  
  // 필드 기준 중복 제거
  deduplicateByField(items, field) {
    const seen = new Set();
    return items.filter(item => {
      const key = item[field];
      if (seen.has(key)) {
        return false;
      }
      seen.add(key);
      return true;
    });
  }

  // 검색 관련도 기준 정렬
  sortByRelevance(items, query) {
    const lowerQuery = query.toLowerCase();
    return items.sort((a, b) => {
      const aName = (a.name || a.apartment_name || '').toLowerCase();
      const bName = (b.name || b.apartment_name || '').toLowerCase();
      
      // 정확한 매치 우선
      if (aName.includes(lowerQuery) && !bName.includes(lowerQuery)) return -1;
      if (!aName.includes(lowerQuery) && bName.includes(lowerQuery)) return 1;
      
      // 시작 위치 우선
      const aIndex = aName.indexOf(lowerQuery);
      const bIndex = bName.indexOf(lowerQuery);
      if (aIndex !== bIndex) return aIndex - bIndex;
      
      // 길이 우선 (짧은 것 우선)
      return aName.length - bName.length;
    });
  }

  // 통계 요약 생성
  generateStatsSummary(statsList) {
    const validStats = statsList.filter(s => s && s.overview);
    if (validStats.length === 0) return null;

    return {
      total_complexes: validStats.reduce((sum, s) => sum + (s.overview.total_complexes || 0), 0),
      total_listings: validStats.reduce((sum, s) => sum + (s.overview.total_listings || 0), 0),
      total_transactions: validStats.reduce((sum, s) => sum + (s.overview.total_transactions || 0), 0),
      data_sources: validStats.length,
      last_updated: new Date().toISOString()
    };
  }

  /**
   * 캐시 관리
   */
  clearCache() {
    this.cache.clear();
  }

  getCacheStats() {
    return {
      size: this.cache.size,
      keys: Array.from(this.cache.keys())
    };
  }
}

// 싱글톤 인스턴스 생성
const dataManager = new DataManager();

export default dataManager;