import React from 'react';
import { useQuery } from 'react-query';
import { apiRequest } from '../utils/api';

/**
 * 지도용 마커 데이터 조회 훅 (최적화된 성능)
 * SQLite 버전
 */
export const useMolitMapMarkers = (params, options = {}) => {
  return useQuery(
    ['molitMapMarkers', params],
    async () => {
      console.log('🔗 molitMapMarkers API 호출:', params)
      const response = await apiRequest.get('/molit-map/markers', { params })
      console.log('📍 molitMapMarkers 응답:', response.data)
      return response.data
    },
    {
      staleTime: 60000, // 1분 캐싱
      cacheTime: 300000, // 5분 보관
      refetchOnWindowFocus: false,
      enabled: true, // 항상 활성화
      retry: 2,
      retryDelay: attemptIndex => Math.min(1000 * 2 ** attemptIndex, 30000),
      ...options
    }
  );
};

/**
 * Supabase 좌표 기반 지도용 마커 데이터 조회 훅 (마이그레이션된 데이터)
 */
export const useSupabaseMapMarkers = (params, options = {}) => {
  return useQuery(
    ['supabaseMapMarkers', params],
    async () => {
      console.log('🗺️ 좌표 기반 supabaseMapMarkers API 호출:', params)
      const response = await apiRequest.get('/coordinates-map/markers', { params })
      console.log('📍 좌표 마커 데이터 응답:', {
        success: response.data?.success,
        count: response.data?.data?.length || 0,
        sample: response.data?.data?.[0] || null,
        hasCoordinates: response.data?.data?.some(d => d.coordinates?.lat && d.coordinates?.lng)
      })
      return response.data
    },
    {
      staleTime: 60000, // 1분 캐싱
      cacheTime: 300000, // 5분 보관
      refetchOnWindowFocus: false,
      enabled: true, // 항상 활성화
      retry: 2,
      retryDelay: attemptIndex => Math.min(1000 * 2 ** attemptIndex, 30000),
      ...options
    }
  );
};

/**
 * 클러스터링된 마커 데이터 조회 훅
 */
export const useMolitMapClusters = (params, options = {}) => {
  return useQuery(
    ['molitMapClusters', params],
    async () => {
      console.log('🎯 molitMapClusters API 호출:', params)
      const response = await apiRequest.get('/molit-map/clusters', { params })
      console.log('🗂️ molitMapClusters 응답:', response.data)
      return response.data
    },
    {
      staleTime: 120000, // 2분 캐싱 (클러스터는 더 안정적)
      cacheTime: 600000, // 10분 보관
      refetchOnWindowFocus: false,
      enabled: params.zoom_level < 8, // 줌 레벨이 낮을 때만
      retry: 2,
      ...options
    }
  );
};

/**
 * 특정 단지의 거래 내역 조회 훅
 */
export const useMolitComplexTransactions = (complexName, params = {}, options = {}) => {
  return useQuery(
    ['molitComplexTransactions', complexName, params],
    () => apiRequest.get(`/molit-map/complex/${encodeURIComponent(complexName)}/transactions`, { params }),
    {
      staleTime: 300000, // 5분 캐싱
      cacheTime: 900000, // 15분 보관
      refetchOnWindowFocus: false,
      enabled: !!complexName, // 단지명이 있을 때만
      retry: 1,
      ...options
    }
  );
};

/**
 * 지도 통계 데이터 조회 훅
 */
export const useMolitMapStats = (region = null, options = {}) => {
  return useQuery(
    ['molitMapStats', region],
    () => apiRequest.get('/molit-map/stats', { params: region ? { region } : {} }),
    {
      staleTime: 600000, // 10분 캐싱 (통계는 자주 변하지 않음)
      cacheTime: 1800000, // 30분 보관
      refetchOnWindowFocus: false,
      retry: 2,
      ...options
    }
  );
};

/**
 * 밀도 히트맵 데이터 조회 훅
 */
export const useMolitMapDensity = (params, options = {}) => {
  return useQuery(
    ['molitMapDensity', params],
    async () => {
      console.log('📊 molitMapDensity API 호출:', params)
      const response = await apiRequest.get('/molit-map/density', { params })
      console.log('🔥 molitMapDensity 응답:', response.data)
      return response.data
    },
    {
      staleTime: 300000, // 5분 캐싱
      cacheTime: 900000, // 15분 보관
      refetchOnWindowFocus: false,
      enabled: true, // 항상 활성화
      retry: 1,
      ...options
    }
  );
};

/**
 * 뷰포트 기반 지도 데이터 관리 훅
 * 지도 상태에 따라 마커/클러스터를 자동으로 선택
 */
export const useViewportMapData = (mapParams) => {
  const {
    bounds,
    zoom_level = 8,
    region,
    deal_type,
    household_filter = 'all',
    limit = 50
  } = mapParams || {};

  // 줌 레벨에 따른 데이터 소스 결정
  const shouldUseCluster = zoom_level < 8;
  const shouldUseDensity = zoom_level < 6;

  // 클러스터 데이터 (광역 뷰)
  const clusterQuery = useMolitMapClusters(
    {
      bounds: bounds ? JSON.stringify(bounds) : null,
      zoom_level,
      cluster_size: zoom_level < 6 ? 0.1 : 0.05,
      region
    },
    { enabled: shouldUseCluster } // bounds 체크 제거하여 항상 활성화
  );

  // 개별 마커 데이터 (상세 뷰)
  const markerQuery = useMolitMapMarkers(
    {
      bounds: bounds ? JSON.stringify(bounds) : null,
      zoom_level,
      region,
      deal_type,
      household_filter,
      limit: zoom_level > 10 ? limit : Math.min(limit, 100)
    },
    { enabled: !shouldUseCluster } // 항상 활성화
  );

  // 밀도 데이터 (매우 광역 뷰)
  const densityQuery = useMolitMapDensity(
    {
      bounds: bounds ? JSON.stringify(bounds) : null,
      region,
      grid_size: 0.1
    },
    { enabled: shouldUseDensity } // bounds 체크 제거하여 항상 활성화
  );

  // 현재 활성 쿼리 결정
  const activeQuery = shouldUseDensity ? densityQuery : 
                     shouldUseCluster ? clusterQuery : markerQuery;

  return {
    // 데이터 (이미 response.data를 반환하므로 .data 중복 제거)
    data: activeQuery.data?.data || activeQuery.data || [],
    meta: activeQuery.data?.meta || {},
    
    // 상태
    isLoading: activeQuery.isLoading,
    isError: activeQuery.isError,
    error: activeQuery.error,
    
    // 메타 정보
    dataSource: shouldUseDensity ? 'density' : shouldUseCluster ? 'cluster' : 'marker',
    shouldUseCluster,
    shouldUseDensity,
    
    // 개별 쿼리 접근 (필요시)
    queries: {
      cluster: clusterQuery,
      marker: markerQuery,
      density: densityQuery
    },
    
    // 새로고침 함수
    refetch: activeQuery.refetch
  };
};

/**
 * 지도 bounds 변경 감지 및 디바운싱 훅
 */
export const useMapBoundsDebounce = (bounds, delay = 500) => {
  const [debouncedBounds, setDebouncedBounds] = React.useState(bounds);

  React.useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedBounds(bounds);
    }, delay);

    return () => {
      clearTimeout(handler);
    };
  }, [bounds, delay]);

  return debouncedBounds;
};