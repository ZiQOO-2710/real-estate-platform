import React, { useEffect, useRef, useState } from 'react'
import { 
  Box, 
  Card, 
  CardContent, 
  Typography, 
  Chip,
  Stack,
  CircularProgress,
  Alert,
  Button,
  Dialog,
  DialogTitle,
  DialogContent,
  IconButton,
  Tabs,
  Tab,
  Divider,
  Table,
  TableHead,
  TableBody,
  TableRow,
  TableCell,
  ButtonGroup,
  Paper
} from '@mui/material'
import { LocationOn, Home, AttachMoney, Refresh, Map as MapIcon, Close, TrendingUp, ShoppingCart, Info, FilterList } from '@mui/icons-material'

// API 훅 및 유틸리티 (멀티 DB 지원)
import { 
  useComplexes, 
  useListings, 
  useIntegratedComplexes, 
  useIntegratedComplexDetails,
  useNaverCoordinates,
  useNaverComplexes,
  useNaverStats,
  useMolitComplexes,
  useMolitCoordinates,
  useMolitCoordinatesUpdated,
  useMolitCoordinatesSummary,
  useMolitStats,
  useMolitTransactions
} from '../utils/api'

// 새로운 최적화된 지도 API 훅
import { 
  useViewportMapData, 
  useMolitMapStats,
  useMapBoundsDebounce 
} from '../hooks/useMolitMapData'
import { useQueryClient } from 'react-query'
import dataManager from '../services/DataManager'
import { generateRandomCoords } from '../utils/kakaoMap'

// 새로운 컴포넌트들
import RegionTreeSelect from '../components/RegionTreeSelect'
import { getRegionCoords } from '../data/regions'

