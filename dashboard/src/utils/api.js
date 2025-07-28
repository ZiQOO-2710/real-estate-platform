import { useQuery } from 'react-query'
import axios from 'axios'

// API 기본 설정 (MOLIT 대용량 데이터용 타임아웃 연장)
const api = axios.create({
  baseURL: '/api',
  timeout: 60000, // 60초로 연장 (MOLIT 97만건 데이터 처리용)
})

// 향상된 에러 처리 인터셉터
api.interceptors.response.use(
  (response) => response,
  (error) => {
    // 에러 타입별 세분화된 처리
    const errorInfo = {
      timestamp: new Date().toISOString(),
      url: error.config?.url,
      method: error.config?.method?.toUpperCase(),
      status: error.response?.status,
      statusText: error.response?.statusText,
      message: error.message
    }

    // HTTP 상태 코드별 처리
    if (error.response) {
      const { status } = error.response
      
      switch (status) {
        case 400:
          errorInfo.type = 'VALIDATION_ERROR'
          errorInfo.userMessage = '요청 데이터가 올바르지 않습니다.'
          break
        case 401:
          errorInfo.type = 'UNAUTHORIZED'
          errorInfo.userMessage = '인증이 필요합니다.'
          break
        case 403:
          errorInfo.type = 'FORBIDDEN' 
          errorInfo.userMessage = '접근 권한이 없습니다.'
          break
        case 404:
          errorInfo.type = 'NOT_FOUND'
          errorInfo.userMessage = '요청한 데이터를 찾을 수 없습니다.'
          break
        case 429:
          errorInfo.type = 'RATE_LIMITED'
          errorInfo.userMessage = '요청이 너무 많습니다. 잠시 후 다시 시도하세요.'
          errorInfo.retryAfter = error.response.headers['retry-after']
          break
        case 500:
          errorInfo.type = 'SERVER_ERROR'
          errorInfo.userMessage = '서버 오류가 발생했습니다.'
          break
        case 503:
          errorInfo.type = 'SERVICE_UNAVAILABLE'
          errorInfo.userMessage = '서비스를 일시적으로 사용할 수 없습니다.'
          break
        default:
          errorInfo.type = 'UNKNOWN_HTTP_ERROR'
          errorInfo.userMessage = `서버 오류가 발생했습니다. (${status})`
      }
    } else if (error.request) {
      // 네트워크 오류
      errorInfo.type = 'NETWORK_ERROR'
      errorInfo.userMessage = '네트워크 연결을 확인하세요.'
    } else {
      // 기타 오류
      errorInfo.type = 'REQUEST_SETUP_ERROR'
      errorInfo.userMessage = '요청 설정 오류가 발생했습니다.'
    }

    // 콘솔에 상세 로깅
    console.error('API Error Details:', errorInfo)
    
    // 사용자 친화적인 에러 객체로 변환
    const enhancedError = new Error(errorInfo.userMessage)
    enhancedError.type = errorInfo.type
    enhancedError.details = errorInfo
    enhancedError.originalError = error

    return Promise.reject(enhancedError)
  }
)

// API 함수들
export const fetchSystemHealth = async () => {
  const { data } = await api.get('/health')
  return data
}

export const fetchStats = async () => {
  const { data } = await api.get('/stats')
  return data
}

export const fetchComplexes = async (params = {}) => {
  const { data } = await api.get('/complexes', { params })
  return data
}

export const fetchComplex = async (id) => {
  const { data } = await api.get(`/complexes/${id}`)
  return data
}

export const fetchListings = async (params = {}) => {
  const { data } = await api.get('/listings', { params })
  return data
}

export const fetchListing = async (id) => {
  const { data } = await api.get(`/listings/${id}`)
  return data
}

export const fetchTransactions = async (params = {}) => {
  const { data } = await api.get('/transactions', { params })
  return data
}

export const fetchTransaction = async (id) => {
  const { data } = await api.get(`/transactions/${id}`)
  return data
}

export const fetchRegionStats = async (params = {}) => {
  const { data } = await api.get('/stats/regions', { params })
  return data
}

export const fetchPriceAnalysis = async (params = {}) => {
  const { data } = await api.get('/stats/price-analysis', { params })
  return data
}

// React Query 훅들
export const useSystemHealth = () => {
  return useQuery('systemHealth', fetchSystemHealth, {
    refetchInterval: 30000, // 30초마다 갱신
    retry: 3,
  })
}

export const useStats = () => {
  return useQuery('stats', fetchStats, {
    refetchInterval: 60000, // 1분마다 갱신
    retry: 2,
  })
}

export const useComplexes = (params = {}) => {
  return useQuery(['complexes', params], () => fetchComplexes(params), {
    keepPreviousData: true,
    retry: 2,
  })
}

export const useComplex = (id) => {
  return useQuery(['complex', id], () => fetchComplex(id), {
    enabled: !!id,
    retry: 2,
  })
}

