/**
 * 좌표 기반 지도 API 라우트
 * 마이그레이션된 좌표 데이터를 활용한 지도 마커 API
 */

const express = require('express');
const { supabase1 } = require('../config/supabase');
const router = express.Router();

/**
 * 지도용 마커 데이터 조회 (좌표 기반)
 * GET /api/coordinates-map/markers
 */
router.get('/markers', async (req, res) => {
  try {
    const startTime = Date.now();
    
    const { 
      limit = 50, // 초기 로딩 최적화를 위해 기본값 50으로 줄임
      region = null,
      deal_type = null,
      min_amount = null,
      max_amount = null,
      bounds = null, // JSON string: {"north": 37.7, "south": 37.4, "east": 127.2, "west": 126.8}
      center_lat = null, // 중심점 위도
      center_lng = null, // 중심점 경도  
      radius_km = null   // 반경 (km)
    } = req.query;

    console.log('🗺️ 지도 마커 데이터 조회 시작');
    console.log('📍 요청 파라미터:', { limit, region, deal_type, min_amount, max_amount, bounds, center_lat, center_lng, radius_km });

    // 기본 쿼리 구성 (마이그레이션된 완전한 데이터만)
    let query = supabase1
      .from('apartment_transactions')
      .select(`
        apartment_name,
        region_name,
        legal_dong,
        road_name,
        deal_type,
        deal_year,
        deal_month,
        deal_day,
        deal_amount,
        area,
        floor,
        longitude,
        latitude,
        coordinate_source
      `)
      .eq('coordinate_source', 'molit_coordinates_2025')
      .not('longitude', 'is', null)
      .not('latitude', 'is', null)
      .not('apartment_name', 'is', null)
      .not('deal_amount', 'is', null);

    // 필터 적용
    if (region) {
      query = query.ilike('region_name', `%${region}%`);
    }

    if (deal_type && ['매매', '전세', '월세'].includes(deal_type)) {
      query = query.eq('deal_type', deal_type);
    }

    if (min_amount) {
      query = query.gte('deal_amount', parseInt(min_amount));
    }

    if (max_amount) {
      query = query.lte('deal_amount', parseInt(max_amount));
    }

    // 반경 필터링 (우선순위 - 성능 최적화)
    if (center_lat && center_lng && radius_km) {
      try {
        const centerLat = parseFloat(center_lat);
        const centerLng = parseFloat(center_lng);
        const radiusKm = parseFloat(radius_km);
        
        console.log('🎯 반경 필터 적용:', { centerLat, centerLng, radiusKm });
        
        // 대략적인 도수 기반 필터링 (1도 ≈ 111km)
        const latDelta = radiusKm / 111; // 즉시 위도 범위
        const lngDelta = radiusKm / (111 * Math.cos(centerLat * Math.PI / 180)); // 경도 범위
        
        query = query
          .gte('latitude', centerLat - latDelta)
          .lte('latitude', centerLat + latDelta)
          .gte('longitude', centerLng - lngDelta)
          .lte('longitude', centerLng + lngDelta);
          
      } catch (error) {
        console.warn('⚠️ 잘못된 반경 파라미터:', { center_lat, center_lng, radius_km });
      }
    }
    // 지도 경계 필터 (bounds) - 반경 필터가 없을 때만
    else if (bounds) {
      try {
        const boundsObj = typeof bounds === 'string' ? JSON.parse(bounds) : bounds;
        console.log('🎯 지도 경계 필터 적용:', boundsObj);
        
        query = query
          .gte('latitude', boundsObj.south)
          .lte('latitude', boundsObj.north)
          .gte('longitude', boundsObj.west)
          .lte('longitude', boundsObj.east);
      } catch (error) {
        console.warn('⚠️ 잘못된 bounds 파라미터:', bounds);
      }
    }

    // 정렬 및 제한
    query = query
      .order('deal_year', { ascending: false })
      .order('deal_month', { ascending: false })
      .limit(parseInt(limit));

    const { data: markers, error, count } = await query;

    if (error) {
      console.error('❌ 마커 데이터 조회 오류:', error);
      throw error;
    }

    const executionTime = Date.now() - startTime;

    console.log(`✅ 마커 데이터 조회 완료: ${markers.length}건 (${executionTime}ms)`);

    // 응답 데이터 후처리 (고유 ID 생성)
    const processedMarkers = markers.map((marker, index) => ({
      id: `${marker.apartment_name}_${marker.longitude}_${marker.latitude}_${marker.deal_year}-${marker.deal_month}-${marker.deal_day}_${marker.deal_amount}_${index}`,
      apartment_name: marker.apartment_name,
      region_name: marker.region_name,
      legal_dong: marker.legal_dong,
      road_name: marker.road_name,
      deal_type: marker.deal_type,
      deal_amount: marker.deal_amount,
      area: marker.area,
      floor: marker.floor,
      deal_date: `${marker.deal_year}-${marker.deal_month}-${marker.deal_day}`,
      coordinates: {
        lat: parseFloat(marker.latitude),
        lng: parseFloat(marker.longitude)
      },
      coordinate_source: marker.coordinate_source
    }));

    res.json({
      success: true,
      data: processedMarkers,
      meta: {
        count: processedMarkers.length,
        filters: {
          region: region || 'all',
          deal_type: deal_type || 'all',
          min_amount: min_amount || 'none',
          max_amount: max_amount || 'none',
          bounds: bounds ? (typeof bounds === 'string' ? JSON.parse(bounds) : bounds) : null,
          radius_filter: center_lat && center_lng && radius_km ? {
            center: { lat: parseFloat(center_lat), lng: parseFloat(center_lng) },
            radius_km: parseFloat(radius_km)
          } : null
        },
        execution_time_ms: executionTime,
        database_type: 'supabase_coordinates'
      }
    });

  } catch (error) {
    console.error('💥 지도 마커 조회 실패:', error);
    res.status(500).json({
      success: false,
      error: '지도 마커 데이터 조회 중 오류가 발생했습니다',
      message: error.message,
      database_type: 'supabase_coordinates'
    });
  }
});

