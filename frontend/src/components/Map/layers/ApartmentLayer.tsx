import React, { useEffect, useRef, useState } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import { RootState } from '../../../store';
import { ApartmentComplex, ApartmentMarker } from '../../../types/apartment';
import { Coordinates } from '../../../types/map';
import { addMarkers, setLoading } from '../../../store/slices/mapSlice';
import { apartmentApi } from '../../../services/api';

interface ApartmentLayerProps {
  map: any; // Kakao Map instance
  visible: boolean;
  onMarkerClick?: (marker: any, data: ApartmentComplex) => void;
  clustering?: boolean;
}

const ApartmentLayer: React.FC<ApartmentLayerProps> = ({
  map,
  visible,
  onMarkerClick,
  clustering = true
}) => {
  const dispatch = useDispatch();
  const markersRef = useRef<any[]>([]);
  const clustererRef = useRef<any>(null);
  const [currentInfoWindow, setCurrentInfoWindow] = useState<any>(null);
  
  // Redux state에서 아파트 데이터 가져오기
  const { viewport } = useSelector((state: RootState) => state.map);
  const [apartments, setApartments] = useState<ApartmentComplex[]>([]);
  
  // API에서 아파트 데이터 로드
  useEffect(() => {
    const loadApartments = async () => {
      if (!visible) return;
      
      try {
        const result = await apartmentApi.searchApartments({
          limit: 100 // 지도에는 최대 100개만 표시
        });
        setApartments(result.data);
      } catch (error) {
        console.error('아파트 데이터 로드 실패:', error);
      }
    };

    loadApartments();
  }, [visible]);

  // 마커 스타일 설정
  const getMarkerStyle = (apartment: ApartmentComplex) => {
    const priceLevel = getPriceLevel(apartment.last_transaction_price || 0);
    
    return {
      normal: getMarkerImageUrl(priceLevel, 'normal'),
      hover: getMarkerImageUrl(priceLevel, 'hover'),
      selected: getMarkerImageUrl(priceLevel, 'selected')
    };
  };

  // 가격 레벨 계산 (억원 기준)
  const getPriceLevel = (price: number): 'low' | 'medium' | 'high' | 'premium' => {
    if (price < 50000) return 'low';        // 5억 미만
    if (price < 100000) return 'medium';    // 10억 미만
    if (price < 200000) return 'high';      // 20억 미만
    return 'premium';                       // 20억 이상
  };

  // 마커 이미지 URL 생성
  const getMarkerImageUrl = (priceLevel: string, state: string): string => {
    const colors = {
      low: '#4CAF50',      // 녹색
      medium: '#FF9800',   // 주황
      high: '#F44336',     // 빨강
      premium: '#9C27B0'   // 보라
    };

    const opacity = state === 'hover' ? '0.8' : state === 'selected' ? '1.0' : '0.9';
    
    // SVG 마커 생성
    const svg = `
      <svg width="24" height="36" viewBox="0 0 24 36" xmlns="http://www.w3.org/2000/svg">
        <path d="M12 0C5.4 0 0 5.4 0 12c0 9 12 24 12 24s12-15 12-24c0-6.6-5.4-12-12-12z" 
              fill="${colors[priceLevel as keyof typeof colors]}" 
              opacity="${opacity}"
              stroke="#ffffff" 
              stroke-width="2"/>
        <circle cx="12" cy="12" r="6" fill="#ffffff" opacity="0.9"/>
        <text x="12" y="16" text-anchor="middle" font-family="Arial" font-size="8" font-weight="bold" fill="${colors[priceLevel as keyof typeof colors]}">₩</text>
      </svg>
    `;

    return `data:image/svg+xml;base64,${btoa(unescape(encodeURIComponent(svg)))}`;
  };

  // 아파트 데이터로 마커 생성
  const createMarkers = async (apartments: ApartmentComplex[]) => {
    if (!map || !window.kakao?.maps) return;

    // 기존 마커 제거
    clearMarkers();

    const newMarkers: any[] = [];

    for (const apartment of apartments) {
      try {
        const position = new window.kakao.maps.LatLng(
          apartment.coordinates.lat,
          apartment.coordinates.lng
        );

        const markerStyle = getMarkerStyle(apartment);
        const markerImage = new window.kakao.maps.MarkerImage(
          markerStyle.normal,
          new window.kakao.maps.Size(24, 36),
          { offset: new window.kakao.maps.Point(12, 36) }
        );

        const marker = new window.kakao.maps.Marker({
          position,
          image: markerImage,
          title: apartment.name,
          clickable: true
        });

        // 인포윈도우 생성
        const infoWindowContent = `
          <div style="padding: 15px; min-width: 250px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
            <div style="font-weight: bold; font-size: 16px; margin-bottom: 8px; color: #1976d2;">
              ${apartment.name}
            </div>
            <div style="margin-bottom: 6px; color: #666; font-size: 13px;">
              📍 ${apartment.address.road || apartment.address.jibun || '주소 정보 없음'}
            </div>
            ${apartment.marketData?.lastTransactionPrice ? `
              <div style="margin-bottom: 6px; color: #d32f2f; font-weight: bold; font-size: 14px;">
                💰 ${(apartment.marketData.lastTransactionPrice / 10000).toFixed(1)}억원
              </div>
            ` : ''}
            ${apartment.details.constructionYear ? `
              <div style="margin-bottom: 4px; color: #555; font-size: 12px;">
                🏗️ ${apartment.details.constructionYear}년 건축
              </div>
            ` : ''}
            ${apartment.details.totalUnits ? `
              <div style="margin-bottom: 4px; color: #555; font-size: 12px;">
                🏠 총 ${apartment.details.totalUnits}세대
              </div>
            ` : ''}
            ${apartment.details.floors ? `
              <div style="color: #555; font-size: 12px;">
                🏢 ${apartment.details.floors}층
              </div>
            ` : ''}
          </div>
        `;

        const infoWindow = new window.kakao.maps.InfoWindow({
          content: infoWindowContent,
          removable: true
        });

        // 마커 이벤트 리스너
        window.kakao.maps.event.addListener(marker, 'click', () => {
          // 기존 열린 인포윈도우들 닫기
          if (currentInfoWindow) {
            currentInfoWindow.close();
          }
          
          // 새로운 인포윈도우 열기
          infoWindow.open(map, marker);
          setCurrentInfoWindow(infoWindow);
          
          onMarkerClick?.(marker, apartment);
        });

        // 마커 호버 효과
        window.kakao.maps.event.addListener(marker, 'mouseover', () => {
          const hoverImage = new window.kakao.maps.MarkerImage(
            markerStyle.hover,
            new window.kakao.maps.Size(28, 42),
            { offset: new window.kakao.maps.Point(14, 42) }
          );
          marker.setImage(hoverImage);
        });

        window.kakao.maps.event.addListener(marker, 'mouseout', () => {
          const normalImage = new window.kakao.maps.MarkerImage(
            markerStyle.normal,
            new window.kakao.maps.Size(24, 36),
            { offset: new window.kakao.maps.Point(12, 36) }
          );
          marker.setImage(normalImage);
        });

        newMarkers.push(marker);

        // 클러스터링 사용시
        if (clustering && clustererRef.current) {
          clustererRef.current.addMarker(marker);
        } else {
          marker.setMap(visible ? map : null);
        }

      } catch (error) {
        console.error('마커 생성 오류:', error);
      }
    }

    markersRef.current = newMarkers;
    
    // Redux store에 마커 정보 저장
    const markerData = newMarkers.map((marker, index) => ({
      id: apartments[index].id,
      position: apartments[index].coordinates,
      type: 'apartment' as const,
      data: apartments[index],
      marker
    }));
    
    dispatch(addMarkers(markerData));
  };

  // 클러스터러 초기화
  const initClusterer = () => {
    if (!map || !window.kakao?.maps || !clustering) return;

    const clusterer = new window.kakao.maps.MarkerClusterer({
      map: map,
      averageCenter: true,
      minLevel: 8, // 클러스터링 시작 레벨
      disableClickZoom: false,
      styles: [
        {
          width: '40px',
          height: '40px',
          background: 'rgba(51, 136, 255, 0.8)',
          borderRadius: '20px',
          color: '#fff',
          textAlign: 'center',
          fontWeight: 'bold',
          lineHeight: '40px'
        },
        {
          width: '50px',
          height: '50px', 
          background: 'rgba(255, 153, 0, 0.8)',
          borderRadius: '25px',
          color: '#fff',
          textAlign: 'center',
          fontWeight: 'bold',
          lineHeight: '50px'
        },
        {
          width: '60px',
          height: '60px',
          background: 'rgba(255, 51, 51, 0.8)',
          borderRadius: '30px',
          color: '#fff',
          textAlign: 'center',
          fontWeight: 'bold',
          lineHeight: '60px'
        }
      ]
    });

    clustererRef.current = clusterer;
  };

  // 마커 제거
  const clearMarkers = () => {
    if (clustererRef.current) {
      clustererRef.current.clear();
    }

    markersRef.current.forEach(marker => {
      marker.setMap(null);
    });
    
    markersRef.current = [];
  };

  // 레이어 표시/숨김 토글
  useEffect(() => {
    if (!markersRef.current.length) return;

    if (clustering && clustererRef.current) {
      if (visible) {
        clustererRef.current.setMap(map);
      } else {
        clustererRef.current.setMap(null);
      }
    } else {
      markersRef.current.forEach(marker => {
        marker.setMap(visible ? map : null);
      });
    }
  }, [visible, map, clustering]);

  // 지도와 아파트 데이터 변경시 마커 업데이트
  useEffect(() => {
    if (!map || !apartments.length) return;

    // 클러스터러 초기화 (클러스터링 사용시)
    if (clustering && !clustererRef.current) {
      initClusterer();
    }

    createMarkers(apartments);

    return () => {
      clearMarkers();
    };
  }, [map, apartments, clustering]);

  // 뷰포트 변경시 데이터 재로드 (API 연동시 사용)
  useEffect(() => {
    if (!map || !viewport.bounds) return;

    // TODO: API에서 현재 뷰포트 영역의 아파트 데이터 가져오기
    // fetchApartmentsInBounds(viewport.bounds);
  }, [viewport.bounds, map]);

  // 컴포넌트 언마운트시 정리
  useEffect(() => {
    return () => {
      clearMarkers();
      if (clustererRef.current) {
        clustererRef.current.clear();
      }
    };
  }, []);

  return null; // 이 컴포넌트는 UI를 렌더링하지 않음
};

export default ApartmentLayer;