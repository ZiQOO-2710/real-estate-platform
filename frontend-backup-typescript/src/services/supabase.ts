import { createClient } from '@supabase/supabase-js';

// Supabase 설정
const supabaseUrl = process.env.REACT_APP_SUPABASE_URL || '';
const supabaseKey = process.env.REACT_APP_SUPABASE_ANON_KEY || '';

if (!supabaseUrl || !supabaseKey) {
  console.error('Supabase URL과 Key가 환경변수에 설정되지 않았습니다.');
}

// Supabase 클라이언트 생성
export const supabase = createClient(supabaseUrl, supabaseKey);

// 아파트 데이터 타입 (DB 스키마에 맞춤)
export interface SupabaseApartment {
  id: string;
  complex_name: string;
  address_road?: string;
  address_jibun?: string;
  dong?: string;
  gu?: string;
  city?: string;
  latitude?: number;
  longitude?: number;
  total_units?: number;
  construction_year?: number;
  floors?: number;
  parking_ratio?: number;
  last_transaction_price?: number;
  last_transaction_date?: string;
  current_asking_price?: number;
  price_per_pyeong?: number;
  created_at?: string;
  updated_at?: string;
}

// 아파트 데이터 조회 함수
export const getApartments = async (limit: number = 100) => {
  try {
    const { data, error } = await supabase
      .from('apartment_complexes')
      .select('*')
      .limit(limit);

    if (error) {
      console.error('아파트 데이터 조회 오류:', error);
      throw error;
    }

    return data || [];
  } catch (error) {
    console.error('Supabase 연결 오류:', error);
    throw error;
  }
};

// 특정 지역의 아파트 데이터 조회
export const getApartmentsByRegion = async (
  city?: string, 
  gu?: string, 
  dong?: string,
  limit: number = 100
) => {
  try {
    let query = supabase.from('apartment_complexes').select('*');

    if (city) query = query.eq('city', city);
    if (gu) query = query.eq('gu', gu);
    if (dong) query = query.eq('dong', dong);

    const { data, error } = await query.limit(limit);

    if (error) {
      console.error('지역별 아파트 데이터 조회 오류:', error);
      throw error;
    }

    return data || [];
  } catch (error) {
    console.error('지역별 데이터 조회 오류:', error);
    throw error;
  }
};

// 좌표 범위로 아파트 데이터 조회 (지도 범위 기반)
export const getApartmentsByBounds = async (
  northEast: { lat: number; lng: number },
  southWest: { lat: number; lng: number },
  limit: number = 200
) => {
  try {
    const { data, error } = await supabase
      .from('apartment_complexes')
      .select('*')
      .gte('latitude', southWest.lat)
      .lte('latitude', northEast.lat)
      .gte('longitude', southWest.lng)
      .lte('longitude', northEast.lng)
      .not('latitude', 'is', null)
      .not('longitude', 'is', null)
      .limit(limit);

    if (error) {
      console.error('좌표 범위 아파트 데이터 조회 오류:', error);
      throw error;
    }

    return data || [];
  } catch (error) {
    console.error('좌표 범위 데이터 조회 오류:', error);
    throw error;
  }
};