/**
 * 특정 아파트 단지의 상세 거래 내역
 * GET /api/coordinates-map/complex/:name/transactions
 */
router.get('/complex/:name/transactions', async (req, res) => {
  try {
    const startTime = Date.now();
    const { name } = req.params;
    const { limit = 20, year, deal_type } = req.query;

    console.log(`🏢 단지 상세 조회: ${decodeURIComponent(name)}`);

    let query = supabase1
      .from('apartment_transactions')
      .select('*')
      .eq('apartment_name', decodeURIComponent(name))
      .not('longitude', 'is', null)
      .not('latitude', 'is', null);

    if (year) {
      query = query.eq('deal_year', parseInt(year));
    }

    if (deal_type && ['매매', '전세', '월세'].includes(deal_type)) {
      query = query.eq('deal_type', deal_type);
    }

    query = query
      .order('deal_year', { ascending: false })
      .order('deal_month', { ascending: false })
      .order('deal_day', { ascending: false })
      .limit(parseInt(limit));

    const { data: transactions, error } = await query;

    if (error) {
      console.error('❌ 단지 거래내역 조회 오류:', error);
      throw error;
    }

    // 통계 계산
    const stats = {
      total_count: transactions.length,
      avg_amount: transactions.length > 0 ? 
        transactions.reduce((sum, t) => sum + (t.deal_amount || 0), 0) / transactions.length : 0,
      deal_types: {}
    };

    // 거래 유형별 통계
    transactions.forEach(t => {
      if (t.deal_type) {
        stats.deal_types[t.deal_type] = (stats.deal_types[t.deal_type] || 0) + 1;
      }
    });

    const executionTime = Date.now() - startTime;

    console.log(`✅ 단지 거래내역 조회 완료: ${transactions.length}건 (${executionTime}ms)`);

    res.json({
      success: true,
      data: {
        apartment_name: decodeURIComponent(name),
        transactions: transactions,
        statistics: stats,
        meta: {
          execution_time_ms: executionTime,
          database_type: 'supabase_coordinates'
        }
      }
    });

  } catch (error) {
    console.error('💥 단지 거래내역 조회 실패:', error);
    res.status(500).json({
      success: false,
      error: '거래내역 조회 중 오류가 발생했습니다',
      message: error.message,
      database_type: 'supabase_coordinates'
    });
  }
});