export const useListings = (params = {}) => {
  return useQuery(['listings', params], () => fetchListings(params), {
    keepPreviousData: true,
    retry: 2,
  })
}

export const useListing = (id) => {
  return useQuery(['listing', id], () => fetchListing(id), {
    enabled: !!id,
    retry: 2,
  })
}

export const useTransactions = (params = {}) => {
  return useQuery(['transactions', params], () => fetchTransactions(params), {
    keepPreviousData: true,
    retry: 2,
  })
}

export const useTransaction = (id) => {
  return useQuery(['transaction', id], () => fetchTransaction(id), {
    enabled: !!id,
    retry: 2,
  })
}

export const useRegionStats = (params = {}) => {
  return useQuery(['regionStats', params], () => fetchRegionStats(params), {
    retry: 2,
  })
}

export const usePriceAnalysis = (params = {}) => {
  return useQuery(['priceAnalysis', params], () => fetchPriceAnalysis(params), {
    retry: 2,
  })
}

// 통합 데이터 API 추가
export const fetchIntegratedComplexes = async (params = {}) => {
  const { data } = await api.get('/integrated/complexes', { params })
  return data
}

export const fetchIntegratedComplexDetails = async (id) => {
  const { data } = await api.get(`/integrated/complexes/${id}`)
  return data
}

export const useIntegratedComplexes = (params = {}) => {
  return useQuery(['integratedComplexes', params], () => fetchIntegratedComplexes(params), {
    keepPreviousData: true,
    retry: 2,
  })
}

export const useIntegratedComplexDetails = (id) => {
  return useQuery(['integratedComplexDetails', id], () => fetchIntegratedComplexDetails(id), {
    enabled: !!id,
    retry: 2,
  })
}

// 멀티 DB API 함수들 (네이버 + 국토부 + 통합)
export const fetchNaverComplexes = async (params = {}) => {
  const { data } = await api.get('/naver/complexes', { params })
  return data
}

export const fetchNaverComplex = async (id) => {
  const { data } = await api.get(`/naver/complexes/${id}`)
  return data
}

export const fetchNaverListings = async (params = {}) => {
  const { data } = await api.get('/naver/listings', { params })
  return data
}

export const fetchNaverCoordinates = async (params = {}) => {
  const { data } = await api.get('/naver/coordinates', { params })
  return data
}

export const fetchNaverStats = async () => {
  const { data } = await api.get('/naver/stats')
  return data
}

export const fetchMolitComplexes = async (params = {}) => {
  const { data } = await api.get('/molit/complexes', { params })
  return data
}

export const fetchMolitComplex = async (id) => {
  const { data } = await api.get(`/molit/complexes/${id}`)
  return data
}

export const fetchMolitTransactions = async (params = {}) => {
  const { data } = await api.get('/molit/transactions', { params })
  return data
}

export const fetchMolitAnalysis = async (params = {}) => {
  const { data } = await api.get('/molit/analysis', { params })
  return data
}

export const fetchMolitStats = async () => {
  const { data } = await api.get('/molit/stats')
  return data
}

export const searchNaver = async (params = {}) => {
  const { data } = await api.get('/naver/search', { params })
  return data
}

export const searchMolit = async (params = {}) => {
  const { data } = await api.get('/molit/search', { params })
  return data
}

// MOLIT 좌표 데이터 (97만건 실거래 데이터 기반) - 초고성능 네이버+MOLIT 통합 버전
export const fetchMolitCoordinates = async (params = {}) => {
  console.log('🔗 MOLIT 좌표 API 호출:', params)
  
  const { data } = await api.get('/molit-ultra-fast/coordinates', { params })
  
  console.log('📍 MOLIT 좌표 응답:', {
    status: 'success',
    dataCount: data?.data?.length || 0,
    hasData: !!data?.data,
    firstItem: data?.data?.[0] || null,
    apiResponseTime: data?.response_time_ms || 'unknown'
  })
  
  // 클라이언트 사이드에서 좌표 오류 보정 (이미 서버에서 처리됨)
  if (data && data.data) {
    // 좌표 데이터 품질 분석
    const validCoordinates = data.data.filter(c => 
      c.latitude && c.longitude && 
      c.latitude >= 33.0 && c.latitude <= 39.0 &&
      c.longitude >= 124.0 && c.longitude <= 132.0
    )
    
    const estimatedCoordinates = data.data.filter(c => c.coordinate_source === 'address_estimation').length
    const exactCoordinates = data.data.filter(c => c.coordinate_source === 'exact_match').length
    
    data.coordinate_analysis = {
      total: data.data.length,
      valid: validCoordinates.length,
      estimated: estimatedCoordinates,
      exact: exactCoordinates,
      invalid: data.data.length - validCoordinates.length
    }
    
    console.log('🎯 좌표 품질 분석:', data.coordinate_analysis)
    
    if (estimatedCoordinates > 0) {
      data.coordinate_corrections_applied = estimatedCoordinates
      data.quality_note = `${estimatedCoordinates}개 단지 주소 기반 좌표 매칭 완료`
    }
  }
  
  return data
}

