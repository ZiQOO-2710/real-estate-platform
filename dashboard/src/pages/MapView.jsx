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

// API 훅 및 유틸리티
import { useComplexes, useListings, useIntegratedComplexes, useIntegratedComplexDetails } from '../utils/api'
import { generateRandomCoords } from '../utils/kakaoMap'

// 새로운 컴포넌트들
import RegionTreeSelect from '../components/RegionTreeSelect'
import { getRegionCoords } from '../data/regions'

const MapView = () => {
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
  
  // 지역별 데이터 필터링을 위한 API 호출
  const complexParams = { 
    limit: 100,
    ...(selectedRegion && { region: selectedRegion })
  }
  const listingParams = { 
    limit: 50,
    ...(selectedRegion && { region: selectedRegion })
  }
  
  // 통합 데이터를 사용하여 세대수 필터링이 정확하게 작동하도록 함
  const { data: complexes, isLoading: complexesLoading, refetch: refetchComplexes } = useIntegratedComplexes(complexParams)
  const { data: listings, isLoading: listingsLoading, refetch: refetchListings } = useListings(listingParams)

  // 선택된 단지의 통합 데이터 조회
  const { data: integratedComplexDetails, isLoading: integratedLoading } = useIntegratedComplexDetails(
    selectedComplex?.id // 통합 데이터베이스의 id 사용
  )

  // 지역 변경시 데이터 새로고침
  useEffect(() => {
    if (refetchComplexes && refetchListings) {
      refetchComplexes()
      refetchListings()
    }
  }, [selectedRegion, refetchComplexes, refetchListings])

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

  // 마커 생성 및 표시
  useEffect(() => {
    if (!map || !complexes?.data || !window.kakao) {
      console.log('마커 생성 조건 확인:', {
        map: !!map,
        complexes: !!complexes?.data,
        kakao: !!window.kakao,
        dataLength: complexes?.data?.length
      })
      return
    }

    const createMarkers = async () => {
      try {
        console.log('🔄 마커 생성 시작:', complexes.data.length, '개 단지')
        
        // 기존 마커 제거
        markers.forEach(marker => marker.setMap(null))

        const newMarkers = []
        
        // 세대수 필터링 적용
        const filteredComplexes = complexes.data.filter(complex => {
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
        
        // 통합 데이터베이스에 저장된 좌표 사용
        const complexesWithCoords = filteredComplexes.slice(0, 50).map((complex, index) => {
          // 데이터베이스에 저장된 좌표 사용
          const coords = {
            lat: complex.latitude,
            lng: complex.longitude
          }
          
          const detectedRegion = complex.sigungu || complex.sido || '서울 중심가'
          
          console.log(`단지 ${complex.id} 좌표 사용:`, {
            name: complex.name,
            coords,
            region: detectedRegion
          })
          
          return {
            ...complex,
            coordinate: coords,
            detectedRegion
          }
        })

        console.log('📍 좌표 매핑 완료:', complexesWithCoords.length, '개 단지')

        // 마커 생성
        for (const complexData of complexesWithCoords) {
          try {
            const position = new window.kakao.maps.LatLng(
              complexData.coordinate.lat, 
              complexData.coordinate.lng
            )
            
            console.log(`마커 생성 중 (단지 ${complexData.id}):`, {
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
                    🏠 매물 ${complexData.listing_count || 0}개
                  </p>
                  ${complexData.completion_year ? 
                    `<p style="margin: 0 0 5px 0; color: #666; font-size: 12px;">
                      🏗️ ${complexData.completion_year}년 준공
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
            console.error(`❌ 마커 생성 실패 (단지 ${complexData.id}):`, markerError)
          }
        }

        setMarkers(newMarkers)
        console.log(`✅ ${newMarkers.length}개 마커 생성 완료`)
        
      } catch (error) {
        console.error('❌ 마커 생성 전체 실패:', error)
      }
    }

    createMarkers()
  }, [map, complexes, householdFilter])

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
  const hasNoData = selectedRegion && complexes?.data && complexes.data.length === 0

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
                    alignItems="center"
                  >
                    <CircularProgress />
                    <Typography variant="body1" sx={{ ml: 2 }}>
                      지도를 불러오는 중...
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
        <Box sx={{ width: 350 }}>
          <Card sx={{ height: '100%' }}>
            <CardContent>
              {/* 지역별 통계 */}
              <Box sx={{ mb: 3 }}>
                <Typography variant="h6" gutterBottom>
                  📊 {selectedRegion || '전체'} 지역 현황
                </Typography>
                <Stack direction="row" spacing={1} flexWrap="wrap" sx={{ mb: 2 }}>
                  <Chip 
                    icon={<Home />} 
                    label={`단지 ${complexes?.data?.length || 0}개`}
                    size="small" 
                    color="primary" 
                    variant="outlined"
                  />
                  <Chip 
                    icon={<AttachMoney />} 
                    label={`매물 ${listings?.data?.length || 0}개`}
                    size="small" 
                    color="secondary" 
                    variant="outlined"
                  />
                </Stack>
                {selectedRegion && (
                  <Typography variant="body2" color="text.secondary">
                    💡 {selectedRegion} 지역으로 필터링된 결과입니다
                  </Typography>
                )}
              </Box>
              
              {/* 선택된 단지 정보 */}
              {selectedComplex ? (
                <Box>
                  <Typography variant="h6" fontWeight="bold" gutterBottom sx={{ mb: 2 }}>
                    {selectedComplex.name || `단지 ${selectedComplex.id}`}
                  </Typography>
                  
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
                      
                      {integratedLoading ? (
                        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', py: 3 }}>
                          <CircularProgress size={24} sx={{ mr: 1 }} />
                          <Typography variant="body2">거래 데이터 로딩 중...</Typography>
                        </Box>
                      ) : integratedComplexDetails?.recent_transactions?.length > 0 ? (
                        <Box>
                          <Stack spacing={1} sx={{ mb: 2 }}>
                            <Typography variant="body2" color="text.secondary">
                              💰 평균 거래가: {integratedComplexDetails.price_analysis?.avg_transaction_price ? 
                                `${(integratedComplexDetails.price_analysis.avg_transaction_price / 10000).toFixed(0)}억원` : 
                                '정보 없음'}
                            </Typography>
                            <Typography variant="body2" color="text.secondary">
                              📊 총 {integratedComplexDetails.recent_transactions.length}건 거래
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
                              {integratedComplexDetails.recent_transactions.slice(0, 5).map((transaction, index) => (
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
                          
                          {integratedComplexDetails.recent_transactions.length > 5 && (
                            <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: 'block' }}>
                              * 최근 5건만 표시됨 (전체 {integratedComplexDetails.recent_transactions.length}건)
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
                      
                      {integratedLoading ? (
                        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', py: 3 }}>
                          <CircularProgress size={24} sx={{ mr: 1 }} />
                          <Typography variant="body2">매물 데이터 로딩 중...</Typography>
                        </Box>
                      ) : integratedComplexDetails?.current_listings?.length > 0 ? (
                        <Box>
                          <Stack spacing={1} sx={{ mb: 2 }}>
                            <Typography variant="body2" color="text.secondary">
                              💰 평균 매물가: {integratedComplexDetails.price_analysis?.avg_listing_price ? 
                                `${(integratedComplexDetails.price_analysis.avg_listing_price / 10000).toFixed(0)}억원` : 
                                '정보 없음'}
                            </Typography>
                            <Typography variant="body2" color="text.secondary">
                              🏠 총 {integratedComplexDetails.current_listings.length}건 매물
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
                              {integratedComplexDetails.current_listings.slice(0, 5).map((listing, index) => (
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
                          
                          {integratedComplexDetails.current_listings.length > 5 && (
                            <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: 'block' }}>
                              * 최근 5건만 표시됨 (전체 {integratedComplexDetails.current_listings.length}건)
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