/**
 * 지도 통계 정보 조회
 * GET /api/coordinates-map/stats
 */
router.get('/stats', async (req, res) => {
  try {
    const startTime = Date.now();
    const { region } = req.query;

    console.log('📊 지도 통계 조회 시작');

    // 총 개수 조회
    let countQuery = supabase1
      .from('apartment_transactions')
      .select('*', { count: 'exact', head: true })
      .not('longitude', 'is', null)
      .not('latitude', 'is', null);

    if (region) {
      countQuery = countQuery.ilike('region_name', `%${region}%`);
    }

    const { count: totalCount } = await countQuery;

    // 좌표 포함 데이터 개수
    const { count: coordCount } = await supabase1
      .from('apartment_transactions')
      .select('*', { count: 'exact', head: true })
      .not('longitude', 'is', null)
      .not('latitude', 'is', null);

    // 거래 유형별 통계
    let statsQuery = supabase1
      .from('apartment_transactions')
      .select('deal_type, deal_amount')
      .not('longitude', 'is', null)
      .not('latitude', 'is', null);

    if (region) {
      statsQuery = statsQuery.ilike('region_name', `%${region}%`);
    }

    const { data: dealData } = await statsQuery;

    // 통계 계산
    const dealTypeStats = {};
    let totalAmount = 0;
    let validAmountCount = 0;

    dealData.forEach(item => {
      if (item.deal_type) {
        dealTypeStats[item.deal_type] = (dealTypeStats[item.deal_type] || 0) + 1;
      }
      if (item.deal_amount && item.deal_amount > 0) {
        totalAmount += item.deal_amount;
        validAmountCount++;
      }
    });

    const avgAmount = validAmountCount > 0 ? Math.round(totalAmount / validAmountCount) : 0;

    const executionTime = Date.now() - startTime;

    console.log(`✅ 지도 통계 조회 완료 (${executionTime}ms)`);

    res.json({
      success: true,
      data: {
        overview: {
          total_transactions: totalCount,
          coordinate_transactions: coordCount,
          coordinate_coverage: coordCount > 0 ? ((coordCount / totalCount) * 100).toFixed(1) + '%' : '0%',
          avg_deal_amount: avgAmount,
          deal_type_distribution: dealTypeStats
        },
        meta: {
          region_filter: region || 'all',
          execution_time_ms: executionTime,
          database_type: 'supabase_coordinates'
        }
      }
    });

  } catch (error) {
    console.error('💥 지도 통계 조회 실패:', error);
    res.status(500).json({
      success: false,
      error: '통계 데이터 조회 중 오류가 발생했습니다',
      message: error.message,
      database_type: 'supabase_coordinates'
    });
  }
});

/**
 * 건강 상태 체크
 * GET /api/coordinates-map/health
 */
router.get('/health', async (req, res) => {
  try {
    const startTime = Date.now();

    // 간단한 데이터 조회로 DB 연결 확인
    const { count } = await supabase1
      .from('apartment_transactions')
      .select('*', { count: 'exact', head: true })
      .not('longitude', 'is', null)
      .not('latitude', 'is', null)
      .limit(1);

    const executionTime = Date.now() - startTime;

    res.json({
      success: true,
      message: '좌표 기반 지도 API 서비스 정상 작동',
      data: {
        coordinate_data_count: count,
        response_time_ms: executionTime,
        database_type: 'supabase_coordinates',
        timestamp: new Date().toISOString()
      }
    });

  } catch (error) {
    console.error('💥 건강 상태 체크 실패:', error);
    res.status(500).json({
      success: false,
      error: '서비스 상태 확인 중 오류가 발생했습니다',
      message: error.message,
      database_type: 'supabase_coordinates'
    });
  }
});

module.exports = router;