// React Query 훅들 (멀티 DB)
export const useNaverComplexes = (params = {}) => {
  return useQuery(['naverComplexes', params], () => fetchNaverComplexes(params), {
    keepPreviousData: true,
    retry: 2,
  })
}

export const useNaverComplex = (id) => {
  return useQuery(['naverComplex', id], () => fetchNaverComplex(id), {
    enabled: !!id,
    retry: 2,
  })
}

export const useNaverListings = (params = {}) => {
  return useQuery(['naverListings', params], () => fetchNaverListings(params), {
    keepPreviousData: true,
    retry: 2,
  })
}

export const useNaverCoordinates = (params = {}) => {
  return useQuery(['naverCoordinates', params], () => fetchNaverCoordinates(params), {
    keepPreviousData: true,
    retry: 2,
    staleTime: 2 * 60 * 1000, // 2분간 fresh
  })
}

export const useNaverStats = () => {
  return useQuery('naverStats', fetchNaverStats, {
    refetchInterval: 60000, // 1분마다 갱신
    retry: 2,
  })
}

export const useMolitComplexes = (params = {}) => {
  return useQuery(['molitComplexes', params], () => fetchMolitComplexes(params), {
    keepPreviousData: true,
    retry: 2,
  })
}

export const useMolitComplex = (id) => {
  return useQuery(['molitComplex', id], () => fetchMolitComplex(id), {
    enabled: !!id,
    retry: 2,
  })
}

export const useMolitTransactions = (params = {}) => {
  return useQuery(['molitTransactions', params], () => fetchMolitTransactions(params), {
    keepPreviousData: true,
    retry: 2,
  })
}

export const useMolitAnalysis = (params = {}) => {
  return useQuery(['molitAnalysis', params], () => fetchMolitAnalysis(params), {
    keepPreviousData: true,
    retry: 2,
  })
}

export const useMolitStats = () => {
  return useQuery('molitStats', fetchMolitStats, {
    refetchInterval: 60000, // 1분마다 갱신
    retry: 2,
  })
}

export const useNaverSearch = (query, options = {}) => {
  return useQuery(['naverSearch', query], () => searchNaver({ q: query, ...options }), {
    enabled: !!query && query.length >= 2,
    retry: 1,
  })
}

export const useMolitSearch = (query, options = {}) => {
  return useQuery(['molitSearch', query], () => searchMolit({ q: query, ...options }), {
    enabled: !!query && query.length >= 2,
    retry: 1,
  })
}

export const useMolitCoordinates = (params = {}) => {
  return useQuery(['molitCoordinates', params], () => fetchMolitCoordinates(params), {
    keepPreviousData: true,
    retry: 2,
    staleTime: 2 * 60 * 1000, // 2분간 fresh
  })
}

// 정확한 좌표가 매칭된 국토부 실거래가 데이터 API
export const fetchMolitCoordinatesUpdated = async (params = {}) => {
  console.log('🎯 정확한 좌표 MOLIT API 호출:', params)
  
  const { data } = await api.get('/molit-coordinates-updated', { params })
  
  console.log('📍 정확한 좌표 MOLIT 응답:', {
    status: 'success',
    dataCount: data?.data?.length || 0,
    hasData: !!data?.data,
    firstItem: data?.data?.[0] || null,
    coordinateSource: data?.coordinate_source || 'unknown',
    apiResponseTime: data?.response_time_ms || 'unknown'
  })
  
  return data
}

export const useMolitCoordinatesUpdated = (params = {}) => {
  return useQuery(['molitCoordinatesUpdated', params], () => fetchMolitCoordinatesUpdated(params), {
    keepPreviousData: true,
    retry: 2,
    staleTime: 5 * 60 * 1000, // 5분간 fresh (정확한 데이터이므로 더 오래 캐시)
  })
}

// 좌표 매칭 요약 정보
export const fetchMolitCoordinatesSummary = async () => {
  console.log('📊 MOLIT 좌표 매칭 요약 조회')
  
  const { data } = await api.get('/molit-coordinates-updated/summary')
  
  console.log('📈 MOLIT 좌표 요약 응답:', data)
  
  return data
}

export const useMolitCoordinatesSummary = () => {
  return useQuery(['molitCoordinatesSummary'], fetchMolitCoordinatesSummary, {
    retry: 2,
    staleTime: 10 * 60 * 1000, // 10분간 fresh
  })
}

// apiRequest 객체 추가 (새로운 훅에서 사용)
export const apiRequest = {
  get: (url, config = {}) => api.get(url, config),
  post: (url, data, config = {}) => api.post(url, data, config),
  put: (url, data, config = {}) => api.put(url, data, config),
  delete: (url, config = {}) => api.delete(url, config),
}

export { api }
export default api