const MapView = () => {
  const queryClient = useQueryClient()
  const mapRef = useRef(null)
  const [map, setMap] = useState(null)
  const [markers, setMarkers] = useState([])
  const [selectedRegion, setSelectedRegion] = useState('')
  const [selectedComplex, setSelectedComplex] = useState(null)
  const [mapLoading, setMapLoading] = useState(true)
  const [mapError, setMapError] = useState(null)
  const [regionDialogOpen, setRegionDialogOpen] = useState(false)
  const [selectedTab, setSelectedTab] = useState(0) // 선택된 탭 인덱스
  const [householdFilter, setHouseholdFilter] = useState('all') // 세대수 필터: 'all', 'small', 'medium', 'large'
  const [transactionData, setTransactionData] = useState(null)
  const [transactionLoading, setTransactionLoading] = useState(false)
  const [coordinateData, setCoordinateData] = useState([])
  const [coordinatesLoading, setCoordinatesLoading] = useState(false)
  const [dataSource, setDataSource] = useState('integrated') // 'naver', 'molit', 'molit-updated', 'molit-optimized', 'integrated'
  const [mapBounds, setMapBounds] = useState(null)
  const [currentZoomLevel, setCurrentZoomLevel] = useState(8)
  const [dbStats, setDbStats] = useState({
    naver: { complexes: 0, listings: 0 },
    molit: { complexes: 0, transactions: 0 },
    molitUpdated: { complexes: 0, transactions: 0 },
    integrated: { complexes: 0 }
  })
  
  // 지역별 데이터 필터링을 위한 API 호출 파라미터
  const coordinateParams = {
    ...(selectedRegion && { region: selectedRegion }),
    limit: 500 // 지도용 좌표는 더 많이 가져오기
  }
  
  // 멀티 DB 데이터 소스별 조회
  const { data: naverCoordinates, isLoading: naverCoordinatesLoading, refetch: refetchNaverCoordinates } = useNaverCoordinates(coordinateParams)
  const { data: naverComplexes, isLoading: naverComplexesLoading, refetch: refetchNaverComplexes } = useNaverComplexes({
    limit: 100,
    ...(selectedRegion && { region: selectedRegion })
  })
  const { data: molitComplexes, isLoading: molitComplexesLoading, refetch: refetchMolitComplexes } = useMolitComplexes({
    limit: 100,
    ...(selectedRegion && { sigungu: selectedRegion })
  })
  const { data: molitCoordinates, isLoading: molitCoordinatesLoading, refetch: refetchMolitCoordinates } = useMolitCoordinates({
    limit: 100,
    ...(selectedRegion && { region: selectedRegion })
  })
  
  // 정확한 좌표가 매칭된 국토부 실거래가 데이터 (apt_master_info 기반)
  const { data: molitCoordinatesUpdated, isLoading: molitCoordinatesUpdatedLoading, refetch: refetchMolitCoordinatesUpdated } = useMolitCoordinatesUpdated({
    limit: 500,
    ...(selectedRegion && { region: selectedRegion })
  })
  
  // 디버깅: MOLIT 데이터 상태 로깅
  React.useEffect(() => {
    console.log('🔍 MOLIT 디버깅:', {
      molitCoordinates,
      loading: molitCoordinatesLoading,
      dataLength: molitCoordinates?.data?.length || 0
    })
  }, [molitCoordinates, molitCoordinatesLoading])
  const { data: integratedComplexes, isLoading: integratedLoading, refetch: refetchIntegrated } = useIntegratedComplexes({
    limit: 100,
    ...(selectedRegion && { region: selectedRegion })
  })
  
  // DB별 통계 데이터
  const { data: naverStats } = useNaverStats()
  const { data: molitStats } = useMolitStats()
  
  // 새로운 최적화된 지도 데이터
  const debouncedBounds = useMapBoundsDebounce(mapBounds, 500)
  const { data: optimizedMapData, isLoading: optimizedLoading, dataSource: currentDataSource, refetch: refetchOptimized } = useViewportMapData({
    bounds: debouncedBounds,
    zoom_level: currentZoomLevel,
    region: selectedRegion,
    limit: 50
  })
  const { data: optimizedStats } = useMolitMapStats(selectedRegion)

  // 선택된 단지의 상세 데이터 조회
  const { data: complexDetails, isLoading: complexDetailsLoading } = useIntegratedComplexDetails(
    selectedComplex?.id // 통합 데이터베이스의 id 사용
  )

  // DB별 통계 업데이트
  useEffect(() => {
    if (naverStats?.overview) {
      setDbStats(prev => ({
        ...prev,
        naver: {
          complexes: naverStats.overview.total_complexes || 0,
          listings: naverStats.overview.total_listings || 0
        }
      }))
    }
    if (molitStats?.overview) {
      setDbStats(prev => ({
        ...prev,
        molit: {
          complexes: molitStats.overview.total_complexes || 0,
          transactions: molitStats.overview.total_transactions || 0
        }
      }))
    }
    if (integratedComplexes?.data) {
      setDbStats(prev => ({
        ...prev,
        integrated: {
          complexes: integratedComplexes.data.length || 0
        }
      }))
    }
    if (molitCoordinatesUpdated?.data) {
      setDbStats(prev => ({
        ...prev,
        molitUpdated: {
          complexes: 0, // 업데이트된 MOLIT 데이터는 거래 데이터 기반
          transactions: molitCoordinatesUpdated.data.length || 0
        }
      }))
    }
  }, [naverStats, molitStats, integratedComplexes, molitCoordinatesUpdated])

  // 멀티 DB 좌표 데이터 통합 관리
  useEffect(() => {
    const integrateCoordinateData = async () => {
      setCoordinatesLoading(true)
      try {
        let activeData = []
        let activeSource = 'none'

        // 데이터 소스별 우선순위 처리
        switch (dataSource) {
          case 'molit-optimized':
            if (optimizedMapData?.length > 0) {
              console.log('🚀 최적화된 MOLIT 데이터 사용:', {
                count: optimizedMapData.length,
                dataSource: currentDataSource,
                zoomLevel: currentZoomLevel
              })
              
              const optimizedData = optimizedMapData.map(item => ({
                ...item,
                id: `optimized-${item.name}-${item.longitude}-${item.latitude}`,
                name: item.name || item.apartment_names?.[0] || '알 수 없는 단지',
                latitude: parseFloat(item.latitude || item.cluster_lat),
                longitude: parseFloat(item.longitude || item.cluster_lng),
                total_households: 0,
                total_buildings: 0,
                listing_count: item.transaction_count || item.total_transactions || item.marker_count || 0,
                detectedRegion: item.region_name || '최적화 데이터',
                source: 'molit-optimized',
                // 클러스터 관련 정보
                cluster_type: item.cluster_type || 'single',
                marker_count: item.marker_count || 1,
                apartment_names: item.apartment_names || [item.name],
                // 거래 통계
                sale_count: item.sale_count || 0,
                jeonse_count: item.jeonse_count || 0,
                monthly_count: item.monthly_count || 0,
                avg_deal_amount: item.avg_price || item.avg_deal_amount || 0
              }))
              
              activeData = optimizedData
              activeSource = 'molit-optimized'
            } else {
              console.log('📭 최적화된 MOLIT 데이터 없음')
            }
            break
            
          case 'naver':
            if (naverComplexes?.data?.length > 0) {
              // 네이버 DB에는 좌표가 없으므로 통합 DB와 매칭
              const naverData = naverComplexes.data.map(complex => {
                const integratedMatch = integratedComplexes?.data?.find(ic => 
                  ic.name === complex.name || ic.name === complex.complex_name
                )
                return {
                  ...complex,
                  name: complex.complex_name || complex.name,
                  latitude: integratedMatch?.latitude,
                  longitude: integratedMatch?.longitude,
                  source: 'naver'
                }
              }).filter(c => c.latitude && c.longitude)
              
              activeData = naverData
              activeSource = 'naver'
            }
            break
            
          case 'molit':
            if (molitCoordinates?.data?.length > 0) {
              console.log('🏗️ MOLIT 데이터 처리 시작:', {
                rawCount: molitCoordinates.data.length,
                coordinateAnalysis: molitCoordinates.coordinate_analysis,
                qualityNote: molitCoordinates.quality_note
              })
              
              // 새로운 MOLIT 좌표 API 사용 (97만건 실거래 데이터 기반)
              const molitData = molitCoordinates.data
                .filter(complex => {
                  // 유효한 좌표만 필터링
                  const hasValidCoords = complex.latitude && complex.longitude &&
                    complex.latitude >= 33.0 && complex.latitude <= 39.0 &&
                    complex.longitude >= 124.0 && complex.longitude <= 132.0
                  
                  if (!hasValidCoords) {
                    console.warn('⚠️ MOLIT 단지 좌표 무효:', {
                      name: complex.name,
                      latitude: complex.latitude,
                      longitude: complex.longitude
                    })
                  }
                  
                  return hasValidCoords
                })
                .map(complex => ({
                  ...complex,
                  name: complex.name || `MOLIT 단지 ${complex.id}`,
                  latitude: parseFloat(complex.latitude),
                  longitude: parseFloat(complex.longitude),
                  total_households: complex.total_households || 0,
                  total_buildings: complex.total_buildings || 0,
                  listing_count: complex.transaction_count || 0, // 실거래 건수를 매물 건수로 표시
                  detectedRegion: complex.sigungu || complex.sido || '국토부데이터',
                  source: 'molit'
                }))
              
              console.log('✅ MOLIT 데이터 처리 완료:', {
                originalCount: molitCoordinates.data.length,
                validCount: molitData.length,
                filteredOut: molitCoordinates.data.length - molitData.length
              })
              
              activeData = molitData
              activeSource = 'molit'
            } else {
              console.log('📭 MOLIT 좌표 데이터 없음:', {
                molitCoordinates: !!molitCoordinates,
                hasData: !!molitCoordinates?.data,
                dataLength: molitCoordinates?.data?.length || 0
              })
            }
            break
            
          case 'molit-updated':
            if (molitCoordinatesUpdated?.data?.length > 0) {
              console.log('🎯 정확한 좌표 MOLIT 데이터 처리 시작:', {
                rawCount: molitCoordinatesUpdated.data.length,
                coordinateSource: molitCoordinatesUpdated.coordinate_source
              })
              
              // apt_master_info에서 매칭된 정확한 좌표를 가진 MOLIT 실거래 데이터
              const molitUpdatedData = molitCoordinatesUpdated.data
                .filter(transaction => {
                  // 유효한 좌표만 필터링
                  const hasValidCoords = transaction.latitude && transaction.longitude &&
                    transaction.latitude >= 33.0 && transaction.latitude <= 39.0 &&
                    transaction.longitude >= 124.0 && transaction.longitude <= 132.0
                    
                  if (!hasValidCoords) {
                    console.warn('⚠️ 정확한 좌표 MOLIT 거래 무효:', {
                      apartment_name: transaction.apartment_name,
                      latitude: transaction.latitude,
                      longitude: transaction.longitude
                    })
                  }
                  
                  return hasValidCoords
                })
                .map(transaction => ({
                  ...transaction,
                  id: `molit-updated-${transaction.apartment_name}-${transaction.deal_date}`,
                  name: transaction.apartment_name || transaction.original_apt_name || `실거래 ${transaction.deal_date}`,
                  latitude: parseFloat(transaction.latitude),
                  longitude: parseFloat(transaction.longitude),
                  total_households: 0, // 실거래 데이터에는 세대수 정보 없음
                  total_buildings: 0,
                  listing_count: 1, // 각 거래는 1건으로 계산
                  detectedRegion: transaction.region_name || transaction.sigungu_name || '국토부실거래',
                  source: 'molit-updated',
                  // 추가 거래 정보
                  deal_amount: transaction.deal_amount,
                  deal_date: transaction.deal_date,
                  deal_type: transaction.deal_type,
                  area: transaction.area,
                  floor: transaction.floor,
                  coordinate_source: transaction.coordinate_source
                }))
              
              console.log('✅ 정확한 좌표 MOLIT 데이터 처리 완료:', {
                originalCount: molitCoordinatesUpdated.data.length,
                validCount: molitUpdatedData.length,
                filteredOut: molitCoordinatesUpdated.data.length - molitUpdatedData.length
              })
              
              activeData = molitUpdatedData
              activeSource = 'molit-updated'
            } else {
              console.log('📭 정확한 좌표 MOLIT 데이터 없음:', {
                molitCoordinatesUpdated: !!molitCoordinatesUpdated,
                hasData: !!molitCoordinatesUpdated?.data,
                dataLength: molitCoordinatesUpdated?.data?.length || 0
              })
            }
            break
            
          case 'integrated':
          default:
            if (integratedComplexes?.data) {
              const complexesWithCoords = integratedComplexes.data.filter(c => 
                c.latitude && c.longitude && 
                typeof c.latitude === 'number' && typeof c.longitude === 'number'
              ).map(c => ({ ...c, source: 'integrated' }))
              
              activeData = complexesWithCoords
              activeSource = 'integrated'
            }
            break
        }
        
        console.log(`🗺️ ${activeSource} 데이터 사용:`, activeData.length, '개 단지')
        setCoordinateData(activeData)
        
      } catch (error) {
        console.error('좌표 데이터 통합 실패:', error)
        setCoordinateData([])
      } finally {
        setCoordinatesLoading(false)
      }
    }

    integrateCoordinateData()
  }, [dataSource, naverComplexes, molitComplexes, molitCoordinates, molitCoordinatesUpdated, integratedComplexes, optimizedMapData])

  // 지역 변경시 데이터 새로고침
  useEffect(() => {
    const refreshData = async () => {
      if (refetchNaverCoordinates) refetchNaverCoordinates()
      if (refetchNaverComplexes) refetchNaverComplexes()
      if (refetchMolitComplexes) refetchMolitComplexes()
      if (refetchMolitCoordinates) refetchMolitCoordinates()
      if (refetchMolitCoordinatesUpdated) refetchMolitCoordinatesUpdated()
      if (refetchIntegrated) refetchIntegrated()
    }
    refreshData()
  }, [selectedRegion, refetchNaverCoordinates, refetchNaverComplexes, refetchMolitComplexes, refetchMolitCoordinates, refetchMolitCoordinatesUpdated, refetchIntegrated])

  // 카카오맵 스크립트 동적 로드
  useEffect(() => {
    const loadKakaoScript = () => {
      return new Promise((resolve, reject) => {
        // 이미 로드된 경우
        if (window.kakao && window.kakao.maps) {
          resolve()
          return
        }

        // 스크립트 태그 생성
        const script = document.createElement('script')
        script.type = 'text/javascript'
        script.src = `https://dapi.kakao.com/v2/maps/sdk.js?appkey=aaa8e2d31d0492266d2ff2e09b6ab804&libraries=services,clusterer,drawing&autoload=false`
        script.onload = () => {
          console.log('✅ 카카오맵 스크립트 로드 완료')
          // autoload=false이므로 수동으로 로드
          if (window.kakao && window.kakao.maps) {
            window.kakao.maps.load(() => {
              console.log('✅ 카카오맵 API 초기화 완료')
              resolve()
            })
          } else {
            reject(new Error('카카오 객체를 찾을 수 없습니다'))
          }
        }
        script.onerror = () => {
          console.error('❌ 카카오맵 스크립트 로드 실패')
          reject(new Error('카카오맵 스크립트 로드 실패'))
        }
        
        document.head.appendChild(script)
        console.log('🔄 카카오맵 스크립트 로딩 시작...')
      })
    }

    let retryCount = 0
    const maxRetries = 5
    
    const initializeMap = async () => {
      try {
        setMapLoading(true)
        setMapError(null)
        
        console.log(`🔄 카카오맵 초기화 시작... (시도 ${retryCount + 1}/${maxRetries})`)
        
        // DOM 컨테이너 확인
        console.log('mapRef:', mapRef)
        console.log('mapRef.current:', mapRef.current)
        console.log('DOM에서 지도 컨테이너 찾기:', document.getElementById('kakao-map-container'))
        
        if (!mapRef.current) {
          console.log('❌ 지도 컨테이너가 준비되지 않음. 재시도 중...')
          retryCount++
          if (retryCount < maxRetries) {
            setTimeout(initializeMap, 1000)
            return
          } else {
            throw new Error('지도 컨테이너를 찾을 수 없습니다')
          }
        }
        
        console.log('✅ 지도 컨테이너 확인됨')
        
        // 카카오맵 스크립트 로드
        await loadKakaoScript()
        
        console.log('✅ 카카오 SDK 확인됨')

        const container = mapRef.current
        const options = {
          center: new window.kakao.maps.LatLng(37.5665, 126.9780), // 서울 시청
          level: 8
        }

        console.log('🗺️ 지도 생성 중...')
        const kakaoMap = new window.kakao.maps.Map(container, options)
        setMap(kakaoMap)

        // 지도 클릭 이벤트
        window.kakao.maps.event.addListener(kakaoMap, 'click', () => {
          setSelectedComplex(null)
        })

        // 지도 영역 변경 이벤트 (뷰포트 기반 로딩용)
        window.kakao.maps.event.addListener(kakaoMap, 'bounds_changed', () => {
          const bounds = kakaoMap.getBounds()
          const level = kakaoMap.getLevel()
          
          setMapBounds({
            north: bounds.getNorthEast().getLat(),
            south: bounds.getSouthWest().getLat(),
            east: bounds.getNorthEast().getLng(),
            west: bounds.getSouthWest().getLng()
          })
          setCurrentZoomLevel(level)
        })

        console.log('✅ 카카오맵 초기화 완료')
        setMapLoading(false)
        
      } catch (error) {
        console.error('❌ 카카오맵 초기화 실패:', error)
        retryCount++
        if (retryCount < maxRetries) {
          console.log(`🔄 ${retryCount}/${maxRetries} 재시도 중...`)
          setTimeout(initializeMap, 2000)
        } else {
          setMapError(error.message)
          setMapLoading(false)
        }
      }
    }

    // DOM이 준비된 후 초기화 시작
    const timer = setTimeout(initializeMap, 100)
    return () => clearTimeout(timer)
  }, [])

  // 마커 생성 및 표시 (멀티 DB 좌표 데이터 사용)
  useEffect(() => {
    if (!map || !coordinateData?.length || !window.kakao) {
      console.log('마커 생성 조건 확인:', {
        map: !!map,
        coordinateData: !!coordinateData?.length,
        kakao: !!window.kakao,
        dataLength: coordinateData?.length
      })
      return
    }

    const createMarkers = async () => {
      try {
        console.log('🔄 마커 생성 시작:', coordinateData.length, '개 단지')
        
        // 기존 마커 제거
        markers.forEach(marker => marker.setMap(null))

        const newMarkers = []
        
        // 세대수 필터링 적용
        const filteredComplexes = coordinateData.filter(complex => {
          if (householdFilter === 'all') return true
          
          const households = parseInt(complex.total_households) || 0
          console.log(`필터링 중: ${complex.name}, 세대수: ${households}, 필터: ${householdFilter}`)
          
          switch (householdFilter) {
            case 'small': return households > 0 && households <= 200
            case 'medium': return households > 200 && households <= 500
            case 'large': return households > 500
            default: return true
          }
        })
        
        console.log(`필터링 결과: ${filteredComplexes.length}개 단지 (필터: ${householdFilter})`)
        
        // 🔧 좌표 검증 강화 - DB 저장된 좌표 사용
        const complexesWithCoords = filteredComplexes.slice(0, 50).map((complex, index) => {
          // 좌표 유효성 검증
          const hasValidCoords = 
            complex.latitude && 
            complex.longitude && 
            typeof complex.latitude === 'number' &&
            typeof complex.longitude === 'number' &&
            complex.latitude >= 33.0 && complex.latitude <= 39.0 &&
            complex.longitude >= 124.0 && complex.longitude <= 132.0

          let coords = null
          if (hasValidCoords) {
            coords = {
              lat: parseFloat(complex.latitude),
              lng: parseFloat(complex.longitude)
            }
          } else {
            console.warn(`⚠️ 단지 ${complex.id} (${complex.name}): 유효하지 않은 좌표`, {
              latitude: complex.latitude,
              longitude: complex.longitude,
              type_lat: typeof complex.latitude,
              type_lng: typeof complex.longitude
            })
            // 유효하지 않은 좌표일 경우 null로 설정 (마커 생성 스킵)
            coords = null
          }
          
          const detectedRegion = complex.sigungu || complex.sido || '위치정보없음'
          
          if (coords) {
            console.log(`✅ 단지 ${complex.id} 좌표 검증 완료:`, {
              name: complex.name,
              coords,
              region: detectedRegion
            })
          }
          
          return {
            ...complex,
            coordinate: coords,
            detectedRegion,
            hasValidCoordinates: hasValidCoords
          }
        }).filter(complex => complex.hasValidCoordinates) // 유효한 좌표만 필터링

        console.log('📍 좌표 매핑 완료:', complexesWithCoords.length, '개 단지')

        // 🔧 안전한 마커 생성 with 추가 검증
        for (const complexData of complexesWithCoords) {
          try {
            // 마커 생성 직전 최종 검증
            if (!complexData.coordinate || 
                !complexData.coordinate.lat || 
                !complexData.coordinate.lng ||
                isNaN(complexData.coordinate.lat) ||
                isNaN(complexData.coordinate.lng)) {
              console.warn(`🚫 마커 생성 스킵 (단지 ${complexData.id}): 좌표 불완전`, complexData.coordinate)
              continue
            }

            const position = new window.kakao.maps.LatLng(
              complexData.coordinate.lat, 
              complexData.coordinate.lng
            )
            
            console.log(`🎯 마커 생성 중 (단지 ${complexData.id}):`, {
              name: complexData.name,
              position: { lat: complexData.coordinate.lat, lng: complexData.coordinate.lng },
              region: complexData.detectedRegion
            })
            
            // 마커 생성
            const marker = new window.kakao.maps.Marker({
              position: position,
              map: map
            })

            // 정보창 생성
            const complexName = complexData.name && complexData.name !== '정보없음' 
              ? complexData.name 
              : `단지 ${complexData.id}`
            
            const infoWindow = new window.kakao.maps.InfoWindow({
              content: `
                <div style="padding: 15px; min-width: 280px; max-width: 320px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
                  <h4 style="margin: 0 0 8px 0; color: #333; font-size: 16px; font-weight: bold;">
                    ${complexName}
                    ${complexData.cluster_type === 'cluster' ? 
                      `<span style="background: #ff5722; color: white; font-size: 10px; padding: 2px 6px; border-radius: 10px; margin-left: 5px;">
                        클러스터 ${complexData.marker_count}개
                      </span>` : ''
                    }
                  </h4>
                  ${complexData.detectedRegion ? 
                    `<p style="margin: 0 0 5px 0; color: #2196F3; font-size: 13px; font-weight: bold;">
                      📍 ${complexData.detectedRegion}
                    </p>` : ''
                  }
                  <p style="margin: 0 0 5px 0; color: #666; font-size: 13px;">
                    🏢 ${complexData.total_buildings || '정보없음'}동 ${complexData.total_households || '정보없음'}세대
                  </p>
                  <p style="margin: 0 0 5px 0; color: #666; font-size: 13px; font-weight: bold;">
                    ${complexData.source === 'molit' || complexData.source === 'molit-updated' || complexData.source === 'molit-optimized' ? '💰 실거래 ' : '🏠 매물 '}${complexData.listing_count || 0}개
                    ${complexData.source === 'molit-updated' ? ' <span style="color: #4caf50; font-size: 10px;">✓정확좌표</span>' : ''}
                    ${complexData.source === 'molit-optimized' ? ' <span style="color: #ff5722; font-size: 10px;">🚀최적화</span>' : ''}
                  </p>
                  ${complexData.avg_deal_amount > 0 ? 
                    `<p style="margin: 0 0 5px 0; color: #f57c00; font-size: 12px; font-weight: bold;">
                      💵 평균 ${(complexData.avg_deal_amount / 10000).toFixed(0)}억원
                    </p>` : ''
                  }
                  ${complexData.sale_count > 0 || complexData.jeonse_count > 0 || complexData.monthly_count > 0 ? 
                    `<p style="margin: 0 0 5px 0; color: #666; font-size: 11px;">
                      매매 ${complexData.sale_count || 0} | 전세 ${complexData.jeonse_count || 0} | 월세 ${complexData.monthly_count || 0}
                    </p>` : ''
                  }
                  ${complexData.completion_year ? 
                    `<p style="margin: 0 0 5px 0; color: #666; font-size: 12px;">
                      🏗️ ${complexData.completion_year}년 준공
                    </p>` : ''
                  }
                  ${complexData.apartment_names && complexData.apartment_names.length > 1 ? 
                    `<p style="margin: 0 0 5px 0; color: #999; font-size: 10px;">
                      포함: ${complexData.apartment_names.slice(1, 4).join(', ')}${complexData.apartment_names.length > 4 ? '...' : ''}
                    </p>` : ''
                  }
                  <p style="margin: 0; color: #999; font-size: 11px;">
                    클릭하여 상세정보 보기
                  </p>
                </div>
              `
            })

            // 마커 클릭 이벤트
            window.kakao.maps.event.addListener(marker, 'click', () => {
              console.log('마커 클릭됨:', complexData.id)
              
              // 기존 정보창 닫기
              markers.forEach(m => m.infoWindow && m.infoWindow.close())
              
              // 새 정보창 열기
              infoWindow.open(map, marker)
              
              // 선택된 단지 정보 설정
              setSelectedComplex(complexData)
            })

            marker.infoWindow = infoWindow
            newMarkers.push(marker)
            
          } catch (markerError) {
            console.error(`❌ 마커 생성 실패 (단지 ${complexData.id}):`, {
              error: markerError.message,
              coordinates: complexData.coordinate,
              name: complexData.name,
              stack: markerError.stack
            })
          }
        }

        setMarkers(newMarkers)
        console.log(`✅ 마커 생성 완료: ${newMarkers.length}개/${complexesWithCoords.length}개 (실패: ${complexesWithCoords.length - newMarkers.length}개)`)
        
      } catch (error) {
        console.error('❌ 마커 생성 전체 실패:', error)
      }
    }

    createMarkers()
  }, [map, coordinateData, householdFilter])

  // 지역 필터 변경
  const handleRegionChange = (regionName, regionCoords = null) => {
    setSelectedRegion(regionName)
    setRegionDialogOpen(false)
    
    // 해당 지역으로 지도 이동
    if (map && regionName && window.kakao) {
      const coords = regionCoords || getRegionCoords(regionName)
      if (coords) {
        const moveLatLon = new window.kakao.maps.LatLng(coords.lat, coords.lng)
        map.setCenter(moveLatLon)
        
        // 지역 타입에 따라 줌 레벨 조정
        if (regionName.includes('특별시') || regionName.includes('광역시')) {
          map.setLevel(7) // 광역시/특별시
        } else if (regionName.includes('도')) {
          map.setLevel(9) // 도 전체
        } else {
          map.setLevel(5) // 시/군/구
        }
      }
    } else if (map && !regionName && window.kakao) {
      // 전체 선택시 서울 시청으로 이동
      const moveLatLon = new window.kakao.maps.LatLng(37.5665, 126.9780)
      map.setCenter(moveLatLon)
      map.setLevel(8)
    }
  }

  // 데이터 없는 지역 체크
  const hasNoData = selectedRegion && coordinateData && coordinateData.length === 0

  // 지도 새로고침
  const handleMapRefresh = () => {
    if (map && window.kakao) {
      // 서울 시청으로 이동
      const moveLatLon = new window.kakao.maps.LatLng(37.5665, 126.9780)
      map.setCenter(moveLatLon)
      map.setLevel(8)
      setSelectedRegion('')
      setSelectedComplex(null)
    }
  }

  // 조건부 렌더링 제거 - 지도는 항상 렌더링되어야 함

  return (
    <Box sx={{ flexGrow: 1 }}>
      {/* 헤더 */}
      <Box sx={{ mb: 3 }}>
        <Typography variant="h4" component="h1" gutterBottom>
          🗺️ 지도 보기
        </Typography>
        <Typography variant="body1" color="text.secondary">
          단지별 위치와 매물 정보를 지도에서 확인하세요
        </Typography>
      </Box>

      {/* 데이터 소스 선택 */}
      <Box sx={{ mb: 2, display: 'flex', gap: 2, alignItems: 'center', flexWrap: 'wrap' }}>        
        <Paper sx={{ p: 1 }}>          
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>            
            <Typography variant="body2" color="text.secondary">
              데이터 소스:
            </Typography>
            <ButtonGroup size="small" variant={dataSource === 'integrated' ? 'contained' : 'outlined'}>
              <Button
                variant={dataSource === 'integrated' ? 'contained' : 'outlined'}
                onClick={() => setDataSource('integrated')}
                size="small"
              >
                통합 ({dbStats.integrated.complexes})
              </Button>
              <Button
                variant={dataSource === 'naver' ? 'contained' : 'outlined'}
                onClick={() => setDataSource('naver')}
                size="small"
              >
                네이버 ({dbStats.naver.complexes})
              </Button>
              <Button
                variant={dataSource === 'molit' ? 'contained' : 'outlined'}
                onClick={() => setDataSource('molit')}
                size="small"
                title={molitCoordinates?.coordinate_analysis ? 
                  `총 ${molitCoordinates.coordinate_analysis.total}개 중 유효 좌표 ${molitCoordinates.coordinate_analysis.valid}개` : 
                  '국토부 실거래 데이터'}
              >
                국토부 ({molitCoordinates?.coordinate_analysis?.valid || molitCoordinates?.data?.length || 0})
                {molitCoordinates?.coordinate_analysis?.invalid > 0 && (
                  <sup style={{ color: 'orange', fontSize: '10px' }}>
                    !{molitCoordinates.coordinate_analysis.invalid}
                  </sup>
                )}
              </Button>
              <Button
                variant={dataSource === 'molit-updated' ? 'contained' : 'outlined'}
                onClick={() => setDataSource('molit-updated')}
                size="small"
                title="apt_master_info와 매칭된 정확한 좌표의 국토부 실거래 데이터"
                style={{ 
                  backgroundColor: dataSource === 'molit-updated' ? '#4caf50' : 'transparent',
                  borderColor: '#4caf50',
                  color: dataSource === 'molit-updated' ? 'white' : '#4caf50'
                }}
              >
                정확한좌표 국토부 ({dbStats.molitUpdated.transactions})
                <sup style={{ color: dataSource === 'molit-updated' ? '#90ee90' : '#4caf50', fontSize: '10px' }}>
                  ✓
                </sup>
              </Button>
              <Button
                variant={dataSource === 'molit-optimized' ? 'contained' : 'outlined'}
                onClick={() => setDataSource('molit-optimized')}
                size="small"
                title="뷰포트 기반 최적화된 국토부 실거래 데이터 (클러스터링 지원)"
                style={{ 
                  backgroundColor: dataSource === 'molit-optimized' ? '#ff5722' : 'transparent',
                  borderColor: '#ff5722',
                  color: dataSource === 'molit-optimized' ? 'white' : '#ff5722'
                }}
              >
                최적화 국토부 ({optimizedMapData?.length || 0})
                <sup style={{ color: dataSource === 'molit-optimized' ? '#ffcc80' : '#ff5722', fontSize: '10px' }}>
                  🚀
                </sup>
                {currentDataSource === 'cluster' && (
                  <sup style={{ color: dataSource === 'molit-optimized' ? '#ffcc80' : '#ff5722', fontSize: '8px', marginLeft: '2px' }}>
                    클러스터
                  </sup>
                )}
              </Button>
              <Button
                variant="text"
                size="small"
                onClick={() => {
                  console.log('🔄 완전한 캐시 클리어 및 새로고침')
                  queryClient.invalidateQueries(['molitCoordinates'])
                  queryClient.refetchQueries(['molitCoordinates'])
                  refetchMolitCoordinates()
                }}
                style={{ fontSize: '10px', minWidth: '40px' }}
              >
                새로고침
              </Button>
            </ButtonGroup>
          </Box>
        </Paper>
      </Box>

      {/* 필터 영역 */}
      <Box sx={{ mb: 2, display: 'flex', gap: 2, alignItems: 'center', flexWrap: 'wrap' }}>
        <Button
          variant="outlined"
          startIcon={<MapIcon />}
          onClick={() => setRegionDialogOpen(true)}
          sx={{ minWidth: 200 }}
        >
          {selectedRegion || '지역 선택'}
        </Button>
        
        {selectedRegion && (
          <Chip
            label={`📍 ${selectedRegion}`}
            onDelete={() => handleRegionChange('')}
            color="primary"
            variant="outlined"
          />
        )}
        
        {/* 세대수 필터 */}
        <Paper sx={{ p: 1 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <FilterList sx={{ fontSize: 18, color: 'text.secondary' }} />
            <Typography variant="body2" color="text.secondary">
              세대수:
            </Typography>
            <ButtonGroup size="small" variant={householdFilter === 'all' ? 'contained' : 'outlined'}>
              <Button
                variant={householdFilter === 'all' ? 'contained' : 'outlined'}
                onClick={() => setHouseholdFilter('all')}
                size="small"
              >
                전체
              </Button>
              <Button
                variant={householdFilter === 'small' ? 'contained' : 'outlined'}
                onClick={() => setHouseholdFilter('small')}
                size="small"
              >
                200세대 이하
              </Button>
              <Button
                variant={householdFilter === 'medium' ? 'contained' : 'outlined'}
                onClick={() => setHouseholdFilter('medium')}
                size="small"
              >
                200~500세대
              </Button>
              <Button
                variant={householdFilter === 'large' ? 'contained' : 'outlined'}
                onClick={() => setHouseholdFilter('large')}
                size="small"
              >
                500세대 이상
              </Button>
            </ButtonGroup>
          </Box>
        </Paper>
        
        <Button
          variant="outlined"
          startIcon={<Refresh />}
          onClick={handleMapRefresh}
        >
          지도 초기화
        </Button>
      </Box>

      {/* 데이터 없는 지역 안내 */}
      {hasNoData && (
        <Alert severity="info" sx={{ mb: 2 }}>
          <Typography variant="body1">
            <strong>"{selectedRegion}"</strong> 지역에는 현재 수집된 부동산 데이터가 없습니다.
          </Typography>
          <Typography variant="body2" sx={{ mt: 1 }}>
            다른 지역을 선택하거나 전체 보기로 변경해보세요. 
            현재 데이터가 있는 주요 지역: 대전(43,631개 매물), 마포(104개 매물)
          </Typography>
        </Alert>
      )}

      {/* 지도 및 정보 패널 */}
      <Box sx={{ display: 'flex', gap: 2, height: '70vh' }}>
        {/* 지도 영역 */}
        <Box sx={{ flex: 1 }}>
          <Card sx={{ height: '100%' }}>
            <CardContent sx={{ height: '100%', p: 0 }}>
              <div 
                id="kakao-map-container"
                ref={mapRef} 
                style={{ 
                  width: '100%', 
                  height: '100%',
                  borderRadius: '12px',
                  minHeight: '500px',
                  position: 'relative'
                }}
              >
                {mapLoading && (
                  <Box 
                    position="absolute" 
                    top="50%" 
                    left="50%" 
                    sx={{ transform: 'translate(-50%, -50%)' }}
                    display="flex" 
                    flexDirection="column"
                    alignItems="center"
                    textAlign="center"
                    p={3}
                    bgcolor="rgba(255,255,255,0.9)"
                    borderRadius={2}
                  >
                    <CircularProgress />
                    <Typography variant="body1" sx={{ mt: 2, mb: 1 }}>
                      🗺️ 카카오맵 초기화 중...
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      지도와 부동산 데이터를 로딩하고 있습니다
                    </Typography>
                  </Box>
                )}
                
                {!mapLoading && coordinatesLoading && (
                  <Box 
                    position="absolute" 
                    top="10px" 
                    right="10px"
                    display="flex" 
                    alignItems="center"
                    bgcolor="rgba(255,255,255,0.9)"
                    p={2}
                    borderRadius={1}
                  >
                    <CircularProgress size={20} />
                    <Typography variant="body2" sx={{ ml: 1 }}>
                      📍 마커 로딩 중...
                    </Typography>
                  </Box>
                )}
                
                {mapError && (
                  <Alert severity="error" sx={{ m: 2, position: 'absolute', top: 0, left: 0, right: 0 }}>
                    <Typography variant="h6" gutterBottom>
                      카카오맵 로드 실패
                    </Typography>
                    <Typography variant="body2">
                      오류: {mapError}
                    </Typography>
                  </Alert>
                )}
              </div>
            </CardContent>
          </Card>
        </Box>

        {/* 정보 패널 */}
        <Box sx={{ width: 400 }}>
          <Card sx={{ height: '100%' }}>
            <CardContent sx={{ height: '100%', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
              {/* 지역별 통계 */}
              <Box sx={{ mb: 2 }}>
                <Typography variant="h6" gutterBottom>
                  📊 {selectedRegion || '전체'} 지역 현황
                </Typography>
                <Stack direction="row" spacing={1} flexWrap="wrap" sx={{ mb: 2 }}>
                  <Chip 
                    icon={<Home />} 
                    label={`단지 ${coordinateData?.length || 0}개`}
                    size="small" 
                    color="primary" 
                    variant="outlined"
                  />
                  <Chip 
                    icon={<AttachMoney />} 
                    label={`${dataSource === 'naver' ? '네이버' : 
                              dataSource === 'molit' ? '국토부' : 
                              dataSource === 'molit-updated' ? '정확좌표 국토부' : 
                              '통합'} ${coordinateData?.length || 0}개`}
                    size="small" 
                    color={dataSource === 'naver' ? 'primary' : 
                           dataSource === 'molit' ? 'warning' : 
                           dataSource === 'molit-updated' ? 'success' :
                           'secondary'} 
                    variant="outlined"
                  />
                </Stack>
                {selectedRegion && (
                  <Typography variant="body2" color="text.secondary">
                    💡 {selectedRegion} 지역으로 필터링된 결과입니다
                  </Typography>
                )}
              </Box>

              {/* 아파트단지 목록 */}
              {!selectedComplex && (
                <Box sx={{ flexGrow: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
                  <Typography variant="h6" gutterBottom sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    🏢 아파트단지 목록
                    <Chip label={coordinateData?.length || 0} size="small" color="primary" />
                  </Typography>
                  
                  <Box sx={{ flexGrow: 1, overflow: 'auto', pr: 1 }}>
                    {coordinateData?.length > 0 ? (
                      <Stack spacing={1}>
                        {coordinateData.slice(0, 20).map((complex, index) => (
                          <Card 
                            key={complex.id || index} 
                            variant="outlined" 
                            sx={{ 
                              cursor: 'pointer',
                              transition: 'all 0.2s',
                              '&:hover': {
                                bgcolor: 'action.hover',
                                boxShadow: 1
                              }
                            }}
                            onClick={() => {
                              // 지도에서 해당 단지로 이동
                              if (map && window.kakao && complex.latitude && complex.longitude) {
                                const moveLatLon = new window.kakao.maps.LatLng(complex.latitude, complex.longitude)
                                map.setCenter(moveLatLon)
                                map.setLevel(3) // 줌인
                                
                                // 해당 마커 클릭 이벤트 트리거
                                setSelectedComplex(complex)
                              }
                            }}
                          >
                            <CardContent sx={{ p: 1.5, '&:last-child': { pb: 1.5 } }}>
                              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                                <Box sx={{ flexGrow: 1, minWidth: 0 }}>
                                  <Typography 
                                    variant="body2" 
                                    fontWeight="medium"
                                    sx={{ 
                                      overflow: 'hidden',
                                      textOverflow: 'ellipsis',
                                      whiteSpace: 'nowrap',
                                      mb: 0.5
                                    }}
                                    title={complex.name}
                                  >
                                    {complex.name || `단지 ${complex.id}`}
                                  </Typography>
                                  
                                  <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 0.5 }}>
                                    📍 {complex.detectedRegion || complex.sigungu || complex.sido || '위치정보없음'}
                                  </Typography>
                                  
                                  <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
                                    {complex.total_households && (
                                      <Chip 
                                        label={`${complex.total_households}세대`}
                                        size="small"
                                        variant="outlined"
                                        sx={{ fontSize: '10px', height: '20px' }}
                                      />
                                    )}
                                    {complex.listing_count > 0 && (
                                      <Chip 
                                        label={`${complex.source === 'molit' || complex.source === 'molit-updated' ? '실거래' : '매물'} ${complex.listing_count}건`}
                                        size="small"
                                        color={complex.source === 'molit' ? 'warning' : 
                                               complex.source === 'molit-updated' ? 'success' : 'primary'}
                                        variant="outlined"
                                        sx={{ fontSize: '10px', height: '20px' }}
                                      />
                                    )}
                                  </Box>
                                </Box>
                                
                                <LocationOn 
                                  sx={{ 
                                    fontSize: 16, 
                                    color: complex.source === 'molit' ? 'warning.main' : 
                                           complex.source === 'molit-updated' ? 'success.main' :
                                           complex.source === 'naver' ? 'primary.main' : 'secondary.main',
                                    ml: 1,
                                    flexShrink: 0
                                  }} 
                                />
                              </Box>
                            </CardContent>
                          </Card>
                        ))}
                        
                        {coordinateData.length > 20 && (
                          <Box sx={{ textAlign: 'center', py: 1 }}>
                            <Typography variant="caption" color="text.secondary">
                              상위 20개 단지만 표시됨 (전체 {coordinateData.length}개)
                            </Typography>
                          </Box>
                        )}
                      </Stack>
                    ) : (
                      <Box sx={{ textAlign: 'center', py: 4 }}>
                        <Home sx={{ fontSize: 48, color: 'text.secondary', mb: 2 }} />
                        <Typography variant="body1" color="text.secondary">
                          표시할 아파트단지가 없습니다
                        </Typography>
                        <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
                          다른 지역을 선택하거나<br />
                          데이터 소스를 변경해보세요
                        </Typography>
                      </Box>
                    )}
                  </Box>
                </Box>
              )}
              
              {/* 선택된 단지 정보 */}
              {selectedComplex ? (
                <Box sx={{ flexGrow: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2 }}>
                    <Typography variant="h6" fontWeight="bold" sx={{ flexGrow: 1, minWidth: 0 }}>
                      {selectedComplex.name || `단지 ${selectedComplex.id}`}
                    </Typography>
                    <Button
                      size="small"
                      variant="outlined"
                      onClick={() => setSelectedComplex(null)}
                      sx={{ ml: 1, flexShrink: 0 }}
                    >
                      목록으로
                    </Button>
                  </Box>
                  
                  {/* 탭 네비게이션 */}
                  <Tabs
                    value={selectedTab}
                    onChange={(event, newValue) => setSelectedTab(newValue)}
                    sx={{ mb: 2 }}
                    variant="fullWidth"
                  >
                    <Tab icon={<Info />} label="단지정보" />
                    <Tab icon={<TrendingUp />} label="실거래가" />
                    <Tab icon={<ShoppingCart />} label="매물호가" />
                  </Tabs>
                  
                  <Divider sx={{ mb: 2 }} />
                  
                  {/* 탭 내용 */}
                  <Box sx={{ flexGrow: 1, overflow: 'auto' }}>
                  {selectedTab === 0 && (
                    <Stack spacing={2}>
                      {selectedComplex.detectedRegion && (
                        <Box>
                          <Typography variant="body2" color="text.secondary">
                            📍 지역
                          </Typography>
                          <Typography variant="body1" color="primary" fontWeight="medium">
                            {selectedComplex.detectedRegion}
                          </Typography>
                        </Box>
                      )}
                      
                      <Box>
                        <Typography variant="body2" color="text.secondary">
                          🏢 규모
                        </Typography>
                        <Typography variant="body1">
                          {selectedComplex.total_buildings || '정보 없음'}동, {selectedComplex.total_households || '정보 없음'}세대
                        </Typography>
                      </Box>
                      
                      <Box>
                        <Typography variant="body2" color="text.secondary">
                          🏗️ 준공년도
                        </Typography>
                        <Typography variant="body1">
                          {selectedComplex.completion_year || '정보 없음'}
                        </Typography>
                      </Box>
                      
                      <Box>
                        <Typography variant="body2" color="text.secondary">
                          🔧 단지 ID
                        </Typography>
                        <Typography variant="body1">
                          {selectedComplex.id}
                        </Typography>
                      </Box>
                      
                      {selectedComplex.coordinate && (
                        <Box>
                          <Typography variant="body2" color="text.secondary">
                            🗺️ 좌표
                          </Typography>
                          <Typography variant="caption" color="text.secondary">
                            위도: {selectedComplex.coordinate.lat.toFixed(4)}<br />
                            경도: {selectedComplex.coordinate.lng.toFixed(4)}
                          </Typography>
                        </Box>
                      )}
                    </Stack>
                  )}
                  
                  {selectedTab === 1 && (
                    <Box>
                      <Typography variant="body1" color="text.secondary" sx={{ mb: 2 }}>
                        📈 최근 실거래가 내역
                      </Typography>
                      
                      {complexDetailsLoading ? (
                        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', py: 3 }}>
                          <CircularProgress size={24} sx={{ mr: 1 }} />
                          <Typography variant="body2">거래 데이터 로딩 중...</Typography>
                        </Box>
                      ) : complexDetails?.recent_transactions?.length > 0 ? (
                        <Box>
                          <Stack spacing={1} sx={{ mb: 2 }}>
                            <Typography variant="body2" color="text.secondary">
                              💰 평균 거래가: {complexDetails.price_analysis?.avg_transaction_price ? 
                                `${(complexDetails.price_analysis.avg_transaction_price / 10000).toFixed(0)}억원` : 
                                '정보 없음'}
                            </Typography>
                            <Typography variant="body2" color="text.secondary">
                              📊 총 {complexDetails.recent_transactions.length}건 거래
                            </Typography>
                          </Stack>
                          
                          <Table size="small">
                            <TableHead>
                              <TableRow>
                                <TableCell>거래일</TableCell>
                                <TableCell>거래가</TableCell>
                                <TableCell>면적</TableCell>
                                <TableCell>층</TableCell>
                              </TableRow>
                            </TableHead>
                            <TableBody>
                              {complexDetails.recent_transactions.slice(0, 5).map((transaction, index) => (
                                <TableRow key={index}>
                                  <TableCell>
                                    <Typography variant="caption">
                                      {new Date(transaction.deal_date).toLocaleDateString('ko-KR')}
                                    </Typography>
                                  </TableCell>
                                  <TableCell>
                                    <Typography variant="body2" fontWeight="medium">
                                      {transaction.deal_amount ? 
                                        `${(transaction.deal_amount / 10000).toFixed(0)}억` : 
                                        '미공개'}
                                    </Typography>
                                  </TableCell>
                                  <TableCell>
                                    <Typography variant="caption">
                                      {transaction.area_exclusive ? `${transaction.area_exclusive}㎡` : '-'}
                                    </Typography>
                                  </TableCell>
                                  <TableCell>
                                    <Typography variant="caption">
                                      {transaction.floor_current ? `${transaction.floor_current}층` : '-'}
                                    </Typography>
                                  </TableCell>
                                </TableRow>
                              ))}
                            </TableBody>
                          </Table>
                          
                          {complexDetails.recent_transactions.length > 5 && (
                            <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: 'block' }}>
                              * 최근 5건만 표시됨 (전체 {complexDetails.recent_transactions.length}건)
                            </Typography>
                          )}
                        </Box>
                      ) : (
                        <Alert severity="info">
                          해당 단지의 최근 실거래 데이터가 없습니다.
                          <br />
                          국토부 실거래가 데이터 연결을 위해 통합 시스템을 구축 중입니다.
                        </Alert>
                      )}
                    </Box>
                  )}
                  
                  {selectedTab === 2 && (
                    <Box>
                      <Typography variant="body1" color="text.secondary" sx={{ mb: 2 }}>
                        🏠 현재 매물 호가 정보
                      </Typography>
                      
                      {complexDetailsLoading ? (
                        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', py: 3 }}>
                          <CircularProgress size={24} sx={{ mr: 1 }} />
                          <Typography variant="body2">매물 데이터 로딩 중...</Typography>
                        </Box>
                      ) : complexDetails?.current_listings?.length > 0 ? (
                        <Box>
                          <Stack spacing={1} sx={{ mb: 2 }}>
                            <Typography variant="body2" color="text.secondary">
                              💰 평균 매물가: {complexDetails.price_analysis?.avg_listing_price ? 
                                `${(complexDetails.price_analysis.avg_listing_price / 10000).toFixed(0)}억원` : 
                                '정보 없음'}
                            </Typography>
                            <Typography variant="body2" color="text.secondary">
                              🏠 총 {complexDetails.current_listings.length}건 매물
                            </Typography>
                          </Stack>
                          
                          <Table size="small">
                            <TableHead>
                              <TableRow>
                                <TableCell>거래유형</TableCell>
                                <TableCell>가격</TableCell>
                                <TableCell>면적</TableCell>
                                <TableCell>층</TableCell>
                              </TableRow>
                            </TableHead>
                            <TableBody>
                              {complexDetails.current_listings.slice(0, 5).map((listing, index) => (
                                <TableRow key={index}>
                                  <TableCell>
                                    <Chip 
                                      label={listing.deal_type || '매매'} 
                                      size="small" 
                                      color={listing.deal_type === '전세' ? 'secondary' : 
                                             listing.deal_type === '월세' ? 'warning' : 'primary'}
                                      variant="outlined"
                                    />
                                  </TableCell>
                                  <TableCell>
                                    <Typography variant="body2" fontWeight="medium">
                                      {listing.price_sale ? 
                                        `${(listing.price_sale / 10000).toFixed(0)}억` : 
                                        listing.price_jeonse ? 
                                        `전세 ${(listing.price_jeonse / 10000).toFixed(0)}억` :
                                        listing.price_monthly ?
                                        `월세 ${listing.price_monthly}만원` : '미공개'}
                                    </Typography>
                                  </TableCell>
                                  <TableCell>
                                    <Typography variant="caption">
                                      {listing.area_exclusive ? `${listing.area_exclusive}㎡` : '-'}
                                    </Typography>
                                  </TableCell>
                                  <TableCell>
                                    <Typography variant="caption">
                                      {listing.floor_current ? `${listing.floor_current}층` : '-'}
                                    </Typography>
                                  </TableCell>
                                </TableRow>
                              ))}
                            </TableBody>
                          </Table>
                          
                          {complexDetails.current_listings.length > 5 && (
                            <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: 'block' }}>
                              * 최근 5건만 표시됨 (전체 {complexDetails.current_listings.length}건)
                            </Typography>
                          )}
                        </Box>
                      ) : (
                        <Alert severity="info">
                          해당 단지의 현재 매물 정보가 없습니다.
                          <br />
                          네이버 부동산 크롤링 데이터를 통합 시스템에 연결 중입니다.
                        </Alert>
                      )}
                    </Box>
                  )}
                  </Box>
                </Box>
              ) : (
                <Box sx={{ textAlign: 'center', py: 4 }}>
                  <LocationOn sx={{ fontSize: 48, color: 'text.secondary', mb: 2 }} />
                  <Typography variant="h6" gutterBottom>
                    🏢 단지 정보
                  </Typography>
                  <Typography variant="body1" color="text.secondary">
                    지도에서 마커를 클릭하여
                    <br />
                    단지별 상세정보를 확인하세요
                  </Typography>
                  <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
                    • 단지 기본정보<br />
                    • 5년간 실거래가 추이<br />
                    • 현재 매물 호가
                  </Typography>
                </Box>
              )}
            </CardContent>
          </Card>
        </Box>
      </Box>

      {/* 지역 선택 다이얼로그 */}
      <Dialog
        open={regionDialogOpen}
        onClose={() => setRegionDialogOpen(false)}
        maxWidth="md"
        fullWidth
      >
        <DialogTitle>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <Typography variant="h6">
              🗺️ 지역 선택
            </Typography>
            <IconButton onClick={() => setRegionDialogOpen(false)}>
              <Close />
            </IconButton>
          </Box>
        </DialogTitle>
        <DialogContent>
          <RegionTreeSelect
            value={selectedRegion}
            onChange={handleRegionChange}
            placeholder="지역을 선택하세요"
            showSearch={true}
            maxHeight={500}
          />
        </DialogContent>
      </Dialog>
    </Box>
  )
}

export default MapView