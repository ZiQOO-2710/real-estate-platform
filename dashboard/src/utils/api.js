import { useQuery } from 'react-query'
import axios from 'axios'

// API 기본 설정
const api = axios.create({
  baseURL: '/api',
  timeout: 10000,
})

// 에러 처리 인터셉터
api.interceptors.response.use(
  (response) => response,
  (error) => {
    console.error('API Error:', error)
    return Promise.reject(error)
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

export default api