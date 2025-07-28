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
import { 
  useMolitCoordinates,
  useIntegratedComplexDetails
} from '../utils/api'
import { useQueryClient } from 'react-query'

// 컴포넌트
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
  const [selectedTab, setSelectedTab] = useState(0)
  const [householdFilter, setHouseholdFilter] = useState('all')
  const [currentZoomLevel, setCurrentZoomLevel] = useState(8)
  const [openInfoWindow, setOpenInfoWindow] = useState(null)
  
  // 지역별 데이터 필터링을 위한 API 호출 파라미터
  const coordinateParams = {
    ...(selectedRegion && { region: selectedRegion }),
    limit: 100
  }
  
  // MOLIT 좌표 데이터 사용
  const { 
    data: molitCoordinatesData, 
    isLoading: coordinatesLoading, 
    isError: coordinatesError,
    refetch: refetchCoordinates
  } = useMolitCoordinates(coordinateParams)

  // 선택된 단지 상세 정보
  const { 
    data: complexDetails, 
    isLoading: complexDetailsLoading,
    refetch: refetchComplexDetails
  } = useIntegratedComplexDetails(selectedComplex?.complexId, {
    enabled: !!selectedComplex?.complexId
  })

  // 좌표 데이터 파싱
  const coordinateData = React.useMemo(() => {
    if (!molitCoordinatesData?.data) return []
    
    return molitCoordinatesData.data.map((item, index) => {
      // 좌표 파싱
      let coordinates = null
      if (item.latitude && item.longitude) {
        coordinates = {
          lat: parseFloat(item.latitude),
          lng: parseFloat(item.longitude)
        }
      }
      
      return {
        id: item.id || `molit-${index}`,
        apartment_name: item.apartment_name || '단지명 없음',
        region_name: item.region_name || item.sido_name || '지역정보없음',
        legal_dong: item.legal_dong || item.dong || '',
        coordinates,
        deal_type: item.deal_type || '매매',
        deal_amount: item.deal_amount || 0,
        area: item.area || item.area_exclusive || 0,
        floor: item.floor || '',
        deal_date: item.deal_date || '',
        completion_year: item.completion_year || null,
        total_households: item.total_households || null,
        total_buildings: item.total_buildings || null,
        source: 'molit'
      }
    }).filter(item => item.coordinates && 
                     item.coordinates.lat && 
                     item.coordinates.lng &&
                     item.coordinates.lat >= 33.0 && 
                     item.coordinates.lat <= 39.0 &&
                     item.coordinates.lng >= 124.0 && 
                     item.coordinates.lng <= 132.0)
  }, [molitCoordinatesData])

  // 카카오맵 초기화
  useEffect(() => {
    if (!window.kakao || !window.kakao.maps) {
      setMapError('카카오맵 스크립트를 로드할 수 없습니다.')
      setMapLoading(false)
      return
    }

    window.kakao.maps.load(() => {
      try {
        const container = mapRef.current
        if (!container) return

        const options = {
          center: new window.kakao.maps.LatLng(37.5665, 126.9780), // 서울시청
          level: 8,
          mapTypeId: window.kakao.maps.MapTypeId.ROADMAP
        }

        const mapInstance = new window.kakao.maps.Map(container, options)
        setMap(mapInstance)
        setMapLoading(false)

        // 줌 레벨 변경 이벤트
        window.kakao.maps.event.addListener(mapInstance, 'zoom_changed', () => {
          const level = mapInstance.getLevel()
          setCurrentZoomLevel(level)
        })

      } catch (error) {
        console.error('카카오맵 초기화 실패:', error)
        setMapError(`카카오맵 초기화 실패: ${error.message}`)
        setMapLoading(false)
      }
    })
  }, [])

  // 마커 생성
  useEffect(() => {
    if (!map || !coordinateData || coordinateData.length === 0) return

    // 기존 마커 제거
    markers.forEach(marker => marker.setMap(null))
    setMarkers([])

    const newMarkers = []

    coordinateData.slice(0, 50).forEach((complexData, index) => {
      try {
        if (!complexData.coordinates || !complexData.coordinates.lat || !complexData.coordinates.lng) {
          return
        }

        const position = new window.kakao.maps.LatLng(
          complexData.coordinates.lat, 
          complexData.coordinates.lng
        )
        
        const marker = new window.kakao.maps.Marker({
          position: position,
          map: map
        })

        // 정보창 생성
        const complexName = complexData.apartment_name || `단지 ${complexData.id}`
        
        const infoWindowContent = `
          <div style="padding: 15px; min-width: 280px; max-width: 320px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
            <h4 style="margin: 0 0 8px 0; color: #333; font-size: 16px; font-weight: bold;">
              ${complexName}
            </h4>
            <p style="margin: 0 0 5px 0; color: #2196F3; font-size: 13px; font-weight: bold;">
              📍 ${complexData.region_name} ${complexData.legal_dong}
            </p>
            <p style="margin: 0 0 5px 0; color: #666; font-size: 13px; font-weight: bold;">
              💰 거래유형: ${complexData.deal_type}
            </p>
            ${complexData.deal_amount ? 
              `<p style="margin: 0 0 5px 0; color: #f57c00; font-size: 12px; font-weight: bold;">
                💵 거래가: ${parseInt(complexData.deal_amount).toLocaleString()}만원
              </p>` : ''
            }
            ${complexData.area ? 
              `<p style="margin: 0 0 5px 0; color: #666; font-size: 12px;">
                🏢 전용면적: ${parseFloat(complexData.area).toFixed(1)}㎡ ${complexData.floor ? `(${complexData.floor}층)` : ''}
              </p>` : ''
            }
            ${complexData.deal_date ? 
              `<div style="background: #f8f9fa; padding: 8px; border-radius: 6px; margin: 8px 0;">
                <p style="margin: 0; color: #666; font-size: 11px; text-align: center;">
                  📅 거래일: ${complexData.deal_date}
                </p>
              </div>` : ''
            }
            <p style="margin: 8px 0 0 0; color: #999; font-size: 11px; text-align: center;">
              클릭하여 상세정보 보기
            </p>
          </div>
        `
        
        const infoWindow = new window.kakao.maps.InfoWindow({
          content: infoWindowContent
        })

        // 마커 클릭 이벤트
        window.kakao.maps.event.addListener(marker, 'click', () => {
          // 현재 열린 정보창이 같은 마커인지 확인
          const isCurrentlyOpen = openInfoWindow === complexData.id
          
          // 모든 정보창 닫기
          markers.forEach(m => m.infoWindow && m.infoWindow.close())
          setOpenInfoWindow(null)
          setSelectedComplex(null)
          
          // 다른 마커이거나 정보창이 닫혀있는 경우에만 새로 열기
          if (!isCurrentlyOpen) {
            infoWindow.open(map, marker)
            setOpenInfoWindow(complexData.id)
            setSelectedComplex({
              ...complexData,
              complexId: `${complexData.apartment_name}_${complexData.coordinates.lng}_${complexData.coordinates.lat}_${complexData.deal_date}_${complexData.deal_amount}_0`
            })
          }
        })

        marker.infoWindow = infoWindow
        marker.complexId = complexData.id
        newMarkers.push(marker)
        
      } catch (markerError) {
        console.error(`마커 생성 실패 (단지 ${complexData.id}):`, markerError)
      }
    })

    setMarkers(newMarkers)
    console.log(`마커 생성 완료: ${newMarkers.length}개`)
    
  }, [map, coordinateData, householdFilter])

  // 지역 필터 변경
  const handleRegionChange = (regionName, regionCoords = null) => {
    setSelectedRegion(regionName)
    setRegionDialogOpen(false)
    
    if (map && regionName && window.kakao) {
      const coords = regionCoords || getRegionCoords(regionName)
      if (coords) {
        const moveLatLon = new window.kakao.maps.LatLng(coords.lat, coords.lng)
        map.setCenter(moveLatLon)
        
        if (regionName.includes('특별시') || regionName.includes('광역시')) {
          map.setLevel(7)
        } else if (regionName.includes('도')) {
          map.setLevel(9)
        } else {
          map.setLevel(5)
        }
      }
    } else if (map && !regionName && window.kakao) {
      const moveLatLon = new window.kakao.maps.LatLng(37.5665, 126.9780)
      map.setCenter(moveLatLon)
      map.setLevel(8)
    }
  }

  // 지도 새로고침
  const handleMapRefresh = () => {
    if (map && window.kakao) {
      const moveLatLon = new window.kakao.maps.LatLng(37.4979, 127.0276) // 강남역
      map.setCenter(moveLatLon)
      map.setLevel(4)
      setSelectedRegion('')
      setSelectedComplex(null)
    }
  }

  const hasNoData = selectedRegion && coordinateData && coordinateData.length === 0

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
            <ButtonGroup size="small" variant="contained">
              <Button
                variant="contained"
                size="small"
                title="MOLIT 국토부 실거래 데이터"
                style={{ 
                  backgroundColor: '#ff5722',
                  borderColor: '#ff5722',
                  color: 'white'
                }}
              >
                MOLIT 국토부 ({coordinateData?.length || 0})
                {coordinatesLoading && (
                  <CircularProgress size={12} style={{ marginLeft: '4px', color: 'white' }} />
                )}
              </Button>
              <Button
                variant="text"
                size="small"
                onClick={refetchCoordinates}
                style={{ fontSize: '10px', minWidth: '40px' }}
              >
                새로고침
              </Button>
            </ButtonGroup>
          </Box>
        </Paper>
        
        {/* 줌 레벨 표시 */}
        <Paper sx={{ p: 1, backgroundColor: '#f5f5f5' }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <Typography variant="body2" color="text.secondary">
              줌: {currentZoomLevel}
            </Typography>
            <Typography variant="body2" color="text.secondary">|</Typography>
            <Typography variant="body2" color="text.secondary">
              {currentZoomLevel <= 6 ? '🌏 광역뷰' : 
               currentZoomLevel <= 8 ? '🏙️ 도시뷰' : 
               currentZoomLevel <= 10 ? '🏘️ 지역뷰' : '🏠 상세뷰'}
            </Typography>
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
          </Typography>
        </Alert>
      )}

      {/* 좌표 에러 표시 */}
      {coordinatesError && (
        <Alert severity="error" sx={{ mb: 2 }}>
          <Typography variant="body1">
            데이터 로딩 중 오류가 발생했습니다.
          </Typography>
          <Typography variant="body2" sx={{ mt: 1 }}>
            {coordinatesError.message || '알 수 없는 오류가 발생했습니다.'}
          </Typography>
          <Button 
            variant="contained" 
            color="primary" 
            onClick={refetchCoordinates}
            size="small"
            sx={{ mt: 1 }}
          >
            다시 시도
          </Button>
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
                  <Alert severity="error" sx={{ m: 2, position: 'absolute', top: 0, left: 0, right: 0, zIndex: 1000 }}>
                    <Typography variant="h6" gutterBottom>
                      🗺️ 지도 로드 실패
                    </Typography>
                    <Typography variant="body2" sx={{ mb: 2 }}>
                      {mapError}
                    </Typography>
                    <Button 
                      variant="contained" 
                      color="primary" 
                      onClick={() => window.location.reload()}
                      size="small"
                    >
                      🔄 페이지 새로고침
                    </Button>
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
                    label={`MOLIT 국토부 ${coordinateData?.length || 0}개`}
                    size="small" 
                    color="primary"
                    variant="outlined"
                    style={{ backgroundColor: '#fff3e0', color: '#ff5722', borderColor: '#ff5722' }}
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
                            key={`${complex.id || complex.apartment_name || 'unknown'}-${index}`} 
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
                              if (map && window.kakao && complex.coordinates?.lat && complex.coordinates?.lng) {
                                const moveLatLon = new window.kakao.maps.LatLng(complex.coordinates.lat, complex.coordinates.lng)
                                map.setCenter(moveLatLon)
                                map.setLevel(3)
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
                                    title={complex.apartment_name}
                                  >
                                    {complex.apartment_name || `단지 ${complex.id}`}
                                  </Typography>
                                  
                                  <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 0.5 }}>
                                    📍 {complex.region_name} {complex.legal_dong}
                                  </Typography>
                                  
                                  <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
                                    {complex.deal_type && (
                                      <Chip 
                                        label={complex.deal_type}
                                        size="small"
                                        variant="outlined"
                                        color="success"
                                        sx={{ fontSize: '10px', height: '20px' }}
                                      />
                                    )}
                                    {complex.deal_amount && (
                                      <Chip 
                                        label={`${parseInt(complex.deal_amount).toLocaleString()}만원`}
                                        size="small"
                                        color="warning"
                                        variant="outlined"
                                        sx={{ fontSize: '10px', height: '20px' }}
                                      />
                                    )}
                                    {complex.area && (
                                      <Chip 
                                        label={`${parseFloat(complex.area).toFixed(0)}㎡`}
                                        size="small"
                                        variant="outlined"
                                        sx={{ fontSize: '10px', height: '20px' }}
                                      />
                                    )}
                                  </Box>
                                </Box>
                                
                                <LocationOn 
                                  sx={{ 
                                    fontSize: 16, 
                                    color: 'warning.main',
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
              {selectedComplex && (
                <Box sx={{ flexGrow: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2 }}>
                    <Typography variant="h6" fontWeight="bold" sx={{ flexGrow: 1, minWidth: 0 }}>
                      {selectedComplex.apartment_name || `단지 ${selectedComplex.id}`}
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
                  
                  {/* 단지 기본 정보 */}
                  <Box sx={{ flexGrow: 1, overflow: 'auto' }}>
                    <Stack spacing={2}>
                      {selectedComplex.region_name && (
                        <Box>
                          <Typography variant="body2" color="text.secondary">
                            📍 지역
                          </Typography>
                          <Typography variant="body1" color="primary" fontWeight="medium">
                            {selectedComplex.region_name} {selectedComplex.legal_dong}
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

                      {selectedComplex.deal_type && (
                        <Box>
                          <Typography variant="body2" color="text.secondary">
                            💰 거래유형
                          </Typography>
                          <Typography variant="body1">
                            {selectedComplex.deal_type}
                          </Typography>
                        </Box>
                      )}

                      {selectedComplex.deal_amount && (
                        <Box>
                          <Typography variant="body2" color="text.secondary">
                            💵 거래가
                          </Typography>
                          <Typography variant="body1" color="warning.main" fontWeight="bold">
                            {parseInt(selectedComplex.deal_amount).toLocaleString()}만원
                          </Typography>
                        </Box>
                      )}

                      {selectedComplex.area && (
                        <Box>
                          <Typography variant="body2" color="text.secondary">
                            🏢 전용면적
                          </Typography>
                          <Typography variant="body1">
                            {parseFloat(selectedComplex.area).toFixed(1)}㎡ {selectedComplex.floor && `(${selectedComplex.floor}층)`}
                          </Typography>
                        </Box>
                      )}

                      {selectedComplex.deal_date && (
                        <Box>
                          <Typography variant="body2" color="text.secondary">
                            📅 거래일
                          </Typography>
                          <Typography variant="body1">
                            {selectedComplex.deal_date}
                          </Typography>
                        </Box>
                      )}
                      
                      {selectedComplex.coordinates && (
                        <Box>
                          <Typography variant="body2" color="text.secondary">
                            🗺️ 좌표
                          </Typography>
                          <Typography variant="caption" color="text.secondary">
                            위도: {selectedComplex.coordinates.lat.toFixed(4)}<br />
                            경도: {selectedComplex.coordinates.lng.toFixed(4)}
                          </Typography>
                        </Box>
                      )}
                    </Stack>
                  </Box>
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